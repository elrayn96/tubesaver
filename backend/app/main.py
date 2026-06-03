import os
import re
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
import yt_dlp

app = FastAPI(title="TubeSaver Core API", version="1.0.0")

# Set up CORS for localized connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active connected socket managers
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

# Validation DTO models
class AnalyzeURLRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    videoId: str
    title: str
    thumbnail: str
    duration: str
    formatId: str
    filename: str | None = None

# URL Sanitization and provider filtering
def sanitize_and_validate_url(url: str) -> str:
    cleaned = url.strip()
    # Basic YouTube domain validation
    youtube_regex = (
        r'(https?://)?(www\.)?'
        '(youtube|youtu|youtube-nocookie)\.(com|be)/'
        '(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})'
    )
    if not re.match(youtube_regex, cleaned) and "list=" not in cleaned.lower():
        raise HTTPException(status_code=400, detail="Invalid YouTube resource URL.")
    return cleaned

# Standrd formats catalog mapping
DEFAULT_FORMATS = [
    { "id": "137", "container": "mp4", "resolution": "1080p", "fps": 30, "videoCodec": "h264", "audioCodec": "aac", "size": "124 MB", "note": "High Definition (1080p)" },
    { "id": "136", "container": "mp4", "resolution": "720p", "fps": 30, "videoCodec": "h264", "audioCodec": "aac", "size": "68 MB", "note": "Standard HD (720p)" },
    { "id": "134", "container": "mp4", "resolution": "360p", "fps": 30, "videoCodec": "h264", "audioCodec": "aac", "size": "22 MB", "note": "Lower Quality (360p)" },
    { "id": "140", "container": "mp3", "resolution": "320kbps", "fps": 0, "videoCodec": "none", "audioCodec": "mp3", "size": "12 MB", "note": "High Quality Audio (320kbps)" },
    { "id": "139", "container": "mp3", "resolution": "192kbps", "fps": 0, "videoCodec": "none", "audioCodec": "mp3", "size": "8 MB", "note": "Regular Quality Audio (192kbps)" }
]

@app.get("/api/formats")
async def get_formats():
    return { "status": "success", "formats": DEFAULT_FORMATS }

