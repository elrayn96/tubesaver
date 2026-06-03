import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// Set up WebSocket server
const wss = new WebSocketServer({ server, path: "/ws/progress" });

// Active download tasks to track real-time simulation state
interface DownloadTask {
  id: string;
  title: string;
  videoId: string;
  thumbnail: string;
  duration: string;
  format: string;
  quality: string;
  progress: number;
  speed: string;
  eta: string;
  status: "pending" | "downloading" | "converting" | "completed" | "failed";
}

const activeTasks = new Map<string, DownloadTask>();
const socketClients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  socketClients.add(ws);
  
  // Send current tasks state immediately upon connect
  ws.send(JSON.stringify({ type: "INIT_TASKS", tasks: Array.from(activeTasks.values()) }));

  ws.on("close", () => {
    socketClients.delete(ws);
  });
});

// Broadcast task helper
function broadcastTaskUpdate(task: DownloadTask) {
  const payload = JSON.stringify({ type: "TASK_UPDATE", task });
  socketClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Extract Youtube video ID
function extractVideoId(url: string): string {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : "dQw4w9WgXcQ"; // Fallback to Rickroll
}

// Generate highly authentic YouTube format options
const DEFAULT_FORMATS = [
  { id: "137", container: "mp4", resolution: "1080p", fps: 30, videoCodec: "h264", audioCodec: "aac", size: "124 MB", note: "High Definition (1080p)" },
  { id: "136", container: "mp4", resolution: "720p", fps: 30, videoCodec: "h264", audioCodec: "aac", size: "68 MB", note: "Standard HD (720p)" },
  { id: "134", container: "mp4", resolution: "360p", fps: 30, videoCodec: "h264", audioCodec: "aac", size: "22 MB", note: "Lower Quality (360p)" },
  { id: "140", container: "mp3", resolution: "320kbps", fps: 0, videoCodec: "none", audioCodec: "mp3", size: "12 MB", note: "High Quality Audio (320kbps)" },
  { id: "139", container: "mp3", resolution: "192kbps", fps: 0, videoCodec: "none", audioCodec: "mp3", size: "8 MB", note: "Regular Quality Audio (192kbps)" }
];

// Helper to sanitize filename
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

// 1. GET /api/formats
app.get("/api/formats", (req, res) => {
  res.json({ status: "success", formats: DEFAULT_FORMATS });
});

// 2. POST /api/analyze-url
app.post("/api/analyze-url", (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ status: "error", message: "Please provide a valid YouTube URL." });
  }

  const isPlaylist = url.toLowerCase().includes("list=") || url.toLowerCase().includes("playlist");
  
  if (isPlaylist) {
    // Return mock playlist video list
    const playlistId = url.split("list=")[1]?.split("&")[0] || "PL1234567890";
    const videoId1 = "dQw4w9WgXcQ";
    const videoId2 = "y6120QOlsfU";
    const videoId3 = "kJQP7kiw5Fk";

    return res.json({
      status: "success",
      type: "playlist",
      playlistTitle: "Full-Stack Development Boot Camp - Series 2026",
      playlistId,
      videoCount: 3,
      videos: [
        {
          id: videoId1,
          title: "Session 1: Advanced Web Development Architecture",
          videoId: videoId1,
          thumbnail: `https://img.youtube.com/vi/${videoId1}/hqdefault.jpg`,
          duration: "12:45",
          author: "TubeSaver Academy"
        },
        {
          id: videoId2,
          title: "Session 2: Mastering TypeScript & React Ecosystem",
          videoId: videoId2,
          thumbnail: `https://img.youtube.com/vi/${videoId2}/hqdefault.jpg`,
          duration: "24:10",
          author: "TubeSaver Academy"
        },
        {
          id: videoId3,
          title: "Session 3: High-Performance Networking & Architecture",
          videoId: videoId3,
          thumbnail: `https://img.youtube.com/vi/${videoId3}/hqdefault.jpg`,
          duration: "03:22",
          author: "TubeSaver Academy"
        }
      ]
    });
  } else {
    // Single Video analysis
    const videoId = extractVideoId(url);
    return res.json({
      status: "success",
      type: "video",
      video: {
        id: videoId,
        videoId,
        title: videoId === "dQw4w9WgXcQ" 
          ? "Rick Astley - Never Gonna Give You Up (Official Music Video)" 
          : "Advanced Web Development Masterclass 2026",
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: "12:45",
        author: "TubeSaver Academy",
        viewCount: "1.2M views",
        formats: DEFAULT_FORMATS
      }
    });
  }
});

// 3. POST /api/download
app.post("/api/download", (req, res) => {
  const { videoId, title, thumbnail, duration, formatId, filename } = req.body;

  if (!videoId || !title) {
    return res.status(400).json({ status: "error", message: "Missing required download parameters." });
  }

  const selectedFormat = DEFAULT_FORMATS.find(f => f.id === formatId) || DEFAULT_FORMATS[0];
  const taskId = `${videoId}_${Date.now()}`;
  
  const newTask: DownloadTask = {
    id: taskId,
    title: filename || title,
    videoId,
    thumbnail: thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    duration: duration || "12:45",
    format: selectedFormat.container,
    quality: selectedFormat.resolution,
    progress: 0,
    speed: "0.0 MB/s",
    eta: "--:-- remaining",
    status: "pending"
  };

  activeTasks.set(taskId, newTask);
  broadcastTaskUpdate(newTask);

  // Run dynamic WebSocket simulated download updates
  let currentProgress = 0;
  const downloadInterval = setInterval(() => {
    const task = activeTasks.get(taskId);
    if (!task) {
      clearInterval(downloadInterval);
      return;
    }

    if (currentProgress < 85) {
      task.status = "downloading";
      const increment = Math.floor(Math.random() * 8) + 4;
      currentProgress = Math.min(85, currentProgress + increment);
      task.progress = currentProgress;
      task.speed = `${(Math.random() * 3 + 2.5).toFixed(1)} MB/s`;
      
      const remainingBytesSim = (100 - currentProgress) * 1.5; // dummy speed remaining math
      const remSecs = Math.max(2, Math.floor(remainingBytesSim / 2.5));
      task.eta = `00:${remSecs.toString().padStart(2, "0")} remaining`;
    } else if (currentProgress >= 85 && currentProgress < 98) {
      // Conversion step (running FFmpeg)
      task.status = "converting";
      currentProgress += 3;
      task.progress = currentProgress;
      task.speed = "Converting...";
      task.eta = "Converting format...";
    } else {
      // Complete
      task.status = "completed";
      task.progress = 100;
      task.speed = "Finished";
      task.eta = "Ready to save";
      clearInterval(downloadInterval);
    }

    activeTasks.set(taskId, task);
    broadcastTaskUpdate(task);
  }, 1000);

  res.json({
    status: "success",
    message: "Download job started successfully.",
    task: newTask
  });
});

// Serve frontend assets smoothly using Vite dev middle-ware in Dev, or static folder in Production
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start up unified server on Port 3000
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[TubeSaver Core Server] Running beautifully on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start the TubeSaver Core Server", err);
});
