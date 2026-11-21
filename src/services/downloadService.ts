import type { Track } from "./musicApi";
import { readAudioTags } from "./audioTags";
import { StorageService } from "./storageService";

const CACHE_NAME = "ibrastream_offline_music";
const METADATA_KEY = "ibrastream_download_library";
const UPDATE_EVENT = "ibrastream_download_status_change";

interface StoredDownload {
  track: Track;
  bytes: number;
}

class DownloadService {
  private downloads = new Map<string, StoredDownload>();
  private ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    try {
      const cache = await caches.open(CACHE_NAME);
      const [saved, requests] = await Promise.all([
        StorageService.getItem<StoredDownload[]>(METADATA_KEY),
        cache.keys(),
      ]);
      const entries = new Map((Array.isArray(saved) ? saved : []).map(item => [item.track.id, item]));
      for (const request of requests) {
        const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() || "");
        const entry = entries.get(id);
        const legacy = entry?.track ?? StorageService.getItemSync<Track>("ibrastream_meta_" + id);
        if (legacy?.id === id) this.downloads.set(id, { track: legacy, bytes: entry?.bytes ?? 0 });
      }
      this.notify();
    } catch {
      // Cache Storage can be unavailable in restricted browser sessions.
    }
  }

  async addLocalFile(file: File): Promise<Track> {
    await this.ready;
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|ogg|opus|flac|aac|webm)$/i.test(file.name)) {
      throw new Error("Formato de audio no reconocido");
    }
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("El archivo no se pudo abrir")), 10000);
        const complete = (error?: Error) => {
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        };
        audio.preload = "metadata";
        audio.onloadedmetadata = () => complete();
        audio.onerror = () => complete(new Error("El navegador no puede leer el formato"));
        audio.src = url;
      });
      const tags = await readAudioTags(file).catch(() => ({} as Awaited<ReturnType<typeof readAudioTags>>));
      const name = file.name.replace(/\.[^./]+$/, "");
      const [artist, title] = name.split(/\s+-\s+(.+)/, 2);
      const track: Track = {
        id: "local-" + crypto.randomUUID(),
        title: tags.title || title || name,
        artist: tags.artist || (title ? artist : "Archivo local"),
        albumName: tags.albumName,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        thumbnail: tags.thumbnail || "./favicon.svg",
        audioUrl: "",
      };
      const cache = await caches.open(CACHE_NAME);
      await cache.put(this.key(track.id), new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream" } }));
      await this.remember({ track, bytes: file.size });
      this.notify();
      return track;
    } finally {
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    }
  }

  async removeDownload(trackId: string): Promise<void> {
    await this.ready;
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(this.key(trackId));
    await cache.delete(trackId);
    this.downloads.delete(trackId);
    await this.persist();
    this.notify();
  }

  async deleteTrack(trackId: string): Promise<void> {
    return this.removeDownload(trackId);
  }

  listTracks(): Track[] {
    return [...this.downloads.values()].map(item => item.track);
  }

  async getLocalUri(trackId: string): Promise<string | null> {
    await this.ready;
    if (!this.downloads.has(trackId)) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(this.key(trackId)) ?? await cache.match(trackId);
      if (response) return URL.createObjectURL(await response.blob());
      this.downloads.delete(trackId);
      await this.persist();
      this.notify();
    } catch {
      // Continue with remote playback when the local cache cannot be read.
    }
    return null;
  }

  isTrackDownloaded(trackId: string): boolean {
    return this.downloads.has(trackId);
  }

  private key(id: string) {
    return new URL("/_ibramusic_audio/" + encodeURIComponent(id), location.origin).href;
  }

  private async remember(item: StoredDownload) {
    this.downloads.set(item.track.id, item);
    await this.persist();
  }

  private persist() {
    return StorageService.setItem(METADATA_KEY, [...this.downloads.values()]);
  }

  private notify() {
    window.dispatchEvent(new Event(UPDATE_EVENT));
  }
}

export const downloadService = new DownloadService();
