import React, { useState, useEffect, useRef } from "react";
import { Format, VideoMetadata, PlaylistMetadata, DownloadTask, HistoryItem } from "./types";
import TopNavBar from "./components/TopNavBar";
import HistoryPage from "./components/HistoryPage";
import PreviewSetupCard from "./components/PreviewSetupCard";
import PlaylistsSetupCard from "./components/PlaylistsSetupCard";
import DownloadProgressList from "./components/DownloadProgressList";
import { Link, Sparkles, PlayCircle, ShieldCheck, Cpu, ArrowRight, HelpCircle, Flame, RefreshCw, AlertCircle } from "lucide-react";

export default function App() {
  const [currentTab, setCurrentTab] = useState<"download" | "history">("download");
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parsed states
  const [videoData, setVideoData] = useState<VideoMetadata | null>(null);
  const [playlistData, setPlaylistData] = useState<PlaylistMetadata | null>(null);
  const [formats, setFormats] = useState<Format[]>([]);

  // Active WebSocket tasks and permanent History logs
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const completedTaskIds = useRef<Set<string>>(new Set());

  // 1. Initial Load: Retrieve History log from localStorage & query server formats catalog
  useEffect(() => {
    const saved = localStorage.getItem("tubesaver_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history data", e);
      }
    }

    // Capture standard formats catalouge from server
    fetch("/api/formats")
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setFormats(data.formats);
        }
      })
      .catch(err => console.error("Could not fetch quality formats from server", err));
  }, []);

  // 2. Set up high-performance, self-healing WebSocket stream to handle download progresses
  useEffect(() => {
    const connectWS = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/progress`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[TubeSaver WS] Stream established beautifully.");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "INIT_TASKS") {
            setTasks(data.tasks);
          } else if (data.type === "TASK_UPDATE") {
            const updatedTask: DownloadTask = data.task;
            
            if (completedTaskIds.current.has(updatedTask.id)) {
              return;
            }
            
            setTasks((prev) => {
              const exists = prev.some(t => t.id === updatedTask.id);
              if (exists) {
                return prev.map(t => t.id === updatedTask.id ? updatedTask : t);
              } else {
                return [...prev, updatedTask];
              }
            });

            // Automatically promote finished downloads to LocalStorage history
            if (updatedTask.status === "completed") {
              completedTaskIds.current.add(updatedTask.id);
              triggerDeviceDownload(updatedTask);
              setHistory((currentHistory) => {
                // Prevent duplicate records for the same operation
                const idExists = currentHistory.some(item => item.id === updatedTask.id);
                if (idExists) return currentHistory;

                const sizeOfFormat = formats.find(f => f.resolution === updatedTask.quality)?.size || "15.4 MB";
                const freshItem: HistoryItem = {
                  id: updatedTask.id,
                  title: updatedTask.title,
                  videoId: updatedTask.videoId,
                  thumbnail: updatedTask.thumbnail,
                  duration: updatedTask.duration,
                  format: updatedTask.quality,
                  type: updatedTask.format === "mp3" ? "audio" : "video",
                  date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
                  size: sizeOfFormat
                };

                const newHistory = [freshItem, ...currentHistory];
                localStorage.setItem("tubesaver_history", JSON.stringify(newHistory));
                return newHistory;
              });

              // Slide out active task from real-time overlay after a small delay
              setTimeout(() => {
                setTasks((prev) => prev.filter(t => t.id !== updatedTask.id));
              }, 4000);
            }
          }
        } catch (err) {
          console.error("WS parse failure", err);
        }
      };

      ws.onclose = () => {
        console.log("[TubeSaver WS] Disconnected. Re-attempting stream loop in 3s...");
        setTimeout(connectWS, 3000);
      };

      wsRef.current = ws;
    };

    connectWS();

    return () => {
      wsRef.current?.close();
    };
  }, [formats]);

  // 2.5 Fallback HTTP Polling (highly robust and guarantees state sync inside iframe sandboxes)
  useEffect(() => {
    const pollTasks = async () => {
      try {
        const res = await fetch("/api/tasks");
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "success" && data.tasks) {
          const remoteTasksAll: DownloadTask[] = data.tasks;
          const remoteTasks = remoteTasksAll.filter(t => !completedTaskIds.current.has(t.id));
          
          setTasks((currentTasks) => {
            // Keep completed tasks that might be fading out naturally, but discard missing active tasks
            const updated = currentTasks.map(local => {
              const remote = remoteTasks.find(r => r.id === local.id);
              if (remote) {
                return remote;
              }
              // If it's completed, keep it so it fades out naturally (slide out timeout completes in 4s)
              if (local.status === "completed") {
                return local;
              }
              return null; // flag active-but-missing-from-server tasks for cleanup (e.g. canceled)
            }).filter((t): t is DownloadTask => t !== null);

            // Insert new tasks
            remoteTasks.forEach(remote => {
              if (!updated.some(u => u.id === remote.id)) {
                updated.push(remote);
              }
            });

            return updated;
          });

          // Move any completed ones to history
          remoteTasks.forEach((remoteTask) => {
            if (remoteTask.status === "completed") {
              completedTaskIds.current.add(remoteTask.id);
              triggerDeviceDownload(remoteTask);
              setHistory((currentHistory) => {
                const idExists = currentHistory.some(item => item.id === remoteTask.id);
                if (idExists) return currentHistory;

                const sizeOfFormat = formats.find(f => f.resolution === remoteTask.quality)?.size || "15.4 MB";
                const freshItem: HistoryItem = {
                  id: remoteTask.id,
                  title: remoteTask.title,
                  videoId: remoteTask.videoId,
                  thumbnail: remoteTask.thumbnail,
                  duration: remoteTask.duration,
                  format: remoteTask.quality,
                  type: remoteTask.format === "mp3" ? "audio" : "video",
                  date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
                  size: sizeOfFormat
                };

                const newHistory = [freshItem, ...currentHistory];
                localStorage.setItem("tubesaver_history", JSON.stringify(newHistory));
                return newHistory;
              });

              // Slide completed tasks out of active list
              setTimeout(() => {
                setTasks((prev) => prev.filter(t => t.id !== remoteTask.id));
              }, 4000);
            }
          });
        }
      } catch (err) {
        console.error("Task fallback polling failed silently:", err);
      }
    };

    const intervalId = setInterval(pollTasks, 2000);
    return () => clearInterval(intervalId);
  }, [formats]);

  // 3. Post URL validation & analyze endpoints
  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setAnalyzing(true);
    setError(null);
    setVideoData(null);
    setPlaylistData(null);

    fetch("/api/analyze-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    })
      .then(res => res.json())
      .then(data => {
        setAnalyzing(false);
        if (data.status === "success") {
          if (data.type === "playlist") {
            setPlaylistData(data);
          } else {
            setVideoData(data.video);
          }
        } else {
          setError(data.message || "We could not resolve this link. Please check the URL and try again.");
        }
      })
      .catch(err => {
        setAnalyzing(false);
        setError("Network error occurred. Please ensure your TubeSaver core server is online.");
      });
  };

  // 4. Fire Single video download conversion task request
  const handleDownload = (formatId: string, filename: string) => {
    if (!videoData) return;

    // Create a local temporary task immediately so the active transfer list is shown with 0% right away
    const tempTaskId = `${videoData.videoId}_${Date.now()}`;
    const selectedFormat = formats.find(f => f.id === formatId) || formats[0] || { container: "mp4", resolution: "720p" };
    const tempTask: DownloadTask = {
      id: tempTaskId,
      title: filename || videoData.title,
      videoId: videoData.videoId,
      thumbnail: videoData.thumbnail,
      duration: videoData.duration,
      format: selectedFormat.container,
      quality: selectedFormat.resolution,
      progress: 0,
      speed: "0.0 MB/s",
      eta: "Starting...",
      status: "pending"
    };

    setTasks(prev => [tempTask, ...prev]);

    fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: tempTaskId,
        videoId: videoData.videoId,
        title: videoData.title,
        thumbnail: videoData.thumbnail,
        duration: videoData.duration,
        formatId,
        filename
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          // Clear form to allow new inputs
          setUrl("");
          setVideoData(null);
          // Substitute with real task
          if (data.task) {
            setTasks(prev => prev.map(t => t.id === tempTaskId ? data.task : t));
          }
        } else {
          // Remove if failed
          setTasks(prev => prev.filter(t => t.id !== tempTaskId));
          setError(data.message || "Failed to add download task. Please try again.");
        }
      })
      .catch(err => {
        setTasks(prev => prev.filter(t => t.id !== tempTaskId));
        setError("Failed to coordinate backend queue processor.");
      });
  };

  // 5. Build multiple parallel playlists downloads coordinator
  const handleBatchDownload = (videoIds: string[], formatId: string) => {
    if (!playlistData) return;

    const selectedVideos = playlistData.videos.filter(v => videoIds.includes(v.id));
    const selectedFormat = formats.find(f => f.id === formatId) || formats[0] || { container: "mp4", resolution: "720p" };

    const tempTasks: DownloadTask[] = selectedVideos.map((v, idx) => ({
      id: `batch_${idx}_${Date.now()}`,
      title: v.title,
      videoId: v.videoId,
      thumbnail: v.thumbnail,
      duration: v.duration,
      format: selectedFormat.container,
      quality: selectedFormat.resolution,
      progress: 0,
      speed: "0.0 MB/s",
      eta: "Starting...",
      status: "pending"
    }));

    setTasks(prev => [...tempTasks, ...prev]);

    selectedVideos.forEach((v, index) => {
      fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: tempTasks[index].id,
          videoId: v.videoId,
          title: v.title,
          thumbnail: v.thumbnail,
          duration: v.duration,
          formatId
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === "success" && data.task) {
          setTasks(prev => prev.map(t => t.id === tempTasks[index].id ? data.task : t));
        } else {
          setTasks(prev => prev.filter(t => t.id !== tempTasks[index].id));
        }
      })
      .catch(err => {
        setTasks(prev => prev.filter(t => t.id !== tempTasks[index].id));
        console.error("Error setting batch item for: ", v.title);
      });
    });

    // Clear and reset form
    setUrl("");
    setPlaylistData(null);
  };

  // 5.5 Automatically download prepared file to device
  const triggerDeviceDownload = (task: DownloadTask) => {
    const downloadUrl = `/api/download-file?videoId=${task.videoId}&format=${task.format}&title=${encodeURIComponent(task.title)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${task.title.replace(/[^a-zA-Z0-9]/g, "_")}.${task.format === "mp3" || task.format === "audio" ? "mp3" : "mp4"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 6. Delete item from localStorage history
  const handleDeleteHistory = (id: string) => {
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    localStorage.setItem("tubesaver_history", JSON.stringify(updated));
  };

  // 7. Reset entire history log
  const handleClearHistory = () => {
    if (confirm("Are you sure you want to permanently clear your history records?")) {
      setHistory([]);
      localStorage.removeItem("tubesaver_history");
    }
  };

  // 8. prefills the downloader URL input bar with history item for re-downloads
  const handleReDownload = (videoId: string) => {
    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
    setUrl(targetUrl);
    setCurrentTab("download");
    // Run instant query
    setAnalyzing(true);
    setError(null);
    setVideoData(null);
    setPlaylistData(null);

    fetch("/api/analyze-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl })
    })
      .then(res => res.json())
      .then(data => {
        setAnalyzing(false);
        if (data.status === "success") {
          setVideoData(data.video);
        } else {
          setError("Failed to retrieve source video info.");
        }
      })
      .catch(err => {
        setAnalyzing(false);
        setError("Failed to parse resource data.");
      });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/70 text-gray-800">
      {/* Dynamic Navigation */}
      <TopNavBar
        currentTab={currentTab}
        setTab={setCurrentTab}
        historyCount={history.length}
      />

      {/* Main Panel Content */}
      <main className="flex-grow pb-16">
        {currentTab === "download" ? (
          /* Downloader Dashboard view */
          <div className="w-full">
            {/* Hero Branding Section */}
            <div className="relative py-16 px-6 overflow-hidden bg-gradient-to-tr from-gray-900 to-indigo-950 text-white text-center">
              {/* Blur backdrop decals */}
              <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

              <div className="max-w-4xl mx-auto space-y-6 relative z-10">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/15">
                  <Sparkles className="w-4 h-4 text-amber-400 rotate-12" />
                  <span className="font-sans text-[10px] font-bold tracking-wider uppercase">Vite + Docker Deploy Ready</span>
                </div>

                <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight">
                  Download YouTube <span className="bg-gradient-to-r from-red-500 to-amber-500 bg-clip-text text-transparent">Videos & Playlists</span>
                </h1>
                
                <p className="font-sans text-gray-300 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
                  TubeSaver converts media streams into high-fidelity MP4 and MP3 formats inside secure sandbox containers.
                </p>

                {/* Main URL Bar Paste Input */}
                <form onSubmit={handleAnalyze} className="max-w-2xl mx-auto pt-4 relative group">
                  <div className="flex bg-white/10 hover:bg-white/15 backdrop-blur-lg border border-white/15 focus-within:border-red-500/80 focus-within:ring-4 focus-within:ring-red-500/10 rounded-2xl p-2.5 shadow-xl transition-all duration-300">
                    <div className="flex-grow flex items-center px-3 gap-2 min-w-0">
                      <Link className="w-5 h-5 text-gray-400" />
                      <input
                        type="url"
                        required
                        placeholder="Paste YouTube video or playlist link (e.g., https://youtube.com/watch?v=...)"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="w-full h-11 bg-transparent border-none text-white placeholder-gray-400 font-sans text-sm focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={analyzing}
                      className="px-6 h-11 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 flex-shrink-0"
                    >
                      {analyzing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowRight className="w-4 h-4" />
                      )}
                      <span>{analyzing ? "Resolving..." : "Start"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Error alerts display */}
            {error && (
              <div className="max-w-xl mx-auto mt-8 px-4">
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
                  <div className="font-medium">
                    <p className="font-bold">Conversion Block</p>
                    <p className="mt-0.5 text-red-600/95 leading-relaxed">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* active live WebSockets task progress lists */}
            <DownloadProgressList
              tasks={tasks}
              onCancel={(id) => {
                completedTaskIds.current.add(id);
                setTasks((prev) => prev.filter(t => t.id !== id));
              }}
              onTriggerDownload={triggerDeviceDownload}
            />

            {/* single video config results display */}
            {videoData && (
              <PreviewSetupCard
                video={videoData}
                onDownload={handleDownload}
                isDownloading={tasks.some(t => t.videoId === videoData.videoId)}
              />
            )}

            {/* playlists config results display */}
            {playlistData && formats.length > 0 && (
              <PlaylistsSetupCard
                playlist={playlistData}
                formats={formats}
                onBatchDownload={handleBatchDownload}
                isDownloading={tasks.some(t => playlistData.videos.some(pv => pv.videoId === t.videoId))}
              />
            )}

            {/* Core Features list bento layout (only shown when no results exist) */}
            {!videoData && !playlistData && !analyzing && (
              <div className="max-w-6xl mx-auto px-6 mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-xs hover:shadow-md transition-all space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100/30">
                    <PlayCircle className="w-6 h-6 fill-red-100/30" />
                  </div>
                  <h3 className="font-sans text-lg font-bold text-gray-900">4K & HD Downloads</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Choose resolution presets up to 1080p and 4K, optimizing sizes and formats dynamically.
                  </p>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-xs hover:shadow-md transition-all space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100/30">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <h3 className="font-sans text-lg font-bold text-gray-900">Audio Extractions</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Convert music videos or audio podcasts directly into pristine 320kbps MP3 directories quickly.
                  </p>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-xs hover:shadow-md transition-all space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100/30">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="font-sans text-lg font-bold text-gray-900">Secure Sandboxing</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Downloads run through localized sanitizers without tracking or keeping personal logs.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* History Page view component */
          <HistoryPage
            history={history}
            onDelete={handleDeleteHistory}
            onClearAll={handleClearHistory}
            onReDownload={handleReDownload}
          />
        )}
      </main>

      {/* Elegant minimalist footer */}
      <footer className="w-full border-t border-gray-150 py-8 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-sans text-sm font-extrabold text-gray-900">TubeSaver UI</span>
            <span className="text-gray-300">|</span>
            <span className="text-xs font-semibold text-gray-400">Continuous Processing Engine v2026</span>
          </div>

          <div className="flex gap-6">
            <a href="#" className="font-sans text-xs font-semibold text-gray-400 hover:text-red-600 transition-colors">Privacy Policy</a>
            <a href="#" className="font-sans text-xs font-semibold text-gray-400 hover:text-red-600 transition-colors">Workspace Terms</a>
            <a href="#" className="font-sans text-xs font-semibold text-gray-400 hover:text-red-600 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
