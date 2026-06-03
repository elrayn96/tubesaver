import React from "react";
import { Download, History, PlayCircle } from "lucide-react";

interface TopNavBarProps {
  currentTab: "download" | "history";
  setTab: (tab: "download" | "history") => void;
  historyCount: number;
}

export default function TopNavBar({ currentTab, setTab, historyCount }: TopNavBarProps) {
  return (
    <nav className="sticky top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-xs">
      <div className="flex justify-between items-center h-16 px-6 max-w-7xl mx-auto">
        {/* Brand Logo and Title */}
        <div 
          className="flex items-center gap-2 cursor-pointer transition-transform active:scale-98"
          onClick={() => setTab("download")}
        >
          <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-200">
            <PlayCircle className="w-5 h-5 fill-white text-red-600" />
          </div>
          <span className="font-sans text-xl font-bold tracking-tight text-gray-900">
            Tube<span className="text-red-600">Saver</span>
          </span>
        </div>

        {/* Tab Navigation links */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("download")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-sans text-sm font-semibold transition-all ${
              currentTab === "download"
                ? "bg-red-50 text-red-600 shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Downloader</span>
          </button>

          <button
            onClick={() => setTab("history")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-sans text-sm font-semibold transition-all relative ${
              currentTab === "history"
                ? "bg-red-50 text-red-600 shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            <History className="w-4 h-4" />
            <span>History</span>
            {historyCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 flex items-center justify-center bg-red-600 text-white font-sans font-bold text-[10px] rounded-full ring-2 ring-white animate-pulse">
                {historyCount}
              </span>
            )}
          </button>
        </div>

        {/* Technical branding badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-gray-100/80 rounded-full border border-gray-200/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-mono text-[10px] text-gray-500 font-medium tracking-wider uppercase">core ready</span>
        </div>
      </div>
    </nav>
  );
}
