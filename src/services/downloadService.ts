import type { Track } from './musicApi';

export interface DownloadStatus {
  isDownloaded: boolean;
  isDownloading: boolean;
  progress: number; // 0 to 1
  localUri?: string;
}

const CACHE_NAME = 'ibrastream_offline_music';

class DownloadService {
  private downloadedTracks: Set<string> = new Set();
  private downloadingTracks: Map<string, number> = new Map();

  constructor() {
    this.init();
  }

  private async init() {
    const saved = localStorage.getItem('ibrastream_downloaded_ids');
    if (saved) {
      try {
        const ids = JSON.parse(saved);
        if (Array.isArray(ids)) {
          this.downloadedTracks = new Set(ids);
        }
      } catch (e) {}
    }

    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        const cachedIds = keys.map(request => {
          const url = new URL(request.url);
          return url.pathname.split('/').pop() || "";
        }).filter(Boolean);
        
        if (cachedIds.length > 0) {
          this.downloadedTracks = new Set(cachedIds);
          localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(cachedIds));
        }
      } catch (e) {
        console.warn('Failed to sync Web Cache API keys:', e);
      }
    }
  }

  public async downloadTrack(track: Track, getStreamUrl?: (id: string) => Promise<string>): Promise<void> {
    if (this.downloadedTracks.has(track.id) || this.downloadingTracks.has(track.id)) {
      return;
    }

    try {
      this.downloadingTracks.set(track.id, 0.1);
      this.notifyStatusChange();

      let streamUrl: string;
      if (getStreamUrl) {
        streamUrl = await getStreamUrl(track.id);
      } else {
        const { getYouTubeAudioStream, getYouTubeVideoId } = await import("./musicApi");
        const videoId = await getYouTubeVideoId(track);
        streamUrl = await getYouTubeAudioStream(videoId);
      }

      this.downloadingTracks.set(track.id, 0.4);
      this.notifyStatusChange();

      const res = await fetch(streamUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch audio stream: ${res.status}`);
      }

      this.downloadingTracks.set(track.id, 0.8);
      this.notifyStatusChange();

      if ('caches' in window) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(track.id, res);
      }

      this.downloadedTracks.add(track.id);
      this.downloadingTracks.delete(track.id);

      localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(Array.from(this.downloadedTracks)));
      localStorage.setItem(`ibrastream_meta_${track.id}`, JSON.stringify(track));

      this.notifyStatusChange();
    } catch (e) {
      console.error(`Failed to download track ${track.id}`, e);
      this.downloadingTracks.delete(track.id);
      this.notifyStatusChange();
      throw e;
    }
  }

  public async removeDownload(trackId: string): Promise<void> {
    try {
      if ('caches' in window) {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(trackId);
      }
      this.downloadedTracks.delete(trackId);
      localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(Array.from(this.downloadedTracks)));
      localStorage.removeItem(`ibrastream_meta_${trackId}`);
      this.notifyStatusChange();
    } catch (e) {
      console.error(`Failed to delete browser cached download ${trackId}`, e);
    }
  }

  public async deleteTrack(trackId: string): Promise<void> {
    return this.removeDownload(trackId);
  }

  public getStatus(trackId: string): DownloadStatus {
    return {
      isDownloaded: this.downloadedTracks.has(trackId),
      isDownloading: this.downloadingTracks.has(trackId),
      progress: this.downloadingTracks.get(trackId) || 0,
    };
  }

  public async getLocalUri(trackId: string): Promise<string | null> {
    if (!this.downloadedTracks.has(trackId)) return null;

    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(trackId);
        if (response) {
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        }
      } catch (e) {
        console.warn("Failed to get local blob URI from Cache API:", e);
      }
    }
    return null;
  }

  public isTrackDownloaded(trackId: string): boolean {
    return this.downloadedTracks.has(trackId);
  }

  private notifyStatusChange() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ibrastream_download_status_change'));
    }
  }
}

export const downloadService = new DownloadService();
