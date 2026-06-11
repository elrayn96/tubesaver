import React, { useState, useEffect } from "react";
import { VideoMetadata, Format } from "../types";
import { Video, Music, Sliders, Play, CheckCircle, ShieldCheck, Eye, Clock, Scissors, Layers, List } from "lucide-react";

interface PreviewSetupCardProps {
  video: VideoMetadata;
  onDownload: (formatId: string, filename: string) => void;
  onDownloadChapters: (format: "mp4" | "mp3", mode: "single" | "merge", selectedChapters: any[], customFilename: string) => void;
  isDownloading: boolean;
}

export default function PreviewSetupCard({ video, onDownload, onDownloadChapters, isDownloading }: PreviewSetupCardProps) {
  const [selectedType, setSelectedType] = useState<"mp4" | "mp3">("mp4");
  const [selectedFormatId, setSelectedFormatId] = useState<string>("");
  const [customFilename, setCustomFilename] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Chapters states
  const [chapterMode, setChapterMode] = useState<"full" | "single" | "merge">("full");
  const [selectedSingleIdx, setSelectedSingleIdx] = useState<number>(0);
  const [selectedMergeIndices, setSelectedMergeIndices] = useState<number[]>([]);

  // Populate state on load
  useEffect(() => {
    if (video) {
      setCustomFilename(video.title);
      setIsPlaying(false);
      
      // Select best default format
      const defaultFormat = video.formats.find(f => f.container === selectedType);
      if (defaultFormat) {
        setSelectedFormatId(defaultFormat.id);
      }

      // Reset chapters state
      setChapterMode("full");
      setSelectedSingleIdx(0);
      if (video.chapters && video.chapters.length > 0) {
        // By default check all chapters when starting merge mode
        setSelectedMergeIndices(video.chapters.map((_, i) => i));
      } else {
        setSelectedMergeIndices([]);
      }
    }
  }, [video, selectedType]);

  const formatsOfCurrentType = video.formats.filter(f => f.container === selectedType);

  const formatDurationText = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Compute selected dynamic chapters info
  const getSelectedChaptersInfo = () => {
    if (!video.chapters || video.chapters.length === 0) {
      return { durationSec: 0, sizeStr: "0 MB", count: 0, list: [] };
    }
    
    let list: any[] = [];
    if (chapterMode === "single") {
      const ch = video.chapters[selectedSingleIdx];
      if (ch) list = [ch];
    } else if (chapterMode === "merge") {
      list = video.chapters.filter((_, idx) => selectedMergeIndices.includes(idx));
    } else {
      // Full duration estimate
      const totalSec = video.duration.split(":").reduce((acc, time) => (60 * acc) + +time, 0);
      const minutes = totalSec / 60;
      const mbEstimate = selectedType === "mp3" ? minutes * 1.2 : minutes * 1.8;
      const sizeStr = mbEstimate < 1 ? `${Math.round(mbEstimate * 1024)} KB` : `${mbEstimate.toFixed(1)} MB`;
      return { durationSec: totalSec, sizeStr, count: video.chapters.length, list: video.chapters };
    }
    
    let totalSeconds = 0;
    list.forEach(ch => {
      totalSeconds += Math.max(0, ch.end - ch.start);
    });
    
    const minutes = totalSeconds / 60;
    const mbEstimate = selectedType === "mp3" ? minutes * 1.2 : minutes * 1.8;
    const sizeStr = mbEstimate < 1 ? `${Math.round(mbEstimate * 1024)} KB` : `${mbEstimate.toFixed(1)} MB`;
    
    return {
      durationSec: totalSeconds,
      sizeStr,
      count: list.length,
      list
    };
  };

  const chInfo = getSelectedChaptersInfo();

  const handleToggleMergeChapter = (idx: number) => {
    setSelectedMergeIndices(prev => {
      if (prev.includes(idx)) {
        return prev.filter(i => i !== idx);
      } else {
        return [...prev, idx].sort((a, b) => a - b);
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chapterMode === "full") {
      if (!selectedFormatId) return;
      onDownload(selectedFormatId, customFilename);
    } else {
      const { list } = getSelectedChaptersInfo();
      if (list.length === 0) {
        alert("Please select at least one chapter to download.");
        return;
      }
      onDownloadChapters(selectedType, chapterMode, list, customFilename);
    }
  };

  const hasChapters = video.chapters && video.chapters.length > 0;

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-12">
      {/* Left Column: Video Info & Thumbnail */}
      <div className="md:col-span-5 bg-gray-50/50 p-6 sm:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-gray-100">
        <div className="space-y-4">
          {/* Cover Art layout / Embedded Interactive Player */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-xs border border-gray-100 bg-black group">
            {isPlaying ? (
              <iframe
                src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1`}
                title="YouTube Video Preview"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full absolute inset-0"
              ></iframe>
            ) : (
              <div 
                onClick={() => setIsPlaying(true)}
                className="w-full h-full relative cursor-pointer group"
              >
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white/95 group-hover:bg-red-600 group-hover:text-white rounded-full flex items-center justify-center shadow-md transition-all">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
                <div className="absolute bottom-3 right-3 bg-black/75 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  {video.duration}
                </div>
              </div>
            )}
          </div>

          <div>
            <span className="font-mono text-[10px] text-red-600 font-bold uppercase py-1 px-2 bg-red-50 rounded-md">
              Single Video analyzed
            </span>
            <span className="ml-2 font-mono text-[10px] text-indigo-600 font-bold uppercase py-1 px-2 bg-indigo-50 rounded-md">
              {hasChapters ? `${video.chapters?.length} Chapters Detected` : "No Chapters"}
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

        {/* Chapter Download Mode Tabs (ONLY shown if chapters are present) */}
        {hasChapters && (
          <div className="space-y-2">
            <label className="font-sans text-xs font-bold text-gray-400 uppercase tracking-widest">
              Smart Download Mode
            </label>
            <div className="grid grid-cols-3 bg-gray-50 p-1 rounded-xl border border-gray-100 w-full">
              <button
                type="button"
                onClick={() => setChapterMode("full")}
                className={`py-2 rounded-lg font-sans text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                  chapterMode === "full"
                    ? "bg-white text-gray-900 shadow-xs border border-gray-100/50"
                    : "text-gray-500 hover:text-gray-850"
                }`}
              >
                <Video className="w-3.5 h-3.5 text-gray-450" />
                <span>Full Video</span>
              </button>
              
              <button
                type="button"
                onClick={() => setChapterMode("single")}
                className={`py-2 rounded-lg font-sans text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                  chapterMode === "single"
                    ? "bg-white text-red-600 shadow-xs border border-gray-100/50"
                    : "text-gray-500 hover:text-gray-850"
                }`}
              >
                <Scissors className="w-3.5 h-3.5 text-red-400" />
                <span>Single Chapter</span>
              </button>
              
              <button
                type="button"
                onClick={() => setChapterMode("merge")}
                className={`py-2 rounded-lg font-sans text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                  chapterMode === "merge"
                    ? "bg-white text-indigo-650 shadow-xs border border-gray-100/50"
                    : "text-gray-500 hover:text-gray-850"
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Merge Chapters</span>
              </button>
            </div>
          </div>
        )}

        {/* Conditional Chapter List Selection Renderings */}
        {chapterMode === "single" && video.chapters && (
          <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <label className="font-sans text-xs font-bold text-gray-500 uppercase tracking-wide flex justify-between">
              <span>Select One Chapter</span>
              <span>{video.chapters[selectedSingleIdx] ? formatDurationText(video.chapters[selectedSingleIdx].end - video.chapters[selectedSingleIdx].start) : ""}</span>
            </label>
            <select
              value={selectedSingleIdx}
              onChange={(e) => setSelectedSingleIdx(parseInt(e.target.value))}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 font-sans focus:ring-1 focus:ring-red-500 focus:outline-none"
            >
              {video.chapters.map((ch, idx) => (
                <option key={idx} value={idx}>
                  {ch.title} ({formatDurationText(ch.start)} - {formatDurationText(ch.end)})
                </option>
              ))}
            </select>
          </div>
        )}

        {chapterMode === "merge" && video.chapters && (
          <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <label className="font-sans text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">
              Select Chapters to Merge ({selectedMergeIndices.length} checked)
            </label>
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y divide-gray-100">
              {video.chapters.map((ch, idx) => {
                const isChecked = selectedMergeIndices.includes(idx);
                return (
                  <div 
                    key={idx} 
                    onClick={() => handleToggleMergeChapter(idx)}
                    className="flex items-center justify-between p-2 hover:bg-white rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // handled by click
                        className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-gray-800 truncate">{ch.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-450 whitespace-nowrap bg-gray-200 px-1.5 py-0.5 rounded ml-2">
                      {formatDurationText(ch.end - ch.start)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Form Output Info Panel before downloading */}
        {chapterMode !== "full" && (
          <div className="bg-red-50/20 border border-red-50 rounded-xl p-4 grid grid-cols-2 gap-4 text-center">
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Duration</p>
              <p className="font-mono text-base font-extrabold text-red-600">
                {formatDurationText(chInfo.durationSec)}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estimated Size</p>
              <p className="font-mono text-base font-extrabold text-indigo-600">
                {chInfo.sizeStr}
              </p>
            </div>
          </div>
        )}

        {/* Quality select choices (Only rendered during full download mode) */}
        {chapterMode === "full" && (
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
        )}

        {/* Dynamic metadata for chapter downloads */}
        {chapterMode !== "full" && (
          <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 shadow-3xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <p className="text-[10px] text-gray-500 leading-normal font-medium">
              Segmented chapters processing runs entirely on our high-performance stream core. No multiple network hits are made to save memory resources.
            </p>
          </div>
        )}

        {/* Rename file override input */}
        <div className="space-y-2">
          <label className="font-sans text-xs font-bold text-gray-400 uppercase tracking-widest flex justify-between items-center">
            <span>Filename Override</span>
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
            Modify destination file title before launching queue processor.
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
            disabled={isDownloading || (chapterMode === "full" && !selectedFormatId)}
            className={`px-8 h-12 rounded-full font-sans font-bold text-sm shadow-md flex items-center gap-2 transition-all active:scale-95 focus:outline-none ${
              isDownloading
                ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                : selectedType === "mp4"
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-red-200"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
            }`}
          >
            <Video className="w-4 h-4" />
            <span>
              {isDownloading 
                ? "Converting..." 
                : chapterMode === "full" 
                  ? "Prepare Download" 
                  : chapterMode === "single" 
                    ? "Slice & Download" 
                    : "Merge & Download"
              }
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
