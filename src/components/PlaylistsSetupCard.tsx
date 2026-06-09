import React, { useState } from "react";
import { PlaylistMetadata, Format } from "../types";
import { CheckSquare, Square, Layers, Video, Music, Sliders, ShieldCheck, Download } from "lucide-react";

interface PlaylistsSetupCardProps {
  playlist: PlaylistMetadata;
  formats: Format[];
  onBatchDownload: (videoIds: string[], formatId: string) => void;
  isDownloading: boolean;
}

export default function PlaylistsSetupCard({ playlist, formats, onBatchDownload, isDownloading }: PlaylistsSetupCardProps) {
  const [selectedType, setSelectedType] = useState<"mp4" | "mp3">("mp4");
  const [selectedFormatId, setSelectedFormatId] = useState<string>(formats.find(f => f.container === "mp4")?.id || "");
  const [selectedVideos, setSelectedVideos] = useState<string[]>(playlist.videos.map(v => v.id));

  const filteredFormats = formats.filter(f => f.container === selectedType);

  const toggleVideo = (id: string) => {
    if (selectedVideos.includes(id)) {
      setSelectedVideos(selectedVideos.filter(vId => vId !== id));
    } else {
      setSelectedVideos([...selectedVideos, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedVideos.length === playlist.videos.length) {
      setSelectedVideos([]);
    } else {
      setSelectedVideos(playlist.videos.map(v => v.id));
    }
  };

  const currentTypeSelectedFormat = formats.find(f => f.id === selectedFormatId);
  // Guarantee selectedFormatId is valid when format type updates
  React.useEffect(() => {
    const freshDefault = formats.find(f => f.container === selectedType);
    if (freshDefault) {
      setSelectedFormatId(freshDefault.id);
    }
  }, [selectedType, formats]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedVideos.length === 0 || !selectedFormatId) return;
    onBatchDownload(selectedVideos, selectedFormatId);
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-12">
      {/* Left Column: List of raw videos */}
      <div className="md:col-span-6 bg-gray-50/50 p-6 sm:p-8 flex flex-col border-b md:border-b-0 md:border-r border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <div>
            <span className="font-mono text-[10px] text-red-600 font-bold uppercase py-1 px-2 bg-red-50 rounded-md">
              Playlist detected
            </span>
            <h2 className="font-sans text-lg font-extrabold text-gray-900 mt-2 line-clamp-1">
              {playlist.playlistTitle}
            </h2>
          </div>
        </div>

        {/* Action Toggle header */}
        <div className="flex justify-between items-center py-2.5 px-3 bg-white border border-gray-100 rounded-xl mb-4">
          <span className="font-sans text-xs font-bold text-gray-500">
            Selected items ({selectedVideos.length}/{playlist.videoCount})
          </span>
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-xs font-bold text-red-600 hover:text-red-700 transition-all focus:outline-none"
          >
            {selectedVideos.length === playlist.videoCount ? "Deselect All" : "Select All"}
          </button>
        </div>

        {/* Video cards list container */}
        <div className="space-y-2 flex-grow overflow-y-auto max-h-[340px] pr-1">
          {playlist.videos.map((v) => {
            const isChecked = selectedVideos.includes(v.id);
            return (
              <div
                key={v.id}
                onClick={() => toggleVideo(v.id)}
                className={`p-3 rounded-xl border-2 cursor-pointer flex items-center gap-3 transition-all ${
                  isChecked
                    ? "bg-white border-red-500 shadow-xs"
                    : "bg-white hover:bg-gray-50 border-gray-100"
                }`}
              >
                {/* Custom Checkbox elements */}
                <div className="text-red-600">
                  {isChecked ? (
                    <CheckSquare className="w-5 h-5 fill-red-50 text-red-600" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-300" />
                  )}
                </div>

                <img
                  src={v.thumbnail}
                  alt={v.title}
                  className="w-16 h-10 object-cover rounded-md bg-gray-100 border border-gray-100"
                  referrerPolicy="no-referrer"
                />

                <div className="min-w-0 flex-grow">
                  <p className="font-sans text-xs font-bold text-gray-900 truncate leading-snug">
                    {v.title}
                  </p>
                  <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{v.duration} • {v.author}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Active configurations settings */}
      <form onSubmit={handleSubmit} className="md:col-span-6 p-6 sm:p-8 space-y-6 flex flex-col justify-between">
        <div className="space-y-6">
          <h2 className="font-sans text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-red-600" />
            <span>Batch Setup</span>
          </h2>

          {/* Toggle Type format mp4 vs mp3 */}
          <div className="space-y-2">
            <label className="font-sans text-xs font-bold text-gray-400 uppercase tracking-widest">
              Destination Format
            </label>
            <div className="flex bg-gray-50 p-1.5 rounded-xl border border-gray-100/80 w-fit">
              <button
                type="button"
                onClick={() => setSelectedType("mp4")}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-sans text-xs font-bold transition-all ${
                  selectedType === "mp4"
                    ? "bg-white text-red-600 shadow-xs border border-gray-100/50"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>MP4 Video</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedType("mp3")}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-sans text-xs font-bold transition-all ${
                  selectedType === "mp3"
                    ? "bg-white text-indigo-600 shadow-xs border border-gray-100/50"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>MP3 Audio</span>
              </button>
            </div>
          </div>

          {/* Quality selections options list */}
          <div className="space-y-2">
            <label className="font-sans text-xs font-bold text-gray-400 uppercase tracking-widest">
              Set Quality Default (all files)
            </label>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {filteredFormats.map((f) => {
                const isSelected = selectedFormatId === f.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFormatId(f.id)}
                    className={`p-3 rounded-xl border-2 cursor-pointer flex justify-between items-center transition-all ${
                      isSelected
                        ? selectedType === "mp4"
                          ? "bg-red-50/20 border-red-500"
                          : "bg-indigo-50/20 border-indigo-500"
                        : "bg-white border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`font-mono text-xs font-bold uppercase ${isSelected ? (selectedType === "mp4" ? "text-red-700" : "text-indigo-700") : "text-gray-900"}`}>
                        {f.resolution} ({f.container})
                      </p>
                      <p className="font-sans text-[10px] text-gray-400 font-medium mt-0.5">{f.note}</p>
                    </div>
                    <span className="font-sans text-xs font-extrabold text-gray-500">~{f.size}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer trigger details */}
        <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs font-bold text-gray-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Parallel Batch Queue</span>
          </div>

          <button
            type="submit"
            disabled={isDownloading || selectedVideos.length === 0 || !selectedFormatId}
            className={`px-8 h-12 rounded-full font-sans font-bold text-sm shadow-md flex items-center gap-2 transition-all active:scale-95 focus:outline-none ${
              isDownloading || selectedVideos.length === 0
                ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                : selectedType === "mp4"
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-red-200"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Preparar {selectedVideos.length} Vídeos</span>
          </button>
        </div>
      </form>
    </div>
  );
}
