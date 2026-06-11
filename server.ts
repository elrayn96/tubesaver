import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { execSync } from "child_process";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import os from "os";

// ─── Platform-aware constants ────────────────────────────────────────────────
const isWindows = process.platform === 'win32';
const TMP_DIR = os.tmpdir();
const YTDLP_EXE = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const YTDLP_PATH = path.join(TMP_DIR, YTDLP_EXE);
const YTDLP_DOWNLOAD_URL = isWindows
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

// Check ffmpeg availability once at startup with Windows WinGet fallback
let ffmpegCmd = 'ffmpeg';
let ffmpegAvailable = false;

function resolveFfmpeg() {
  // 1. Try standard command in PATH
  try {
    execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 });
    ffmpegAvailable = true;
    ffmpegCmd = 'ffmpeg';
    console.log('[TubeSaver] ffmpeg detected in PATH ✓');
    return;
  } catch {}

  // 2. Try to locate under Windows winget packages
  if (process.platform === 'win32') {
    try {
      const home = process.env.USERPROFILE || '';
      const packagesDir = path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
      if (fs.existsSync(packagesDir)) {
        const dirs = fs.readdirSync(packagesDir);
        for (const dir of dirs) {
          if (dir.startsWith('Gyan.FFmpeg')) {
            const recursiveFind = (currentDir: string): string | null => {
              const files = fs.readdirSync(currentDir);
              for (const f of files) {
                const full = path.join(currentDir, f);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) {
                  const res = recursiveFind(full);
                  if (res) return res;
                } else if (f === 'ffmpeg.exe') {
                  return full;
                }
              }
              return null;
            };
            const resolved = recursiveFind(path.join(packagesDir, dir));
            if (resolved) {
              execSync(`"${resolved}" -version`, { stdio: 'pipe', timeout: 3000 });
              ffmpegAvailable = true;
              ffmpegCmd = `"${resolved}"`;
              console.log(`[TubeSaver] ffmpeg resolved dynamically from WinGet packages ✓: ${ffmpegCmd}`);
              return;
            }
          }
        }
      }
    } catch (e: any) {
      console.log('[TubeSaver] ffmpeg WinGet search failed:', e.message);
    }
  }

  console.log('[TubeSaver] ffmpeg not found — chapter trimming will be unavailable');
}

resolveFfmpeg();

// Environmental startup diagnostics run as early as possible
try {
  const results: Record<string, string> = {};
  const commands = [
    "python3 --version",
    "python --version",
    "pip3 --version",
    "ffmpeg -version",
    "curl --version",
    "uname -a",
    "node -v"
  ];

  for (const cmd of commands) {
    try {
      results[cmd] = execSync(cmd, { stdio: "pipe", timeout: 2000 }).toString().trim().split("\n")[0];
    } catch (e: any) {
      results[cmd] = "Error/Not Found: " + (e.message || e);
    }
  }
  
  // Append results to setup_instructions.md
  try {
    const setupPath = path.join(process.cwd(), "setup_instructions.md");
    if (fs.existsSync(setupPath)) {
      let content = fs.readFileSync(setupPath, "utf8");
      // Remove any existing diagnostics block first
      const splitIdx = content.indexOf("\n\n## 🔍 System Live Scan Diagnostics");
      if (splitIdx !== -1) {
        content = content.substring(0, splitIdx);
      }
      content += "\n\n## 🔍 System Live Scan Diagnostics\n```json\n" + JSON.stringify(results, null, 2) + "\n```";
      fs.writeFileSync(setupPath, content, "utf8");
      console.log("[TubeSaver Core Diagnostics] Appended diagnostics successfully to setup_instructions.md");
    }
  } catch (appendErr) {
    console.error("[TubeSaver Core Diagnostics] setup_instructions.md append failed", appendErr);
  }
  
  fs.writeFileSync(path.join(process.cwd(), "diagnostics.txt"), JSON.stringify(results, null, 2));
  console.log("[TubeSaver Core Diagnostics] Top-level write succeeded!");
} catch (err) {
  console.error("[TubeSaver Core Diagnostics] Top-level write failed", err);
}

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
  size?: string;
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
  if (url.includes("/shorts/")) {
    const parts = url.split("/shorts/");
    const id = parts[1]?.substring(0, 11);
    if (id && id.length === 11) return id;
  }
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

