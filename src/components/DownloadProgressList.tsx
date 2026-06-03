import React, { useState } from "react";
import { DownloadTask } from "../types";
import { X, RefreshCw, CheckCircle, Clock, Volume2, ShieldAlert, Download } from "lucide-react";

interface DownloadProgressListProps {
  tasks: DownloadTask[];
  onCancel: (id: string) => void;
}

export default function DownloadProgressList({ tasks, onCancel }: DownloadProgressListProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const triggerDownload = async (task: DownloadTask) => {
    if (downloadingId) return;
    setDownloadingId(task.id);
    try {
      const response = await fetch(
        `/api/download-file?videoId=${task.videoId}&format=${task.format}&title=${encodeURIComponent(task.title)}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch file stream (status: ${response.status})`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.title.replace(/[^a-zA-Z0-9]/g, "_")}.${task.format === "mp3" || task.format === "audio" ? "mp3" : "mp4"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Local file fetch download failure:", err);
    } finally {
      setDownloadingId(null);
    }
  };

  if (tasks.length === 0) return null;

  return (
    <div className="w-full max-w-xl mx-auto mt-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 className="font-sans text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
        Active Transfers
      </h3>

      <div className="space-y-4">
        {tasks.map((task) => {
          const isDownloading = task.status === "downloading";
          const isConverting = task.status === "converting";
          const isCompleted = task.status === "completed";
          const isFailed = task.status === "failed";

          return (
            <div
              key={task.id}
              className={`p-4 rounded-xl border transition-all ${
                isCompleted 
                  ? "bg-emerald-50/40 border-emerald-100" 
                  : isFailed
                  ? "bg-red-50/40 border-red-100"
                  : "bg-gray-50/60 border-gray-100"
              }`}
            >
              {/* Card Header Info */}
              <div className="flex gap-3 items-start">
                <div className="relative w-16 aspect-video bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200/50">
                  <img
                    src={task.thumbnail}
                    alt={task.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-0.5 right-0.5 bg-black/75 px-1 rounded-xs font-mono text-[8px] font-bold text-white">
                    {task.duration}
                  </div>
                </div>

                <div className="flex-grow min-w-0">
                  <p className="font-sans text-sm font-bold text-gray-900 truncate" title={task.title}>
                    {task.title}
                  </p>
                  
                  {/* Selected Quality formats badge */}
                  <div className="flex gap-1.5 items-center mt-1">
                    <span className="font-sans text-[10px] font-bold uppercase py-0.5 px-1.5 bg-gray-200 text-gray-700 rounded-sm">
                      {task.quality}
                    </span>
                    <span className="font-sans text-[10px] font-bold uppercase py-0.5 px-1.5 bg-gray-200 text-gray-700 rounded-sm">
                      {task.format}
                    </span>
                    
                    {/* Transfer dynamic status logs */}
                    {isConverting && (
                      <span className="font-sans text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-sm animate-pulse">
                        Converting Format...
                      </span>
                    )}
                    {isCompleted && (
                      <span className="font-sans text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>Completed</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Cancel download row trigger state */}
                {!isCompleted && !isFailed && (
                  <button
                    onClick={() => onCancel(task.id)}
                    className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/50 transition-all focus:outline-none"
                    title="Cancel conversion"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Progress dynamic components */}
              <div className="mt-4">
                <div className="flex justify-between items-end mb-1">
                  <span className="font-sans text-xs font-semibold text-gray-500">
                    {isConverting 
                      ? "FFmpeg encoding media streams..." 
                      : isCompleted 
                        ? "Process complete and verified!" 
                        : "Downloading streaming segments..."
                    }
                  </span>
                  <span className="font-mono text-sm font-extrabold text-gray-900">
                    {task.progress}%
                  </span>
                </div>

                {/* Progress bar container */}
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ease-out rounded-full ${
                      isCompleted 
                        ? "bg-emerald-500" 
                        : isConverting 
                          ? "bg-indigo-500 animate-pulse" 
                          : "bg-red-600"
                    }`}
                    style={{ width: `${task.progress}%` }}
                  ></div>
                </div>

                {/* Live speed rates panel */}
                {!isCompleted && !isFailed && (
                  <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-200/40">
                    <div className="flex flex-col">
                      <span className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Transfer Rate
                      </span>
                      <span className="font-sans text-xs font-extrabold text-gray-700 mt-0.5">
                        {task.speed}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Estimated ETA
                      </span>
                      <span className="font-sans text-xs font-semibold text-gray-700 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>{task.eta}</span>
                      </span>
                    </div>
                  </div>
                )}

                {isCompleted && (
                  <div className="mt-4 pt-3 border-t border-gray-200/30">
                    <button
                      onClick={() => triggerDownload(task)}
                      disabled={downloadingId === task.id}
                      className="w-full text-center inline-flex justify-center items-center gap-2 font-sans text-xs font-bold uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 active:scale-[0.98] transition-all cursor-pointer font-medium disabled:cursor-not-allowed"
                    >
                      {downloadingId === task.id ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>A descarregar para o seu dispositivo...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>Baixar para o Dispositivo</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
