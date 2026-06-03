import React, { useState } from "react";
import { HistoryItem } from "../types";
import { Trash2, Search, Video, Music, Sparkles, RefreshCw, Layers } from "lucide-react";

interface HistoryPageProps {
  history: HistoryItem[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onReDownload: (videoId: string) => void;
}

export default function HistoryPage({ history, onDelete, onClearAll, onReDownload }: HistoryPageProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "video" | "audio">("all");

  const filtered = history.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterType === "all" || item.type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4 sm:px-6">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="font-sans text-3xl font-extrabold tracking-tight text-gray-900 flex items-center gap-2">
            Download History
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage your offline files converted and stored in local cache.
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl border border-red-100 hover:bg-red-100/50 hover:border-red-200 font-sans font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-100"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {history.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs py-16 px-6 text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 mx-auto mb-5 border border-gray-100">
            <Layers className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="font-sans text-lg font-bold text-gray-900">Your downloads list is clear</h3>
          <p className="text-gray-500 text-sm max-w-sm mt-2 mx-auto leading-relaxed">
            Convert some high-resolution videos or audio tracks first to see them stored here for quick review.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-gray-100 shadow-xs">
            {/* Search Input */}
            <div className="relative flex-grow">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search downloaded items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-gray-50/80 hover:bg-gray-50 focus:bg-white text-gray-800 placeholder-gray-400/80 rounded-xl border border-gray-100 focus:border-red-500 focus:ring-2 focus:ring-red-500/10 font-sans text-sm focus:outline-none transition-all"
              />
            </div>

            {/* Quality Category Toggles */}
            <div className="flex bg-gray-50/80 p-0.5 rounded-xl border border-gray-100 self-start sm:self-auto">
              <button
                onClick={() => setFilterType("all")}
                className={`px-4 py-2 font-sans text-xs font-semibold rounded-lg transition-all ${
                  filterType === "all"
                    ? "bg-white text-gray-900 shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                All ({history.length})
              </button>
              <button
                onClick={() => setFilterType("video")}
                className={`flex items-center gap-1.5 px-4 py-2 font-sans text-xs font-semibold rounded-lg transition-all ${
                  filterType === "video"
                    ? "bg-white text-red-600 shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video</span>
              </button>
              <button
                onClick={() => setFilterType("audio")}
                className={`flex items-center gap-1.5 px-4 py-2 font-sans text-xs font-semibold rounded-lg transition-all ${
                  filterType === "audio"
                    ? "bg-white text-red-600 shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Audio Only</span>
              </button>
            </div>
          </div>

          {/* List display */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <p className="text-gray-500 font-sans text-sm">No items match your search filters.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-4 font-sans text-xs font-bold text-gray-400 tracking-wider uppercase">Media File</th>
                      <th className="px-6 py-4 font-sans text-xs font-bold text-gray-400 tracking-wider uppercase">Saved Date</th>
                      <th className="px-6 py-4 font-sans text-xs font-bold text-gray-400 tracking-wider uppercase">Config</th>
                      <th className="px-6 py-4 font-sans text-xs font-bold text-gray-400 tracking-wider uppercase">File Size</th>
                      <th className="px-6 py-4 font-sans text-xs font-bold text-gray-400 tracking-wider uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50/40 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            {/* Thumbnail */}
                            <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100">
                              <img
                                src={item.thumbnail}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute bottom-1 right-1 bg-black/70 text-white font-mono text-[9px] font-bold px-1 rounded-sm">
                                {item.duration}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <p className="font-sans text-sm font-bold text-gray-900 truncate max-w-xs sm:max-w-md" title={item.title}>
                                {item.title}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {item.type === "video" ? (
                                  <Video className="w-3 h-3 text-red-500" />
                                ) : (
                                  <Music className="w-3 h-3 text-indigo-500" />
                                )}
                                <span className="font-sans text-xs text-gray-500 capitalize tracking-wide font-medium">
                                  {item.type} extraction
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-sans text-sm text-gray-500">
                          {item.date}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold uppercase ${
                            item.type === "video"
                              ? "bg-red-50 text-red-600 border border-red-100"
                              : "bg-indigo-50 text-indigo-600 border border-indigo-100"
                          }`}>
                            {item.format === "mp3" ? `MP3 ${item.format.toUpperCase()}` : `MP4 ${item.format.toUpperCase()}`}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-sans text-sm text-gray-500 font-medium">
                          {item.size || "14.5 MB"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => onReDownload(item.videoId)}
                              title="Re-download this media URL"
                              className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 transition-all focus:outline-none"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onDelete(item.id)}
                              title="Delete log record"
                              className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all focus:outline-none"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
