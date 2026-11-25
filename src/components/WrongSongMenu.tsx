import { useEffect, useRef, useState, type FormEvent } from "react";
import { Play, Search, Square } from "lucide-react";
import { useAudio } from "../context/AudioContext";
import { useLanguage } from "../context/LanguageContext";
import { getYoutubeClient, type Track } from "../services/musicApi";
import { Modal } from "./Modal";

interface WrongSongMenuProps {
  track: Track;
  onClose: () => void;
}

interface Source {
  videoId: string;
  title: string;
  artist?: string;
  duration?: string;
}

const copy = {
  eu: {
    title: "Aukeratu audio-iturria",
    search: "Bilatu YouTuben",
    searchButton: "Bilatu",
    loading: "YouTuben bilatzen…",
    error: "YouTubeko bilaketak huts egin du. Saiatu berriro.",
    empty: "Ez da beste iturririk aurkitu. Saiatu beste bilaketa batekin.",
    preview: "Entzun lagina",
    stop: "Gelditu lagina",
    select: "Erabili hau",
  },
  en: {
    title: "Choose an audio source",
    search: "Search YouTube",
    searchButton: "Search",
    loading: "Searching YouTube…",
    error: "YouTube search failed. Try again.",
    empty: "No other sources found. Try a different search.",
    preview: "Preview",
    stop: "Stop preview",
    select: "Use this",
  },
  es: {
    title: "Elegir fuente de audio",
    search: "Buscar en YouTube",
    searchButton: "Buscar",
    loading: "Buscando en YouTube…",
    error: "La búsqueda en YouTube falló. Inténtalo de nuevo.",
    empty: "No hay otras fuentes. Prueba con otra búsqueda.",
    preview: "Preescuchar",
    stop: "Detener preescucha",
    select: "Usar esta",
  },
};

async function searchSources(query: string): Promise<Source[]> {
  const youtube = await getYoutubeClient();
  const [music, videos] = await Promise.allSettled([
    youtube.music.search(query, { type: "song" }),
    youtube.search(query, { type: "video" }),
  ]);
  if (music.status === "rejected" && videos.status === "rejected") throw videos.reason;

  const sources = new Map<string, Source>();
  const songs = music.status === "fulfilled" ? music.value.songs?.contents ?? [] : [];
  for (const song of songs) {
    if (!song.id || !/^[\w-]{11}$/.test(song.id) || !song.title) continue;
    sources.set(song.id, {
      videoId: song.id,
      title: song.title,
      artist: song.artists?.map(artist => artist.name).join(", ") || song.author?.name,
      duration: song.duration?.text,
    });
    if (sources.size === 5) break;
  }

  if (videos.status === "fulfilled") {
    for (const video of videos.value.videos) {
      if (!("id" in video) || !("title" in video)) continue;
      const title = video.title.toString();
      if (!/^[\w-]{11}$/.test(video.id) || !title || sources.has(video.id)) continue;
      sources.set(video.id, {
        videoId: video.id,
        title,
        artist: "author" in video ? video.author?.name : undefined,
        duration: "duration" in video ? video.duration?.text : undefined,
      });
      if (sources.size === 9) break;
    }
  }
  return Array.from(sources.values());
}

export function WrongSongMenu({ track, onClose }: WrongSongMenuProps) {
  const { chooseTrackSource, getTrackSourceVideoId, pauseForTrackPreview } = useAudio();
  const { language } = useLanguage();
  const labels = copy[language];
  const [currentVideoId] = useState(() => getTrackSourceVideoId(track));
  const [query, setQuery] = useState(`${track.artist} ${track.title}`.trim());
  const [search, setSearch] = useState(() => ({ query }));
  const [result, setResult] = useState<{ sources: Source[]; failed: boolean } | null>(null);
  const [preview, setPreview] = useState<Source | null>(null);
  const resumeAfterPreview = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    resumeAfterPreview.current?.();
  }, []);

  useEffect(() => {
    let active = true;
    void searchSources(search.query).then(
      sources => { if (active) setResult({ sources, failed: false }); },
      () => { if (active) setResult({ sources: [], failed: true }); },
    );
    return () => { active = false; };
  }, [search]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;
    setPreview(null);
    setResult(null);
    setSearch({ query: query.trim() });
  };

  const candidates = result?.sources.filter(source => source.videoId !== currentVideoId).slice(0, 8) ?? [];
  const status = !result ? labels.loading : result.failed ? labels.error : !candidates.length ? labels.empty : "";

  return (
    <Modal title={labels.title} onClose={onClose}>
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            type="search"
            aria-label={labels.search}
            placeholder={labels.search}
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-400"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim()}
          className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          {labels.searchButton}
        </button>
      </form>

      {status && <p className="mt-3 text-sm text-gray-300" role="status">{status}</p>}
      {candidates.length > 0 && (
        <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
          {candidates.map(source => {
            const isPreviewing = preview?.videoId === source.videoId;
            const previewLabel = isPreviewing ? labels.stop : labels.preview;
            return (
              <li key={source.videoId} className="flex items-center gap-2 rounded-xl p-1.5 transition-colors hover:bg-white/5 focus-within:bg-white/5">
                <button
                  type="button"
                  aria-label={`${previewLabel}: ${source.title}`}
                  aria-pressed={isPreviewing}
                  title={previewLabel}
                  onClick={() => {
                    if (isPreviewing) {
                      setPreview(null);
                    } else {
                      resumeAfterPreview.current ??= pauseForTrackPreview();
                      setPreview(source);
                    }
                  }}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-brand-accent transition-colors hover:bg-white/20"
                >
                  {isPreviewing ? <Square className="size-3.5" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p title={source.title} className="truncate text-sm font-semibold text-white">{source.title}</p>
                  <p className="truncate text-xs text-gray-400">{[source.artist, source.duration].filter(Boolean).join(" · ")}</p>
                </div>
                <button
                  type="button"
                  aria-label={`${labels.select}: ${source.title}`}
                  onClick={() => {
                    chooseTrackSource(track, source.videoId);
                    onClose();
                  }}
                  className="shrink-0 rounded-full border border-brand-accent/30 px-2.5 py-1.5 text-xs font-semibold text-brand-accent transition-colors hover:bg-brand-accent hover:text-black"
                >
                  {labels.select}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {preview && (
        <iframe
          key={preview.videoId}
          className="mt-3 aspect-video w-full rounded-xl bg-black"
          title={`${labels.preview}: ${preview.title}`}
          src={`https://www.youtube.com/embed/${preview.videoId}?autoplay=1&playsinline=1&rel=0`}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </Modal>
  );
}
