export interface Format {
  id: string;
  container: string;
  resolution: string;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  size: string;
  note: string;
}

export interface VideoMetadata {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
  author: string;
  viewCount?: string;
  formats: Format[];
  chapters?: Array<{
    title: string;
    start: number;
    end: number;
  }>;
}

export interface PlaylistVideo {
  id: string;
  title: string;
  videoId: string;
  thumbnail: string;
  duration: string;
  author: string;
}

export interface PlaylistMetadata {
  playlistTitle: string;
  playlistId: string;
  videoCount: number;
  videos: PlaylistVideo[];
}

export interface DownloadTask {
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

export interface HistoryItem {
  id: string;
  title: string;
  videoId: string;
  thumbnail: string;
  duration: string;
  format: string;
  type: "video" | "audio";
  date: string;
  size: string;
}
