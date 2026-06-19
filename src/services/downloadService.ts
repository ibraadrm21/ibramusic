import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { Track } from './musicApi';

const DOWNLOAD_DIR = 'offline_music';

export interface DownloadStatus {
  isDownloaded: boolean;
  isDownloading: boolean;
  progress: number; // 0 to 1
  localUri?: string;
}

class DownloadService {
  private downloadedTracks: Set<string> = new Set();
  private downloadingTracks: Map<string, number> = new Map();

  constructor() {
    this.init();
  }

  private async init() {
    if (!Capacitor.isNativePlatform()) return;

    try {
      // Ensure download directory exists
      await Filesystem.mkdir({
        path: DOWNLOAD_DIR,
        directory: Directory.Data,
        recursive: true
      }).catch(() => {});

      // Load existing downloads from a manifest or scan directory
      const saved = localStorage.getItem('ibrastream_downloaded_ids');
      if (saved) {
        const ids = JSON.parse(saved);
        if (Array.isArray(ids)) {
          this.downloadedTracks = new Set(ids);
        }
      }
    } catch (e) {
      console.error('DownloadService init failed', e);
    }
  }

  public async downloadTrack(track: Track, getStreamUrl: (id: string) => Promise<string>): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Downloads are only available on Android/iOS');
    }

    if (this.downloadedTracks.has(track.id) || this.downloadingTracks.has(track.id)) {
      return;
    }

    try {
      this.downloadingTracks.set(track.id, 0);
      this.notifyStatusChange();

      // 1. Resolve stream URL
      const streamUrl = await getStreamUrl(track.id);

      // 2. Start download
      const fileName = `${track.id}.mp3`;
      const path = `${DOWNLOAD_DIR}/${fileName}`;

      await Filesystem.downloadFile({
        path,
        url: streamUrl,
        directory: Directory.Data,
        progress: true
      });

      // 3. Mark as downloaded
      this.downloadedTracks.add(track.id);
      this.downloadingTracks.delete(track.id);

      // Save manifest
      localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(Array.from(this.downloadedTracks)));

      // Save track metadata for offline mode
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
    if (!Capacitor.isNativePlatform()) return;

    try {
      await Filesystem.deleteFile({
        path: `${DOWNLOAD_DIR}/${trackId}.mp3`,
        directory: Directory.Data
      });
      this.downloadedTracks.delete(trackId);
      localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(Array.from(this.downloadedTracks)));
      localStorage.removeItem(`ibrastream_meta_${trackId}`);
      this.notifyStatusChange();
    } catch (e) {
      console.error(`Failed to delete download ${trackId}`, e);
    }
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
    try {
      const result = await Filesystem.getUri({
        path: `${DOWNLOAD_DIR}/${trackId}.mp3`,
        directory: Directory.Data
      });
      // For native media players (Media3/ExoPlayer), we must pass the raw file:// URI.
      // convertFileSrc is only needed if rendering/playing in the WebView itself.
      return Capacitor.isNativePlatform() ? result.uri : Capacitor.convertFileSrc(result.uri);
    } catch (e) {
      return null;
    }
  }

  private notifyStatusChange() {
    window.dispatchEvent(new CustomEvent('ibrastream_download_status_change'));
  }

  public isTrackDownloaded(trackId: string): boolean {
    return this.downloadedTracks.has(trackId);
  }
}

export const downloadService = new DownloadService();
