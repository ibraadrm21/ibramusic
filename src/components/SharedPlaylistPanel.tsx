import { LoadingSkeleton } from "./LoadingSkeleton";
import { useEffect, useState } from "react";
import { Music2, Play, AlertCircle, Link2, Copy, Users, Shield, ExternalLink, RotateCw } from "lucide-react";
import { Modal } from "./Modal";
import { supabase } from "../services/supabaseClient";
import { loadSharedPlaylist, shareableTracks, sharedPlaylistUrl, shareTable, updateSharedPlaylist, type SharedPlaylist, type Visibility } from "../services/playlistSharing";
import type { Playlist } from "../services/librarySync";
import type { Track } from "../services/musicApi";

const action = "rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 transition-all hover:border-white/20 hover:text-white disabled:opacity-50";
const primaryAction = "rounded-full bg-brand-accent px-4 py-2 text-xs font-semibold text-black shadow-md shadow-brand-accent/25 transition-all hover:bg-brand-accent/90 active:scale-95 disabled:opacity-50";
const shareAction = "inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-white disabled:opacity-50";
const field = "min-w-0 rounded-full border border-white/5 bg-white/5 px-3 py-2 text-xs text-white";

export function SharePlaylistManager({ playlist, account, onClose }: { playlist: Playlist; account: string; onClose: () => void }) {
  type Share = { id: string; visibility: Visibility };
  const [share, setShare] = useState<Share | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    void supabase.from(shareTable).select("id,visibility").eq("playlist_id", playlist.id).eq("owner_id", account).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadState(error.code === "PGRST205" || error.code === "42P01" ? "unavailable" : "error");
        else { setShare(data as Share | null); setLoadState("ready"); }
      });
    return () => { active = false; };
  }, [playlist.id, account, loadAttempt]);

  async function changeVisibility(visibility: Visibility) {
    setBusy(true);
    try {
      const updated = share
        ? await supabase.from(shareTable).update({ visibility }).eq("id", share.id).select("id,visibility").single()
        : await supabase.from(shareTable).insert({ playlist_id: playlist.id, visibility, name: playlist.name,
            tracks: shareableTracks(playlist.tracks), cover_url: playlist.coverUrl ?? "" }).select("id,visibility").single();
      if (updated.error) throw updated.error;
      setShare(updated.data as Share);
      setMessage("Visibilidad guardada.");
    } catch {
      setMessage("No se pudo guardar la visibilidad.");
    } finally {
      setBusy(false);
    }
  }

  async function editAccess(allow: boolean) {
    if (!share || !email.includes("@")) return;
    setBusy(true);
    try {
      const result = await supabase.rpc("ibramusic_manage_editor", { token: share.id, email_address: email.trim(), allow_access: allow });
      if (result.error) throw result.error;
      setMessage(allow ? "Permiso añadido. Envía el enlace de la lista a la persona invitada." : "Permiso retirado.");
      setEmail("");
    } catch {
      setMessage("No se pudo cambiar el permiso. Comprueba el correo del colaborador.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="Compartir con permisos" onClose={onClose}>
    <div className="grid gap-3">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-brand-accent"><Music2 className="size-4" aria-hidden="true" /></div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{playlist.name}</p>
          <p className="text-xs text-gray-400">Copia compartida de la playlist</p>
        </div>
      </div>
      {loadState === "loading" && <LoadingSkeleton layout="text" count={3} label="Cargando permisos…" />}
      {(loadState === "error" || loadState === "unavailable") && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p role="status" className="mr-auto flex items-center gap-2 text-xs text-gray-300">
            <AlertCircle className="size-4 shrink-0 text-red-400" aria-hidden="true" />
            {loadState === "unavailable" ? "Compartir con permisos aún no está habilitado en el servidor." : "No se pudieron cargar los permisos."}
          </p>
          <button type="button" className={shareAction} onClick={() => setLoadAttempt(attempt => attempt + 1)}><RotateCw className="size-3.5" aria-hidden="true" /> Reintentar</button>
        </div>
      )}
      {loadState === "ready" && <>
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <label className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-gray-300">
            <span className="flex items-center gap-2"><Shield className="size-4 text-gray-400" aria-hidden="true" /> Visibilidad</span>
            <select className={field} disabled={busy} value={share?.visibility ?? "private"} onChange={event => void changeVisibility(event.target.value as Visibility)}>
              <option value="private">Privada</option><option value="link">Cualquiera con el enlace</option><option value="public">Pública en el buscador</option>
            </select>
          </label>
          {!share && <button type="button" className={shareAction + " justify-self-start"} onClick={() => void changeVisibility("private")} disabled={busy}><Link2 className="size-3.5" aria-hidden="true" /> Crear copia privada</button>}
          {share && <div className="flex flex-wrap gap-2">
            <button type="button" className={shareAction} onClick={() => void navigator.clipboard.writeText(sharedPlaylistUrl(share.id).href).then(() => setMessage("Enlace copiado.")).catch(() => setMessage("No se pudo copiar."))}><Copy className="size-3.5" aria-hidden="true" /> Copiar enlace</button>
            <a href={sharedPlaylistUrl(share.id).href} className={shareAction}><ExternalLink className="size-3.5" aria-hidden="true" /> Abrir copia</a>
            <button type="button" className={shareAction + " !text-red-400 hover:bg-red-500/10"} disabled={busy} onClick={() => {
              if (!window.confirm("¿Revocar el enlace y todos los permisos de esta copia?")) return;
              setBusy(true);
              void supabase.from(shareTable).delete().eq("id", share.id)
                .then(({ error }) => { setBusy(false); setMessage(error ? "No se pudo revocar." : "Enlace y permisos revocados."); if (!error) setShare(null); });
            }}>Revocar enlace</button>
          </div>}
        </div>
        {share && <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <label className="grid gap-2 text-xs font-semibold text-gray-300">
            <span className="flex items-center gap-2"><Users className="size-4 text-gray-400" aria-hidden="true" /> Correo del colaborador</span>
            <input type="email" className={field} value={email} onChange={event => setEmail(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={shareAction} disabled={busy || !email.includes("@")} onClick={() => void editAccess(true)}>Dar permiso de edición</button>
            <button type="button" className={shareAction} disabled={busy || !email.includes("@")} onClick={() => void editAccess(false)}>Retirar permiso</button>
          </div>
        </div>}
      </>}
      {message && <p role="status" className="px-1 text-xs text-gray-300">{message}</p>}
    </div>
  </Modal>;
}

export function SharedPlaylistView({ token, account, onPlay, onLeave, onTrackContextMenu }: { token: string; account?: string; onPlay: (track: Track, queue?: Track[]) => void; onLeave: () => void; onTrackContextMenu: (event: React.MouseEvent, track: Track) => void }) {
  const [row, setRow] = useState<SharedPlaylist | null>(null);
  const [name, setName] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setMessage("");
    void loadSharedPlaylist(token).then(data => {
      if (!active) return;
      setRow(data);
      setName(data.name);
      setTracks(data.tracks);
      setMessage("");
    }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [token, account, attempt]);

  if (!row) return <section className="grid gap-3 text-white">
    {message ? <p role="status">{message}</p> : <LoadingSkeleton layout="detail" label="Cargando lista compartida…" />}
    {message && <button className={action} onClick={() => setAttempt(value => value + 1)}>Reintentar</button>}
    <button className={action} onClick={onLeave}>Volver a mi biblioteca</button>
  </section>;

  return <section className="grid gap-3 text-white">
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="mr-auto text-2xl font-bold">{editing ? "Editar lista compartida" : row.name}</h1>
      {row.can_edit && !editing && <button className={primaryAction} onClick={() => setEditing(true)}>Editar lista</button>}
      <button className={action} onClick={onLeave}>Mi biblioteca</button>
    </div>
    {row.can_edit && <p className="text-sm text-gray-400">Revisión {row.revision}{row.modified_by ? " · Último cambio: " + (row.modified_by === account ? "Tú" : "Colaborador " + row.modified_by.slice(0, 8)) : ""}</p>}
    {editing && <>
      <label className="grid gap-1 text-sm">Nombre<input className={field} maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
      <form className="flex flex-wrap gap-2" onSubmit={event => {
        event.preventDefault();
        if (!query.trim()) return;
        setBusy(true);
        void import("../services/musicApi").then(({ searchTracks }) => searchTracks(query)).then(found => setResults(found.slice(0, 8)))
          .catch(() => setMessage("No se pudo buscar.")).finally(() => setBusy(false));
      }}><input className={field} aria-label="Buscar una pista para la lista compartida" placeholder="Buscar canción" value={query} onChange={event => setQuery(event.target.value)} /><button className={action} disabled={busy}>Buscar</button></form>
      {results.length > 0 && <ul>{results.map(track => <li key={track.id} onContextMenu={event => onTrackContextMenu(event, track)}><button className={action} disabled={tracks.some(item => item.id === track.id)} onClick={() => setTracks([...tracks, track])}>Añadir {track.title}</button></li>)}</ul>}
    </>}
    <ul className="space-y-1">{(editing ? tracks : row.tracks).map((track, index) => <li key={track.id + index} onContextMenu={event => onTrackContextMenu(event, track)} className="group flex items-center gap-2 rounded-2xl px-2.5 transition-colors hover:bg-white/5 focus-within:bg-white/5">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 text-left" aria-label={"Reproducir " + track.title} onClick={() => onPlay(track, row.tracks)}>
        {track.thumbnail
          ? <img className="size-10 shrink-0 rounded-lg object-cover shadow-md shadow-black/30" src={track.thumbnail} alt="" loading="lazy" />
          : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-gray-400"><Music2 aria-hidden="true" className="size-4" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{track.title}</span>
          <span className="block truncate text-xs text-gray-400">{track.artist}</span>
        </span>
        <Play aria-hidden="true" className="mr-1 size-4 shrink-0 text-brand-accent" />
      </button>
      {editing && <button className={action} onClick={() => setTracks(tracks.filter((_, at) => at !== index))}>Quitar</button>}
    </li>)}</ul>
    {editing && <div className="flex flex-wrap gap-2">
      <button className={primaryAction} disabled={!name.trim() || busy} onClick={() => {
        setBusy(true);
        void updateSharedPlaylist(row, name, tracks).then(revision => {
          setRow({ ...row, name, tracks, revision, modified_by: account ?? null });
          setEditing(false);
          setMessage("");
        }).catch(error => setMessage(error.message)).finally(() => setBusy(false));
      }}>Guardar cambios</button>
      <button className={action} disabled={busy} onClick={() => { setEditing(false); setTracks(row.tracks); setName(row.name); setMessage(""); }}>Cancelar</button>
      {message && <button className={action} onClick={() => { setEditing(false); setAttempt(value => value + 1); }}>Cargar última revisión</button>}
    </div>}
    {message && <p role="status" className="text-sm text-gray-300">{message}</p>}
  </section>;
}
