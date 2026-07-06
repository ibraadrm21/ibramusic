import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, registerPlugin, CapacitorHttp } from '@capacitor/core';
import type { Track } from './musicApi';

const DOWNLOAD_DIR = 'offline_music';
const Media3Session = (Capacitor as any).Plugins?.Media3Session || registerPlugin<any>("Media3Session");

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
    // 1. Pre-load cached manifest from localStorage for immediate UI availability
    const saved = localStorage.getItem('ibrastream_downloaded_ids');
    if (saved) {
      try {
        const ids = JSON.parse(saved);
        if (Array.isArray(ids)) {
          this.downloadedTracks = new Set(ids);
        }
      } catch (e) {}
    }

    // Electron integration
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const electronAPI = (window as any).electronAPI;
      try {
        const ids = await electronAPI.getDownloadedTrackIds();
        this.downloadedTracks = new Set(ids);
        localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(ids));

        electronAPI.onDownloadProgress((data: { trackId: string; progress: number }) => {
          this.downloadingTracks.set(data.trackId, data.progress / 100);
          this.notifyStatusChange();
        });
        electronAPI.onDownloadCompleted((data: { trackId: string; filePath: string }) => {
          this.downloadedTracks.add(data.trackId);
          this.downloadingTracks.delete(data.trackId);
          localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(Array.from(this.downloadedTracks)));
          this.notifyStatusChange();
        });
        electronAPI.onDownloadFailed((data: { trackId: string; error: string }) => {
          this.downloadingTracks.delete(data.trackId);
          this.notifyStatusChange();
        });
      } catch (err) {
        console.error("Failed to initialize Electron download sync:", err);
      }
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      // Web Cache API syncing
      try {
        const cache = await caches.open('ibrastream_offline_music');
        const keys = await cache.keys();
        const cachedIds = keys.map(request => {
          // If we cache by trackId as request URL, extract it
          const url = new URL(request.url);
          return url.pathname.split('/').pop() || "";
        }).filter(Boolean);
        this.downloadedTracks = new Set(cachedIds);
        localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(cachedIds));
      } catch (e) {
        console.warn('Failed to sync Web Cache API keys:', e);
      }
      return;
    }

    try {
      // Ensure download directory exists (Native Platform)
      await Filesystem.mkdir({
        path: DOWNLOAD_DIR,
        directory: Directory.Data,
        recursive: true
      }).catch(() => {});

      // Scan directory to discover completed downloads
      try {
        const result = await Filesystem.readdir({
          path: DOWNLOAD_DIR,
          directory: Directory.Data
        });
        const ids = result.files
          .map(f => typeof f === 'string' ? f : f.name)
          .filter(name => name.endsWith('.mp3'))
          .map(name => name.replace('.mp3', ''));
        this.downloadedTracks = new Set(ids);
        localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(ids));
      } catch (scanErr) {
        // Fallback to localStorage if disk read fails
        console.warn('Failed native directory scan, using localStorage fallback', scanErr);
      }

      // Add listener for native background download progress events (for when Native background service is active)
      if (Capacitor.getPlatform() === 'android' && typeof Media3Session.addListener === 'function') {
        try {
          Media3Session.addListener('downloadProgress', (data: { trackId: string; progress: number }) => {
            if (this.downloadingTracks.has(data.trackId)) {
              this.downloadingTracks.set(data.trackId, data.progress);
              this.notifyStatusChange();
            }
          });
        } catch (e) {
          console.warn('Failed to register native Media3Session download listener:', e);
        }
      }
    } catch (e) {
      console.error('DownloadService init failed', e);
    }
  }

  public async downloadTrack(track: Track, getStreamUrl: (id: string) => Promise<string>): Promise<void> {
    if (this.downloadedTracks.has(track.id) || this.downloadingTracks.has(track.id)) {
      return;
    }

    try {
      this.downloadingTracks.set(track.id, 0);
      this.notifyStatusChange();

      // 1. Resolve stream URL
      const streamUrl = await getStreamUrl(track.id);

      // Electron Integration
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        (window as any).electronAPI.downloadTrack(track, streamUrl);
        return;
      }

      // Web Browser Cache API Fallback
      if (!Capacitor.isNativePlatform()) {
        console.log(`[Downloader] Starting web browser Cache API download for: ${track.id}`);
        this.downloadingTracks.set(track.id, 0.2);
        this.notifyStatusChange();

        const res = await fetch(streamUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch audio stream: ${res.status}`);
        }

        this.downloadingTracks.set(track.id, 0.6);
        this.notifyStatusChange();

        const cache = await caches.open('ibrastream_offline_music');
        // Store the response against the track ID
        await cache.put(track.id, res);

        // Mark as downloaded
        this.downloadedTracks.add(track.id);
        this.downloadingTracks.delete(track.id);

        localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(Array.from(this.downloadedTracks)));
        localStorage.setItem(`ibrastream_meta_${track.id}`, JSON.stringify(track));

        this.notifyStatusChange();
        return;
      }

      // Note: Native Android background download is currently bypassed because downloadTrackBackground
      // is not implemented on the native Java plugin. Fallback to robust chunked filesystem downloader.
      /*
      if (Capacitor.getPlatform() === 'android') {
        ...
      }
      */

      const fileName = `${track.id}.mp3`;
      const path = `${DOWNLOAD_DIR}/${fileName}`;
      const tempPath = `${path}.tmp`;

      // Clean up any existing temp or partial files
      try {
        await Filesystem.deleteFile({
          path,
          directory: Directory.Data
        });
      } catch (err) {}
      try {
        await Filesystem.deleteFile({
          path: tempPath,
          directory: Directory.Data
        });
      } catch (err) {}

      const headers = {
        "User-Agent": "com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)"
      };

      console.log(`[Downloader] Querying range/size support for ${track.id}...`);
      let totalBytes = 0;
      let rangeSupported = false;

      const getHeader = (headers: any, name: string): string | undefined => {
        if (!headers) return undefined;
        const lowerName = name.toLowerCase();
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === lowerName) {
            return headers[key];
          }
        }
        return undefined;
      };

      try {
        const response = await CapacitorHttp.request({
          url: streamUrl,
          method: 'GET',
          headers: {
            ...headers,
            'Range': 'bytes=0-0'
          },
          responseType: 'text'
        });
        if (response.status === 200 || response.status === 206) {
          const contentRange = getHeader(response.headers, 'content-range');
          if (contentRange) {
            const match = contentRange.match(/\/(\d+)$/);
            if (match) {
              totalBytes = parseInt(match[1], 10);
              rangeSupported = true;
            }
          }
        }
      } catch (err) {
        console.warn('[Downloader] Range check failed, falling back to full download', err);
      }

      console.log(`[Downloader] Total size: ${totalBytes} bytes, Range supported: ${rangeSupported}`);

      const chunkSize = 1024 * 1024; // 1MB chunks

      if (rangeSupported && totalBytes > 0) {
        let downloadedBytes = 0;
        while (downloadedBytes < totalBytes) {
          const end = Math.min(downloadedBytes + chunkSize - 1, totalBytes - 1);
          console.log(`[Downloader] Downloading chunk ${downloadedBytes}-${end} / ${totalBytes}...`);

          let chunkResponse: any = null;
          let retries = 3;
          while (retries > 0) {
            try {
              chunkResponse = await CapacitorHttp.request({
                url: streamUrl,
                method: 'GET',
                headers: {
                  ...headers,
                  'Range': `bytes=${downloadedBytes}-${end}`
                },
                responseType: 'arraybuffer'
              });
              if (chunkResponse.status === 206 || chunkResponse.status === 200) {
                break;
              }
            } catch (chunkErr) {
              console.warn(`[Downloader] Chunk download failed. Retries remaining: ${retries - 1}`, chunkErr);
            }
            retries--;
            if (retries === 0) {
              throw new Error(`Failed to download chunk ${downloadedBytes}-${end}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          if (!chunkResponse || !chunkResponse.data) {
            throw new Error(`Failed to get data for chunk ${downloadedBytes}-${end}`);
          }

          const base64Data = chunkResponse.data;

          if (downloadedBytes === 0) {
            await Filesystem.writeFile({
              path: tempPath,
              data: base64Data,
              directory: Directory.Data,
              recursive: true
            });
          } else {
            await Filesystem.appendFile({
              path: tempPath,
              data: base64Data,
              directory: Directory.Data
            });
          }

          downloadedBytes += (end - downloadedBytes + 1);
          const progress = Math.min(downloadedBytes / totalBytes, 1);
          this.downloadingTracks.set(track.id, progress);
          this.notifyStatusChange();
        }
      } else {
        // Fallback to fetching the entire file in one request if range requests aren't supported
        console.log(`[Downloader] Performing full fetch download for ${track.id}...`);
        
        this.downloadingTracks.set(track.id, 0.2);
        this.notifyStatusChange();

        const response = await CapacitorHttp.request({
          url: streamUrl,
          method: 'GET',
          headers,
          responseType: 'arraybuffer'
        });

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Failed to download full stream: ${response.status}`);
        }

        this.downloadingTracks.set(track.id, 0.6);
        this.notifyStatusChange();

        const base64Data = response.data;

        await Filesystem.writeFile({
          path: tempPath,
          data: base64Data,
          directory: Directory.Data,
          recursive: true
        });
      }

      // Rename tmp file to final destination
      await Filesystem.rename({
        from: tempPath,
        to: path,
        directory: Directory.Data,
        toDirectory: Directory.Data
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
      alert(`Download Error for ${track.title}: ` + (e instanceof Error ? e.message : String(e)));
      throw e;
    }
  }

  public async removeDownload(trackId: string): Promise<void> {
    // Electron Integration
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      try {
        await (window as any).electronAPI.deleteOfflineTrack(trackId);
        this.downloadedTracks.delete(trackId);
        localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(Array.from(this.downloadedTracks)));
        this.notifyStatusChange();
      } catch (e) {
        console.error("Failed to delete Electron offline download:", e);
      }
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      try {
        const cache = await caches.open('ibrastream_offline_music');
        await cache.delete(trackId);
        this.downloadedTracks.delete(trackId);
        localStorage.setItem('ibrastream_downloaded_ids', JSON.stringify(Array.from(this.downloadedTracks)));
        localStorage.removeItem(`ibrastream_meta_${trackId}`);
        this.notifyStatusChange();
      } catch (e) {
        console.error(`Failed to delete browser cached download ${trackId}`, e);
      }
      return;
    }

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

    // Electron Integration
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      try {
        return await (window as any).electronAPI.getOfflineTrackPath(trackId);
      } catch (e) {
        console.error("Failed to resolve Electron offline path:", e);
        return null;
      }
    }

    if (!Capacitor.isNativePlatform()) {
      try {
        const cache = await caches.open('ibrastream_offline_music');
        const response = await cache.match(trackId);
        if (response) {
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        }
      } catch (e) {
        console.warn("Failed to get local blob URI from Cache API:", e);
      }
      return null;
    }

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
