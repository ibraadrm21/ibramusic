import { useEffect, useState } from "react";
import { searchAlbums, type Album, type Artist } from "../services/musicApi";
import { normalizeSearch } from "../services/catalog";
import AlbumCard from "./AlbumCard";

export default function FollowedReleases({ artists, onOpen }: { artists: Artist[]; onOpen: (album: Album) => void }) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [kind, setKind] = useState("all");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    let active = true;
    const first = artists.slice(0, 5);
    void Promise.allSettled(first.map(artist => searchAlbums(artist.name))).then(results => {
      if (!active) return;
      const known = new Set(first.map(artist => normalizeSearch(artist.name)));
      const rows = results.flatMap(result => result.status === "fulfilled" ? result.value : [])
        .filter(album => album.releaseDate && [...known].some(name => normalizeSearch(album.artist).includes(name)))
        .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
      setAlbums([...new Map(rows.map(album => [album.id, album])).values()].slice(0, 24));
    });
    return () => { active = false; };
  }, [artists, loaded]);

  const filtered = albums.filter(album => {
    if (kind === "all") return true;
    const artist = normalizeSearch(album.artist);
    if (kind === "collab") return artists.some(item => artist.includes(normalizeSearch(item.name)) && artist !== normalizeSearch(item.name));
    const single = (album.numberOfTracks ?? 0) === 1 || /\b(single|ep)\b/i.test(album.title);
    return kind === "single" ? single : !single;
  });

  return (
    <details className="glass-panel rounded-[var(--app-radius-xl)] border border-white/5 p-4" onToggle={event => { if (event.currentTarget.open) setLoaded(true); }}>
      <summary className="cursor-pointer font-semibold text-white">Lanzamientos de artistas seguidos</summary>
      <label className="mt-3 flex items-center gap-2 text-sm text-gray-300">
        Tipo <select className="rounded-lg bg-brand-darkBg p-2 text-white" value={kind} onChange={event => setKind(event.target.value)}>
          <option value="all">Todo</option><option value="single">Sencillos y EP</option><option value="album">Álbumes</option><option value="collab">Colaboraciones</option>
        </select>
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">{filtered.map(album => <AlbumCard key={album.id} album={album} onClick={onOpen} />)}</div>
      {!filtered.length && <p className="mt-2 text-sm text-gray-300">No hay lanzamientos disponibles para este filtro.</p>}
    </details>
  );
}