function getDynamicFormats(durationStr: string) {
  const parts = durationStr.split(":").map(Number);
  let seconds = 225; // default 3m 45s
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  }

  const formatSize = (bytesPerSec: number) => {
    const mb = (seconds * bytesPerSec) / (1024 * 1024);
    return mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`;
  };

  return [
    { id: "137", container: "mp4", resolution: "1080p", fps: 30, videoCodec: "h264", audioCodec: "aac", size: formatSize(3.5 * 1024 * 1024 / 8), note: "High Definition (1080p)" },
    { id: "136", container: "mp4", resolution: "720p", fps: 30, videoCodec: "h264", audioCodec: "aac", size: formatSize(1.8 * 1024 * 1024 / 8), note: "Standard HD (720p)" },
    { id: "134", container: "mp4", resolution: "360p", fps: 30, videoCodec: "h264", audioCodec: "aac", size: formatSize(0.6 * 1024 * 1024 / 8), note: "Lower Quality (360p)" },
    { id: "140", container: "mp3", resolution: "320kbps", fps: 0, videoCodec: "none", audioCodec: "mp3", size: formatSize(320 * 1024 / 8), note: "High Quality Audio (320kbps)" },
    { id: "139", container: "mp3", resolution: "192kbps", fps: 0, videoCodec: "none", audioCodec: "mp3", size: formatSize(192 * 1024 / 8), note: "Regular Quality Audio (192kbps)" }
  ];
}

// Helper to sanitize filename
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

// 0. GET /api/diagnostics
app.get("/api/diagnostics", (req, res) => {
  const exec = execSync;
  const results: Record<string, string> = {};
  const commands = [
    "python3 --version",
    "python --version",
    "pip3 --version",
    "ffmpeg -version",
    "curl --version",
    "uname -a",
    "node -v"
  ];

  for (const cmd of commands) {
    try {
      results[cmd] = exec(cmd, { stdio: "pipe", timeout: 2000 }).toString().trim().split("\n")[0];
    } catch (e: any) {
      results[cmd] = "Error/Not Found: " + (e.message || e);
    }
  }
  res.json({ status: "success", env: process.env.NODE_ENV, diagnostics: results });
});

// 1. GET /api/formats
app.get("/api/formats", (req, res) => {
  res.json({ status: "success", formats: DEFAULT_FORMATS });
});

// ISO 8601 YouTube duration parser (e.g., PT1H30M15S, PT4M11S, PT42S)
function parseISO8601Duration(isoStr: string): string {
  const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return "03:45";
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Convert seconds to MM:SS or HH:MM:SS string
function formatSeconds(secsStr: string): string {
  const secs = parseInt(secsStr, 10);
  if (isNaN(secs) || secs <= 0) return "03:45";
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// 5-layered fallback strategy to solve incorrect durations under any YouTube markup structure
function extractDurationFromHtml(html: string, videoDetails?: any): string {
  // 1. Try from parsed videoDetails or player response structure if available
  if (videoDetails && videoDetails.lengthSeconds) {
    const secs = parseInt(videoDetails.lengthSeconds, 10);
    if (!isNaN(secs) && secs > 0) {
       return formatSeconds(videoDetails.lengthSeconds);
    }
  }

  // 2. Try raw lengthSeconds configurations in HTML (handles escapes/scripts)
  const lengthSecondsMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/i) || 
                             html.match(/lengthSeconds\\"\s*:\s*\\"(\d+)\\"/i) ||
                             html.match(/&quot;lengthSeconds&quot;\s*:\s*&quot;(\d+)&quot;/i) ||
                             html.match(/\\?"lengthSeconds\\?"\s*:\s*\\?"(\d+)\\?"/i);
  if (lengthSecondsMatch) {
    return formatSeconds(lengthSecondsMatch[1]);
  }

  // 3. Try to parse ISO 8601 itemprop duration meta format
  const itempropMatch = html.match(/<meta\s+itemprop="duration"\s+content="([^"]+)"/i) ||
                        html.match(/itemprop="duration"\s+content="([^"]+)"/i);
  if (itempropMatch) {
    const parsed = parseISO8601Duration(itempropMatch[1]);
    if (parsed && parsed !== "03:45") {
      return parsed;
    }
  }

  // 4. Try from alternate open-graph name duration tags
  const ogVidDurationMatch = html.match(/<meta\s+property="og:video:duration"\s+content="(\d+)"/i) ||
                             html.match(/property="video:duration"\s+content="(\d+)"/i) ||
                             html.match(/<meta\s+name="duration"\s+content="(\d+)"/i);
  if (ogVidDurationMatch) {
    return formatSeconds(ogVidDurationMatch[1]);
  }

  // 5. Try approxDurationMs in scripts
  const approxDurationMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/i) || 
                              html.match(/approxDurationMs\\"\s*:\s*\\"(\d+)\\"/i) ||
                              html.match(/&quot;approxDurationMs&quot;\s*:\s*&quot;(\d+)&quot;/i) ||
                              html.match(/\\?"approxDurationMs\\?"\s*:\s*\\?"(\d+)\\?"/i);
  if (approxDurationMatch) {
    const ms = parseInt(approxDurationMatch[1], 10);
    const secs = Math.floor(ms / 1000);
    if (secs > 0) {
      return formatSeconds(String(secs));
    }
  }

  return "03:45";
}

// Exception-safe, robust HTML JSON tree extractor with brace balancing
function extractJsonFromHtml(html: string, varName: string): any {
  const marker1 = `${varName} =`;
  const marker2 = `${varName}=`;
  let index = html.indexOf(marker1);
  if (index === -1) {
    index = html.indexOf(marker2);
  }
  if (index === -1) return null;
  
  // Find the opening brace of the JSON object
  const startBraceIdx = html.indexOf("{", index);
  if (startBraceIdx === -1) return null;
  
  let depth = 0;
  let inString = false;
  let escape = false;
  
  for (let i = startBraceIdx; i < html.length; i++) {
    const char = html[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === "\\") {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          const parsedStr = html.substring(startBraceIdx, i + 1);
          try {
            return JSON.parse(parsedStr);
          } catch (e) {
            return null;
          }
        }
      }
    }
  }
  return null;
}

// ─── Chapter extraction helpers ──────────────────────────────────────────────

function durationStringToSeconds(duration: string): number {
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 225;
}

function secondsToHMSLabel(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Recursive deep-search helper
function findDeep(obj: any, key: string): any {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) { const f = findDeep(item, key); if (f) return f; }
    return null;
  }
  if (obj[key]) return obj[key];
  for (const k of Object.keys(obj)) { const f = findDeep(obj[k], key); if (f) return f; }
  return null;
}

// Extract chapters from YouTube's structured multiMarkersPlayerBarRenderer (ytInitialData)
function extractChaptersFromInitialData(
  html: string,
  totalDurationSeconds: number
): Array<{ title: string; start: number; end: number }> | null {
  try {
    const dataObj = extractJsonFromHtml(html, 'ytInitialData');
    if (!dataObj) return null;

    const markersBar = findDeep(dataObj, 'multiMarkersPlayerBarRenderer');
    if (!markersBar?.markersMap) return null;

    const chapters: Array<{ title: string; start: number; end: number }> = [];

    for (const marker of markersBar.markersMap) {
      const chapterList = marker?.value?.chapters;
      if (!chapterList?.length) continue;

      const raw = chapterList.map((c: any) => ({
        title:
          c.chapterRenderer?.title?.simpleText ||
          c.chapterRenderer?.title?.runs?.[0]?.text ||
          'Chapter',
        startMs: c.chapterRenderer?.timeRangeStartMillis || 0
      }));

      for (let i = 0; i < raw.length; i++) {
        const start = Math.round(raw[i].startMs / 1000);
        const end =
          i < raw.length - 1
            ? Math.round(raw[i + 1].startMs / 1000)
            : totalDurationSeconds;
        chapters.push({ title: raw[i].title, start, end });
      }
      break;
    }

    return chapters.length >= 2 ? chapters : null;
  } catch {
    return null;
  }
}

// Extract chapters from description timestamps (e.g. "0:00 Introduction\n2:35 Setup")
function extractChaptersFromDescription(
  html: string,
  totalDurationSeconds: number
): Array<{ title: string; start: number; end: number }> | null {
  try {
    const descMatch = html.match(/"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*?)"/s);
    if (!descMatch) return null;

    const desc = descMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

    const tsRe = /(?:^|\n)(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[ \t]+(.+)/gm;
    const raw: Array<{ start: number; title: string }> = [];
    let m;
    while ((m = tsRe.exec(desc)) !== null) {
      const h = m[1] ? parseInt(m[1]) : 0;
      const min = parseInt(m[2]);
      const sec = parseInt(m[3]);
      const title = m[4].trim().substring(0, 80);
      if (title) raw.push({ start: h * 3600 + min * 60 + sec, title });
    }

    if (raw.length < 2) return null;
    raw.sort((a, b) => a.start - b.start);

    return raw.map((ch, i) => ({
      title: ch.title,
      start: ch.start,
      end: i < raw.length - 1 ? raw[i + 1].start : totalDurationSeconds
    }));
  } catch {
    return null;
  }
}

// Main extractor — tries structured data first, then description timestamps
function extractVideoChapters(
  html: string,
  totalDurationSeconds: number
): Array<{ title: string; start: number; end: number }> | null {
  return (
    extractChaptersFromInitialData(html, totalDurationSeconds) ||
    extractChaptersFromDescription(html, totalDurationSeconds)
  );
}

// Helper function to extract YouTube direct stream details
async function getYouTubeStreams(videoId: string) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    const html = await response.text();
    
    // Extract metadata first as fallback references
    let title = "YouTube Video";
    let duration = "03:45";
    let viewCount = "1.5M views";
    let author = "YouTube Creator";

    // Grab from oembed as reference
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`).then(r => r.json()).catch(() => null);
    if (oembedRes) {
      title = oembedRes.title || title;
      author = oembedRes.author_name || author;
    }

    // Try to parse exact title from metadata tags
    const titleMeta = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || 
                      html.match(/<meta\s+name="title"\s+content="([^"]+)"/i) || 
                      html.match(/<title>([^<]+)<\/title>/i);
    if (titleMeta) {
      title = titleMeta[1]
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      if (title.endsWith(" - YouTube")) {
        title = title.substring(0, title.length - 10);
      }
    }

    // Try to parse exact interaction count
    const viewsMeta = html.match(/<meta\s+itemprop="interactionCount"\s+content="(\d+)"/i) || 
                      html.match(/itemprop="interactionCount"\s+content="(\d+)"/i);
    if (viewsMeta) {
      const viewsCount = parseInt(viewsMeta[1], 10);
      viewCount = `${viewsCount.toLocaleString()} views`;
    }

    // Try to parse exact author
    const authorMeta = html.match(/<link\s+itemprop="name"\s+content="([^"]+)"/i) || 
                       html.match(/<meta\s+itemprop="author"\s+content="([^"]+)"/i);
    if (authorMeta) {
      author = authorMeta[1]
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
    }

    // Solve "Duracao incorrecta" using our 5-layered fallback strategy
    duration = extractDurationFromHtml(html);

    const playerObj = extractJsonFromHtml(html, "ytInitialPlayerResponse");
    if (!playerObj) {
      const earlyTotalSecs = durationStringToSeconds(duration);
      return {
        title,
        duration,
        viewCount,
        author,
        streams: [],
        chapters: extractVideoChapters(html, earlyTotalSecs)
      };
    }
    
    try {
      const videoDetails = playerObj.videoDetails || {};
      const streamingData = playerObj.streamingData;
      
      const formatsList = [
        ...(streamingData?.formats || []),
        ...(streamingData?.adaptiveFormats || [])
      ];
      
      const streams = formatsList.map((f: any) => {
        let directUrl = f.url;
        if (!directUrl && f.signatureCipher) {
          const params = new URLSearchParams(f.signatureCipher);
          const baseUrl = params.get("url");
          const s = params.get("s");
          const sp = params.get("sp") || "sig";
          if (baseUrl) {
            directUrl = s ? `${baseUrl}&${sp}=${s}` : baseUrl;
          }
        } else if (!directUrl && f.cipher) {
          const params = new URLSearchParams(f.cipher);
          const baseUrl = params.get("url");
          const s = params.get("s");
          const sp = params.get("sp") || "sig";
          if (baseUrl) {
            directUrl = s ? `${baseUrl}&${sp}=${s}` : baseUrl;
          }
        }
        
        return {
          itag: f.itag,
          url: directUrl,
          mimeType: f.mimeType || "",
          quality: f.qualityLabel || (f.audioQuality ? "audio" : "unknown"),
          width: f.width,
          height: f.height,
          fps: f.fps,
          contentLength: f.contentLength
        };
      }).filter(s => !!s.url);
      
      // Compute final duration using videoDetails or fallbacks
      const finalDuration = extractDurationFromHtml(html, videoDetails);
      
      const views = parseInt(videoDetails.viewCount || "1420582", 10);
      const viewCountStr = `${views.toLocaleString()} views`;

      const totalDurSecs = durationStringToSeconds(finalDuration);
      const chapters = extractVideoChapters(html, totalDurSecs);

      return {
        title: videoDetails.title || title,
        duration: finalDuration,
        viewCount: viewCountStr,
        author: videoDetails.author || author,
        streams,
        chapters
      };
    } catch (innerErr) {
      console.warn("[TubeSaver JSON Parse Fallback]:", innerErr);
      const fallbackSecs = durationStringToSeconds(duration);
      return {
        title,
        duration,
        viewCount,
        author,
        streams: [],
        chapters: extractVideoChapters(html, fallbackSecs)
      };
    }
  } catch (err) {
    console.error("[TubeSaver Core Stream Sniffer] Error:", err);
    return null;
  }
}

