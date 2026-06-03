import React, { useState, useEffect } from "react";
import { VideoMetadata, Format } from "../types";
import { Video, Music, Sliders, Play, CheckCircle, ShieldCheck, Eye, Clock } from "lucide-react";

interface PreviewSetupCardProps {
  video: VideoMetadata;
  onDownload: (formatId: string, filename: string) => void;
  isDownloading: boolean;
}

export default function PreviewSetupCard({ video, onDownload, isDownloading }: PreviewSetupCardProps) {
  const [selectedType, setSelectedType] = useState<"mp4" | "mp3">("mp4");
  const [selectedFormatId, setSelectedFormatId] = useState<string>("");
  const [customFilename, setCustomFilename] = useState<string>("");

  // Populate state on load
  useEffect(() => {
    if (video) {
      setCustomFilename(video.title);
      // Automatically choose default format
      const defaultFormat = video.formats.find(f => f.container === selectedType);
      if (defaultFormat) {
        setSelectedFormatId(defaultFormat.id);
      }
    }
  }, [video, selectedType]);

  const formatsOfCurrentType = video.formats.filter(f => f.container === selectedType);
  const selectedFormatDetail = video.formats.find(f => f.id === selectedFormatId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFormatId) return;
    onDownload(selectedFormatId, customFilename);
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-12">
      {/* Left Column: Video Info & Thumbnail */}
      <div className="md:col-span-5 bg-gray-50/50 p-6 sm:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-gray-100">
        <div className="space-y-4">
          {/* Cover Art layout */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-xs border border-gray-100 bg-black group">
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 group-hover:bg-red-600 group-hover:text-white rounded-full flex items-center justify-center shadow-md transition-all">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
            <div className="absolute bottom-3 right-3 bg-black/75 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold text-white">
              {video.duration}
            </div>
          </div>

          <div>
            <span className="font-mono text-[10px] text-red-600 font-bold uppercase py-1 px-2 bg-red-50 rounded-md">
              Single Video analyzed
            </span>
            <h3 className="font-sans text-lg font-extrabold text-gray-900 mt-2 line-clamp-2 leading-snug">
              {video.title}
            </h3>
            <p className="text-gray-500 text-sm mt-1 font-medium">{video.author}</p>
          </div>
        </div>

        {/* Dynamic counts and view parameters */}
        <div className="flex gap-4 items-center pt-4 border-t border-gray-100 mt-4 text-gray-400">
          {video.viewCount && (
            <span className="flex items-center gap-1 text-xs font-semibold">
              <Eye className="w-4 h-4 text-gray-400" />
              {video.viewCount}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs font-semibold">
            <Clock className="w-4 h-4 text-gray-400" />
            {video.duration}
          </span>
        </div>
      </div>

      {/* Right Column: Download Configuration */}
      <form onSubmit={handleSubmit} className="md:col-span-7 p-6 sm:p-8 space-y-6">
        <h2 className="font-sans text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-red-600" />
          <span>Config Setup</span>
        </h2>

        {/* Format selectors tabs */}
        <div className="space-y-2">
          <label className="font-sans text-xs font-bold text-gray-400 uppercase tracking-widest">
            Media Format
          </label>
          <div className="flex bg-gray-50 p-1.5 rounded-xl border border-gray-100/80 w-fit">
            <button
              type="button"
              onClick={() => setSelectedType("mp4")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-sans text-sm font-bold transition-all ${
                selectedType === "mp4"
                  ? "bg-white text-red-600 shadow-xs border border-gray-100/50"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <Video className="w-4 h-4" />
              <span>MP4 (Video + Audio)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedType("mp3")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-sans text-sm font-bold transition-all ${
                selectedType === "mp3"
                  ? "bg-white text-indigo-600 shadow-xs border border-gray-100/50"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <Music className="w-4 h-4" />
              <span>MP3 (Audio conversion)</span>
            </button>
          </div>
        </div>

        {/* Quality select choices */}
        <div className="space-y-2">
          <label className="font-sans text-xs font-bold text-gray-400 uppercase tracking-widest">
            {selectedType === "mp4" ? "Video Quality / Resolution" : "Audio Bitrate / Compression"}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {formatsOfCurrentType.map((f) => (
              <div
                key={f.id}
                onClick={() => setSelectedFormatId(f.id)}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedFormatId === f.id
                    ? selectedType === "mp4"
                      ? "bg-red-50/20 border-red-500 text-red-700"
                      : "bg-indigo-50/20 border-indigo-500 text-indigo-700"
                    : "bg-white hover:bg-gray-50 border-gray-100 hover:border-gray-200 text-gray-700"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-sm font-bold uppercase">
                    {f.resolution}
                  </span>
                  <span className="font-sans text-xs text-gray-400 font-bold whitespace-nowrap">
                    {f.size}
                  </span>
                </div>
                <p className="font-sans text-xs text-gray-500 font-medium mt-1 truncate">
                  {f.note}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Rename file override input */}
        <div className="space-y-2">
          <label className="font-sans text-xs font-bold text-gray-400 uppercase tracking-widest flex justify-between items-center">
            <span>Filename</span>
            <span>.{selectedType}</span>
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={customFilename}
              onChange={(e) => setCustomFilename(e.target.value)}
              className="w-full h-11 px-4 bg-gray-50 focus:bg-white text-gray-800 placeholder-gray-400/80 rounded-xl border border-gray-100 focus:border-red-500 focus:ring-2 focus:ring-red-500/10 font-sans text-sm focus:outline-none transition-all"
            />
          </div>
          <p className="text-gray-400 text-[10px] font-sans font-medium">
            You can modify the destination file title before launching queue processor.
          </p>
        </div>

        {/* Setup actions block */}
        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Encrypted Stream Ready</span>
          </div>

          <button
            type="submit"
            disabled={isDownloading || !selectedFormatId}
            className={`px-8 h-12 rounded-full font-sans font-bold text-sm shadow-md flex items-center gap-2 transition-all active:scale-95 focus:outline-none ${
              isDownloading
                ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                : selectedType === "mp4"
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-red-200"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Process Download</span>
          </button>
        </div>
      </form>
    </div>
  );
}