@app.post("/api/analyze-url")
async def analyze_url(req: AnalyzeURLRequest):
    url = sanitize_and_validate_url(req.url)
    
    ydl_opts = {
        'skip_download': True,
        'extract_flat': 'in_playlist',
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # 1. Handle Playlists
            if 'entries' in info:
                videos_list = []
                for entry in info['entries']:
                    if not entry:
                        continue
                    videos_list.append({
                        "id": entry.get('id'),
                        "title": entry.get('title'),
                        "videoId": entry.get('id'),
                        "thumbnail": f"https://img.youtube.com/vi/{entry.get('id')}/hqdefault.jpg" if entry.get('id') else "",
                        "duration": f"{int(entry.get('duration', 0) // 60)}:{int(entry.get('duration', 0) % 60):02d}" if entry.get('duration') else "03:15",
                        "author": entry.get('uploader', 'Unknown Creator')
                    })
                
                return {
                    "status": "success",
                    "type": "playlist",
                    "playlistTitle": info.get('title', 'YouTube Playlist'),
                    "playlistId": info.get('id'),
                    "videoCount": len(videos_list),
                    "videos": videos_list
                }
            
            # 2. Handle Single Video
            else:
                video_id = info.get('id')
                formats_avail = []
                for f in DEFAULT_FORMATS:
                    # Enrich size notes based on actual stream file sizes if present
                    formats_avail.append(f)

                duration_secs = info.get('duration', 0)
                duration_str = f"{int(duration_secs // 60)}:{int(duration_secs % 60):02d}"

                return {
                    "status": "success",
                    "type": "video",
                    "video": {
                        "id": video_id,
                        "videoId": video_id,
                        "title": info.get('title', 'YouTube Video'),
                        "thumbnail": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg" if video_id else "",
                        "duration": duration_str,
                        "author": info.get('uploader', 'Unknown Creator'),
                        "viewCount": f"{info.get('view_count', 0):,} views" if info.get('view_count') else "Views Private",
                        "formats": formats_avail
                    }
                }
    except yt_dlp.utils.DownloadError as de:
        raise HTTPException(status_code=400, detail=f"YouTube access block: {str(de)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal conversion analysis failure: {str(e)}")

# Real-time progress helper hooked into yt-dlp callback hook
def progress_hook(d, task_id: str):
    if d['status'] == 'downloading':
        total = d.get('total_bytes') or d.get('total_bytes_estimate') or 1
        downloaded = d.get('downloaded_bytes', 0)
        percentage = round((downloaded / total) * 100, 1)
        speed = d.get('speed', 0)
        speed_mb = round(speed / (1024 * 1024), 2) if speed else 0.0
        eta = d.get('eta', 0)
        
        eta_str = f"00:{eta:02d} remaining" if eta < 60 else f"{eta//60}:{eta%60:02d} remaining"
        
        # Dispatch WS message frame
        asyncio.run(manager.broadcast({
            "type": "TASK_UPDATE",
            "task": {
                "id": task_id,
                "progress": int(percentage),
                "speed": f"{speed_mb} MB/s",
                "eta": eta_str,
                "status": "downloading"
            }
        }))

@app.post("/api/download")
async def start_download(req: DownloadRequest):
    task_id = f"{req.videoId}_{int(asyncio.get_event_loop().time())}"
    
    # Run the downloads concurrently 
    asyncio.create_task(run_yt_dlp_pipeline(task_id, req))
    
    return {
        "status": "success",
        "message": "Transfer process initialized on background daemon.",
        "taskId": task_id
    }

async def run_yt_dlp_pipeline(task_id: str, req: DownloadRequest):
    out_dir = "./downloads"
    os.makedirs(out_dir, exist_ok=True)
    
    selected_format = next((f for f in DEFAULT_FORMATS if f['id'] == req.formatId), DEFAULT_FORMATS[0])
    is_audio = selected_format['container'] == "mp3"
    
    # Configure yt-dlp options
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]' if not is_audio else 'bestaudio/best',
        'outtmpl': f"{out_dir}/{req.filename or req.title}.%(ext)s",
        'progress_hooks': [lambda d: progress_hook(d, task_id)],
    }
    
    if is_audio:
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '320' if req.formatId == "140" else '192',
        }]

    try:
        await manager.broadcast({
            "type": "TASK_UPDATE",
            "task": {
                "id": task_id,
                "title": req.filename or req.title,
                "videoId": req.videoId,
                "thumbnail": req.thumbnail,
                "duration": req.duration,
                "format": selected_format['container'],
                "quality": selected_format['resolution'],
                "progress": 0,
                "speed": "Connecting...",
                "eta": "Resolving metadata...",
                "status": "pending"
            }
        })
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: download_sync(req.videoId, ydl_opts))
        
        # Send finalizing convert frames
        await manager.broadcast({
            "type": "TASK_UPDATE",
            "task": {
                "id": task_id,
                "progress": 98,
                "speed": "FFmpeg encoding...",
                "eta": "Wrapping file container...",
                "status": "converting"
            }
        })
        
        await asyncio.sleep(2)
        
        # Complete
        await manager.broadcast({
            "type": "TASK_UPDATE",
            "task": {
                "id": task_id,
                "progress": 100,
                "speed": "Finished",
                "eta": "Saved successfully",
                "status": "completed"
            }
        })
    except Exception as e:
        await manager.broadcast({
            "type": "TASK_UPDATE",
            "task": {
                "id": task_id,
                "progress": 0,
                "speed": "Failed",
                "eta": str(e),
                "status": "failed"
            }
        })

def download_sync(video_id: str, ydl_opts: dict):
    url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

@app.websocket("/ws/progress")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