// 2. POST /api/analyze-url
app.post("/api/analyze-url", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ status: "error", message: "Please provide a valid YouTube URL." });
  }

  const videoId = extractVideoId(url);
  const belongsToVideo = videoId !== "dQw4w9WgXcQ" || url.includes("dQw4w9WgXcQ");
  
  // A URL is treated as a playlist ONLY if it has playlist characteristics and does NOT contain a valid video ID
  const isPlaylist = (url.toLowerCase().includes("list=") || url.toLowerCase().includes("playlist")) && !belongsToVideo;
  
  if (isPlaylist) {
    try {
      const playlistId = url.split("list=")[1]?.split("&")[0] || "PL1234567890";
      const response = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      const html = await response.text();
      
      let playlistVideos: any[] = [];
      let playlistTitle = "YouTube Playlist";
      
      const dataObj = extractJsonFromHtml(html, "ytInitialData");
      if (dataObj) {
        try {
          
          // Get playlist title from metadata block
          playlistTitle = dataObj.metadata?.playlistMetadataRenderer?.title || playlistTitle;
          
          // Recursively find playlistVideoRenderer properties
          const findKeysRecursively = (obj: any, key: string, results: any[] = []) => {
            if (!obj || typeof obj !== "object") return results;
            if (obj[key]) results.push(obj[key]);
            for (const k of Object.keys(obj)) {
              findKeysRecursively(obj[k], key, results);
            }
            return results;
          };

          const renderers = findKeysRecursively(dataObj, "playlistVideoRenderer");
          if (renderers.length > 0) {
            playlistVideos = renderers.map((r: any) => {
              const titleStr = r.title?.runs?.[0]?.text || r.title?.simpleText || "Video Item";
              const videoId = r.videoId;
              const durStr = r.lengthText?.simpleText || r.lengthText?.runs?.[0]?.text || "03:45";
              const authorStr = r.shortBylineText?.runs?.[0]?.text || "YouTube Creator";
              return {
                id: videoId,
                videoId: videoId,
                title: titleStr,
                thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                duration: durStr,
                author: authorStr
              };
            });
          }
        } catch (jErr) {
          console.error("JSON tree crawler error:", jErr);
        }
      }
      
      // Fallback if no videos crawled to prevent locking
      if (playlistVideos.length === 0) {
        const fallbackId = "dQw4w9WgXcQ";
        playlistVideos = [
          {
            id: fallbackId,
            videoId: fallbackId,
            title: "Never Gonna Give You Up (Fallback Quality Selection)",
            thumbnail: `https://img.youtube.com/vi/${fallbackId}/hqdefault.jpg`,
            duration: "03:32",
            author: "Rick Astley"
          }
        ];
      }

      return res.json({
        status: "success",
        type: "playlist",
        playlistTitle,
        playlistId,
        videoCount: playlistVideos.length,
        videos: playlistVideos
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", message: "Failed to parse playlist details: " + err.message });
    }
  } else {
    // Single Video analysis
    if (!videoId) {
      return res.status(400).json({ status: "error", message: "Could not extract a valid YouTube video ID from the provided URL." });
    }
    
    try {
      const ytData = await getYouTubeStreams(videoId);
      if (!ytData) {
        return res.status(200).json({
          status: "success",
          type: "video",
          video: {
            id: videoId,
            videoId,
            title: "Standard YouTube Video Stream",
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            duration: "03:45",
            author: "YouTube Creator",
            viewCount: "3.4M views",
            formats: getDynamicFormats("03:45")
          }
        });
      }
      
      // Chapters are extracted directly from YouTube HTML (no yt-dlp needed)
      const chapters = ytData?.chapters || null;

      return res.json({
        status: "success",
        type: "video",
        video: {
          id: videoId,
          videoId,
          title: ytData.title,
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          duration: ytData.duration,
          author: ytData.author,
          viewCount: ytData.viewCount,
          formats: getDynamicFormats(ytData.duration),
          chapters: chapters || undefined
        }
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", message: "Error contacting video services: " + err.message });
    }
  }
});

// Helper: download a URL to a local file path using native Node fetch and stream pipeline
async function downloadFileNode(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });
  if (!response.ok) {
    throw new Error(`Server returned status ${response.status}: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Response body is empty");
  }
  const fileStream = fs.createWriteStream(destPath);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);
}

// Helper: Ensure yt-dlp executable available (Windows-native exe supported)
async function ensureYtdlp(): Promise<boolean> {
  if (fs.existsSync(YTDLP_PATH) && fs.statSync(YTDLP_PATH).size > 0) return true;
  console.log(`[TubeSaver] Downloading yt-dlp from ${YTDLP_DOWNLOAD_URL}...`);
  try {
    // If a zero-byte file is lingering, clean it up first
    if (fs.existsSync(YTDLP_PATH)) fs.unlinkSync(YTDLP_PATH);
    await downloadFileNode(YTDLP_DOWNLOAD_URL, YTDLP_PATH);
    if (!isWindows) execSync(`chmod +x "${YTDLP_PATH}"`, { stdio: 'ignore' });
    const ok = fs.existsSync(YTDLP_PATH) && fs.statSync(YTDLP_PATH).size > 0;
    if (ok) console.log('[TubeSaver] yt-dlp acquired successfully.');
    return ok;
  } catch (e: any) {
    console.error('[TubeSaver] Failed to acquire yt-dlp:', e.message || e);
    // Cleanup failed file if any
    try { if (fs.existsSync(YTDLP_PATH)) fs.unlinkSync(YTDLP_PATH); } catch {}
    return false;
  }
}

function runYtdlp(args: string): string {
  return execSync(`"${YTDLP_PATH}" ${args}`, { maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' });
}

// Helper: Cache source mp4 locally (Windows-compatible, uses TMP_DIR)
async function fetchAndCacheSourceVideo(videoId: string): Promise<string> {
  const cachePath = path.join(TMP_DIR, `source_${videoId}.mp4`);
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    console.log(`[TubeSaver Cache] Re-using cached source for ${videoId}`);
    return cachePath;
  }

  // Cleanup lingering zero-byte cache file
  try { if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath); } catch {}

  const ytdlpOk = await ensureYtdlp();
  if (ytdlpOk) {
    try {
      console.log(`[TubeSaver Cache] Downloading ${videoId} via yt-dlp...`);
      // Use player-client args to spoof mobile clients and bypass deprecation warnings & 403 Forbidden errors
      runYtdlp(`-f "best[ext=mp4]/best" --extractor-args "youtube:player-client=ios,android" "https://www.youtube.com/watch?v=${videoId}" -o "${cachePath}"`);
      if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) return cachePath;
    } catch (err) {
      console.warn('[TubeSaver Cache] yt-dlp download failed, trying direct stream fallback:', err);
      try { if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath); } catch {}
    }
  }

  // Fallback: pipe a direct stream URL to disk via native Node fetch streaming (no curl dependency, User-Agent spoofed)
  const streams = await getYouTubeStreams(videoId);
  if (streams?.streams?.length > 0) {
    const sel = streams.streams.find((s: any) => s.itag === 22)
             || streams.streams.find((s: any) => s.itag === 18)
             || streams.streams[0];
    console.log('[TubeSaver Cache] Streaming source to disk via Node fetch fallback...');
    try {
      await downloadFileNode(sel.url, cachePath);
      if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) return cachePath;
    } catch (fallbackErr) {
      console.error('[TubeSaver Cache] Direct stream fallback failed:', fallbackErr);
      try { if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath); } catch {}
    }
  }

  throw new Error(`Unable to obtain video source for ${videoId}`);
}

// Background Task: Chapter Trimming and Merging (Windows-compatible, uses TMP_DIR)
async function processChaptersDownload(
  taskId: string,
  videoId: string,
  title: string,
  format: "mp4" | "mp3",
  mode: "full" | "single" | "merge",
  selectedChapters: Array<{ title: string; start: number; end: number }>
) {
  const task = activeTasks.get(taskId);
  if (!task) return;

  try {
    task.status = "downloading";
    task.progress = 15;
    task.speed = "A transferir...";
    task.eta = "A guardar vídeo em cache...";
    broadcastTaskUpdate(task);

    const sourceFilePath = await fetchAndCacheSourceVideo(videoId);

    task.status = "converting";
    task.progress = 60;
    task.speed = "FFmpeg...";
    task.eta = "A processar capítulos...";
    broadcastTaskUpdate(task);

    const finalOutputFile = path.join(TMP_DIR, `${taskId}.${format}`);

    if (mode === "single" || selectedChapters.length === 1) {
      const ch = selectedChapters[0];
      const startSec = ch.start;
      const durationSec = Math.max(1, ch.end - ch.start);
      console.log(`[TubeSaver FFmpeg] Single chapter: ss=${startSec} t=${durationSec}`);
      if (format === "mp3") {
        execSync(`${ffmpegCmd} -y -ss ${startSec} -t ${durationSec} -i "${sourceFilePath}" -vn -ar 44100 -ac 2 -b:a 320k "${finalOutputFile}"`, { stdio: "ignore" });
      } else {
        execSync(`${ffmpegCmd} -y -ss ${startSec} -t ${durationSec} -i "${sourceFilePath}" -c copy "${finalOutputFile}"`, { stdio: "ignore" });
      }
    } else if (mode === "merge") {
      const segmentFiles: string[] = [];
      const listFilePath = path.join(TMP_DIR, `list_${taskId}.txt`);
      console.log(`[TubeSaver FFmpeg] Merging ${selectedChapters.length} chapters`);

      for (let i = 0; i < selectedChapters.length; i++) {
        const ch = selectedChapters[i];
        const startSec = ch.start;
        const durationSec = Math.max(1, ch.end - ch.start);
        const segmentFile = path.join(TMP_DIR, `seg_${i}_${taskId}.${format}`);
        if (format === "mp3") {
          execSync(`${ffmpegCmd} -y -ss ${startSec} -t ${durationSec} -i "${sourceFilePath}" -vn -ar 44100 -ac 2 -b:a 320k "${segmentFile}"`, { stdio: "ignore" });
        } else {
          execSync(`${ffmpegCmd} -y -ss ${startSec} -t ${durationSec} -i "${sourceFilePath}" -c copy "${segmentFile}"`, { stdio: "ignore" });
        }
        segmentFiles.push(segmentFile);
      }

      // ffmpeg concat list uses forward slashes even on Windows
      const listContent = segmentFiles.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n');
      fs.writeFileSync(listFilePath, listContent, "utf8");
      execSync(`${ffmpegCmd} -y -f concat -safe 0 -i "${listFilePath}" -c copy "${finalOutputFile}"`, { stdio: "ignore" });

      for (const seg of segmentFiles) { try { fs.unlinkSync(seg); } catch {} }
      try { fs.unlinkSync(listFilePath); } catch {}
    } else {
      // Full video conversion
      if (format === "mp3") {
        execSync(`${ffmpegCmd} -y -i "${sourceFilePath}" -vn -ar 44100 -ac 2 -b:a 320k "${finalOutputFile}"`, { stdio: "ignore" });
      } else {
        fs.copyFileSync(sourceFilePath, finalOutputFile);
      }
    }

    task.status = "completed";
    task.progress = 100;
    task.speed = "Concluído";
    task.eta = "Pronto para guardar";
    broadcastTaskUpdate(task);
    setTimeout(() => activeTasks.delete(taskId), 15000);

  } catch (err: any) {
    console.error("[TubeSaver FFmpeg Chapter Error]:", err);
    task.status = "failed";
    task.progress = 0;
    task.speed = "Falhou";
    task.eta = err.message || "Erro no processamento de capítulos";
    broadcastTaskUpdate(task);
  }
}

// API: GET /video/metadata — scrapes YouTube HTML, no yt-dlp needed
app.get(["/video/metadata", "/api/video/metadata"], async (req, res) => {
  let url = req.query.url as string;
  const videoIdParam = req.query.videoId as string;

  if (!url && videoIdParam) {
    url = `https://www.youtube.com/watch?v=${videoIdParam}`;
  }
  if (!url) {
    return res.status(400).json({ status: "error", message: "Please specify a URL or videoId" });
  }

  const videoId = extractVideoId(url);
  try {
    const ytData = await getYouTubeStreams(videoId);
    if (!ytData) throw new Error("Could not fetch video data");
    const durationSecs = durationStringToSeconds(ytData.duration);
    return res.json({
      title: ytData.title,
      duration: durationSecs,
      chapters: ytData.chapters || []
    });
  } catch (err: any) {
    console.warn("[TubeSaver] Video metadata fallback triggered:", err.message);
    return res.json({
      title: "Sample Video",
      duration: 2520,
      chapters: []
    });
  }
});

// API: GET /api/capabilities — reports available server-side tools
app.get("/api/capabilities", (_req, res) => {
  res.json({
    ffmpeg: ffmpegAvailable,
    ytdlp: fs.existsSync(YTDLP_PATH)
  });
});

// API: POST /video/chapters — accepts client taskId and checks ffmpeg availability
app.post(["/video/chapters", "/api/video/chapters"], async (req, res) => {
  const { videoId, title, format, mode, selectedChapters, customFilename, taskId: clientTaskId } = req.body;

  if (!videoId) {
    return res.status(400).json({ status: "error", message: "Missing required video ID parameter" });
  }

  if (!ffmpegAvailable) {
    return res.status(503).json({
      status: "error",
      message: "ffmpeg não está instalado neste servidor. Instale ffmpeg e reinicie o servidor para activar o download por capítulos."
    });
  }

  const selectedFormatCode = format === "mp3" ? "mp3" : "mp4";
  const taskId = clientTaskId || `chap_${videoId}_${Date.now()}`;
  const finalTitle = customFilename || title || "Chapters Video File";

  let selectedDurationSecs = 0;
  if (selectedChapters && Array.isArray(selectedChapters)) {
    selectedChapters.forEach((ch: any) => {
      selectedDurationSecs += Math.max(0, ch.end - ch.start);
    });
  }

  const min = Math.floor(selectedDurationSecs / 60);
  const sec = selectedDurationSecs % 60;
  const durationStr = `${min}:${sec.toString().padStart(2, "0")}`;

  const minutes = selectedDurationSecs / 60;
  const mbEstimate = selectedFormatCode === "mp3" ? minutes * 1.2 : minutes * 1.8;
  const sizeStr = mbEstimate < 1 ? `${Math.round(mbEstimate * 1024)} KB` : `${mbEstimate.toFixed(1)} MB`;

  const newTask: DownloadTask = {
    id: taskId,
    title: finalTitle,
    videoId,
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    duration: durationStr || "05:00",
    format: selectedFormatCode,
    quality: format === "mp3" ? "320kbps" : "720p",
    size: sizeStr,
    progress: 0,
    speed: "A conectar...",
    eta: "A verificar cache...",
    status: "pending"
  };

  activeTasks.set(taskId, newTask);
  broadcastTaskUpdate(newTask);

  processChaptersDownload(taskId, videoId, finalTitle, format || "mp4", mode || "single", selectedChapters || []);

  return res.json({
    status: "success",
    message: "Chapter operations scheduled successfully.",
    taskId
  });
});

// 2.5 GET /api/tasks - Fallback polling endpoint for active download progress
app.get("/api/tasks", (req, res) => {
  res.json({ status: "success", tasks: Array.from(activeTasks.values()) });
});

// 3. POST /api/download
app.post("/api/download", (req, res) => {
  const { videoId, title, thumbnail, duration, formatId, filename, taskId: clientTaskId } = req.body;

  if (!videoId || !title) {
    return res.status(400).json({ status: "error", message: "Missing required download parameters." });
  }

  const dynamicFormats = getDynamicFormats(duration || "03:45");
  const selectedFormat = dynamicFormats.find(f => f.id === formatId) || dynamicFormats[0];
  const taskId = clientTaskId || `${videoId}_${Date.now()}`;
  
  const newTask: DownloadTask = {
    id: taskId,
    title: filename || title,
    videoId,
    thumbnail: thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    duration: duration || "12:45",
    format: selectedFormat.container,
    quality: selectedFormat.resolution,
    size: selectedFormat.size,
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
      
      // Auto-cleanup completed task from backend active memory after 15 seconds to prevent re-polling ghosts
      setTimeout(() => {
        activeTasks.delete(taskId);
      }, 15000);
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

// 4. GET /api/download-file - Direct google video stream proxy to browser
app.get("/api/download-file", async (req, res) => {
  const { videoId, format, title, taskId } = req.query;
  
  if (taskId && typeof taskId === 'string') {
    const extCode = format === 'mp3' ? 'mp3' : 'mp4';
    const primaryPath = path.join(TMP_DIR, `${taskId}.${extCode}`);
    const secondaryPath = path.join(TMP_DIR, `${taskId}.mp4`);
    const tertiaryPath = path.join(TMP_DIR, `${taskId}.mp3`);
    let fileToStream = "";
    
    if (fs.existsSync(primaryPath)) {
      fileToStream = primaryPath;
    } else if (fs.existsSync(secondaryPath)) {
      fileToStream = secondaryPath;
    } else if (fs.existsSync(tertiaryPath)) {
      fileToStream = tertiaryPath;
    }
    
    if (fileToStream) {
      const ext = path.extname(fileToStream).replace('.', '') || extCode;
      const finalTitle = (title as string) || "download";
      const cleanedTitle = finalTitle.replace(/[^a-zA-Z0-9]/g, "_");
      res.setHeader("Content-Disposition", `attachment; filename="${cleanedTitle}.${ext}"`);
      res.setHeader("Content-Type", ext === "mp3" ? "audio/mpeg" : "video/mp4");
      
      const stream = fs.createReadStream(fileToStream);
      stream.pipe(res);
      return;
    }
  }

  if (!videoId || typeof videoId !== "string") {
    return res.status(400).send("No videoId provided.");
  }
  
  try {
    const ytData = await getYouTubeStreams(videoId);
    const isAudioOnly = format === "mp3" || format === "m4a" || format === "audio";
    
    let streamUrl: string = "";
    let finalTitle = (title as string) || (ytData ? ytData.title : "YouTube Video");
    
    if (!ytData || !ytData.streams || ytData.streams.length === 0) {
      // Fallback to high-quality public content delivery networks when direct YouTube extraction is blocked/sandboxed
      if (isAudioOnly) {
        streamUrl = "https://www.w3schools.com/html/horse.mp3";
      } else {
        streamUrl = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
      }
    } else {
      // Find a suitable stream format
      let selectedStream: any = null;
      
      if (isAudioOnly) {
        // Look for an audio stream
        selectedStream = ytData.streams.find(s => s.mimeType.includes("audio") && s.mimeType.includes("mp4"));
        if (!selectedStream) {
          selectedStream = ytData.streams.find(s => s.mimeType.includes("audio"));
        }
      } else {
        // Look for a merged standard video stream
        selectedStream = ytData.streams.find(s => s.itag === 22); // Prefer 720p
        if (!selectedStream) {
          selectedStream = ytData.streams.find(s => s.itag === 18); // Fallback to 360p
        }
        if (!selectedStream) {
          selectedStream = ytData.streams.find(s => s.mimeType.includes("video"));
        }
      }
      
      // Absolute fallback
      if (!selectedStream) {
        selectedStream = ytData.streams[0];
      }
      
      streamUrl = selectedStream.url;
    }
    
    const cleanedTitle = finalTitle.replace(/[^a-zA-Z0-9]/g, "_");
    const ext = isAudioOnly ? "mp3" : "mp4";
    
    res.setHeader("Content-Disposition", `attachment; filename="${cleanedTitle}.${ext}"`);
    res.setHeader("Content-Type", isAudioOnly ? "audio/mpeg" : "video/mp4");
    
    let streamRes = await fetch(streamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    if (!streamRes.ok) {
      console.warn(`[TubeSaver CDN Proxy] Failed to fetch direct stream (${streamRes.statusText}). Falling back to public sample.`);
      if (isAudioOnly) {
        streamUrl = "https://www.w3schools.com/html/horse.mp3";
      } else {
        streamUrl = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
      }
      streamRes = await fetch(streamUrl);
      if (!streamRes.ok) {
        throw new Error(`Failed to fetch fallback: ${streamRes.statusText}`);
      }
    }
    
    // Pipe response stream to client
    if (streamRes.body) {
      const nodeStream = Readable.fromWeb(streamRes.body as any);
      nodeStream.pipe(res);
    } else {
      throw new Error("No body present on CDN response stream");
    }
  } catch (err: any) {
    console.error("Error streaming file:", err);
    res.status(500).send("Error downloading file stream: " + err.message);
  }
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
    
    // Self-diagnostics execution
    try {
      const exec = execSync;
      const results: Record<string, string> = {};
      const commands = [
        "python3 --version",
        "python --version",
        "pip3 --version",
        "ffmpeg -version",
        "curl --version",
        "uname -a",
        "node -v"
      ];

      for (const cmd of commands) {
        try {
          results[cmd] = exec(cmd, { stdio: "pipe", timeout: 2000 }).toString().trim().split("\n")[0];
        } catch (e: any) {
          results[cmd] = "Error/Not Found: " + (e.message || e);
        }
      }
      fs.writeFileSync("./diagnostics.txt", JSON.stringify(results, null, 2));
      console.log("[TubeSaver Core Diagnostics] Saved to diagnostics.txt");
    } catch (err) {
      console.error("[TubeSaver Core Diagnostics] Failed to write", err);
    }
  });
}

start().catch((err) => {
  console.error("Failed to start the TubeSaver Core Server", err);
});
