import { LoadingSkeleton } from "./LoadingSkeleton";
import { User } from "lucide-react";
import { localized, useLanguage } from "../context/LanguageContext";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { localDate, statsFor, type ListeningEntry } from "../services/listeningHistory";
import { normalizeSearch } from "../services/catalog";
import type { ListeningStats } from "../services/librarySync";
import { getArtistsFromTrack, resolveArtistIdentity, type Track } from "../services/musicApi";

interface StatsPanelProps {
  onTrackContextMenu: (event: React.MouseEvent, track: Track) => void;
  accumulatedStats: ListeningStats;
  entries: ListeningEntry[];
  playTrack: (track: Track) => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
}

interface RankingEntry {
  user_id: string;
  month: string;
  username: string;
  minutes: number;
}

const card = "glass-panel rounded-[var(--app-radius-xl)] border border-white/5 p-4";
const field = "rounded-full border border-white/5 bg-white/5 px-3 py-2 text-xs text-white";

function ArtistAvatar({ name, seed }: { name: string; seed?: Track }) {
  const [portrait, setPortrait] = useState<string>();
  useEffect(() => {
    let active = true;
    setPortrait(undefined);
    const credit = seed && getArtistsFromTrack(seed).find(artist => normalizeSearch(artist.name) === normalizeSearch(name));
    void resolveArtistIdentity({ id: credit?.id ?? "", name, thumbnail: "" }, seed).then(artist => {
      if (active) setPortrait(artist?.portrait);
    });
    return () => { active = false; };
  }, [name, seed]);
  return portrait
    ? <img alt="" loading="lazy" src={portrait} onError={() => setPortrait(undefined)} className="size-8 shrink-0 rounded-full object-cover" />
    : <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-gray-400"><User className="size-4" /></span>;
}

export default function StatsPanel({ accumulatedStats, entries, playTrack, showToast, onTrackContextMenu }: StatsPanelProps) {
  const { language, labels } = useLanguage();
  const l = (es: string, en: string, eu: string) => localized(language, es, en, eu);
  const readableDate = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "short" }), [language]);
  const [period, setPeriod] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [chart, setChart] = useState<"day" | "hour" | "week" | "month">("day");
  const [visible, setVisible] = useState(25);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [rankingStatus, setRankingStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  const now = new Date();
  const today = localDate(now);
  const currentMonth = today.slice(0, 7);
  const previousMonth = localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);

  useEffect(() => {
    let active = true;
    void supabase.from("user_monthly_stats").select("user_id,month,username,minutes")
      .in("month", [currentMonth, previousMonth]).order("minutes", { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (!active) return;
        setRanking(data ?? []);
        setRankingStatus(error ? "error" : "ready");
      });
    return () => { active = false; };
  }, [currentMonth, previousMonth, attempt]);

  const selected = useMemo(() => {
    const end = new Date(today + "T00:00:00");
    const begin = new Date(end);
    if (period === "year") begin.setMonth(0, 1);
    else if (period !== "all" && period !== "custom") begin.setDate(begin.getDate() - Number(period) + 1);
    end.setDate(end.getDate() + 1);
    const start = period === "all" ? 0 : period === "custom" ? from ? Date.parse(from + "T00:00:00") : 0 : begin.getTime();
    if (period === "custom" && to) {
      end.setTime(Date.parse(to + "T00:00:00"));
      end.setDate(end.getDate() + 1);
    }
    const endTime = end.getTime();
    const previousStart = start - (endTime - start);
    const items = entries.filter(item => item.at >= start && item.at < endTime);
    const previous = start > 0 ? entries.filter(item => item.at >= previousStart && item.at < start) : [];
    return { items, previous: statsFor(previous).totalSeconds };
  }, [period, from, to, entries, today]);

  const stats = useMemo(() => period === "all" ? accumulatedStats : statsFor(selected.items), [period, accumulatedStats, selected.items]);
  const topTracks = Object.values(stats.tracks).sort((a, b) => b.seconds - a.seconds).slice(0, 7);
  const topArtists = Object.values(stats.artists).sort((a, b) => b.seconds - a.seconds).slice(0, 7);
  const artistSeeds = useMemo(() => {
    const seeds = new Map<string, Track>();
    for (const { track } of Object.values(stats.tracks)) {
      for (const credit of getArtistsFromTrack(track)) {
        const name = normalizeSearch(credit.name);
        if (!seeds.has(name)) seeds.set(name, track);
      }
    }
    return seeds;
  }, [stats.tracks]);
  const plays = Object.values(stats.tracks).reduce((sum, item) => sum + item.count, 0);
  const filtered = selected.items.filter(item =>
    normalizeSearch(item.track.title + " " + item.track.artist + " " + (item.track.albumName ?? "")).includes(normalizeSearch(query)),
  ).slice().reverse();
  const bars = new Map<string, number>();
  for (const item of selected.items) {
    const date = new Date(item.at);
    if (chart === "week") date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    const key = chart === "hour" ? String(date.getHours()).padStart(2, "0") + ":00" : chart === "month" ? localDate(date).slice(0, 7) : localDate(date);
    bars.set(key, (bars.get(key) ?? 0) + item.seconds / 60);
  }
  const series = [...bars].sort(([a], [b]) => a.localeCompare(b));
  const maximum = Math.max(1, ...series.map(([, minutes]) => minutes));
  const unit = 10 ** Math.floor(Math.log10(maximum / 4));
  const step = ([1, 2, 5, 10].find(value => value * unit >= maximum / 4) ?? 10) * unit;
  const ceiling = step * 4;
  const axisNumber = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const axisDate = new Intl.DateTimeFormat(language, chart === "month" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  const formatBucket = (bucket: string) => chart === "hour" ? bucket : axisDate.format(new Date((chart === "month" ? bucket + "-01" : bucket) + "T12:00:00"));
  const currentRanking = ranking.filter(item => item.month === currentMonth).slice(0, 20);
  const priorWinner = ranking.find(item => item.month === previousMonth);

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-5 pb-8 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{labels.stats}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={l("Periodo", "Period", "Epea")} value={period} onChange={event => setPeriod(event.target.value)} className={field}>
            <option value="1">{l("Hoy", "Today", "Gaur")}</option><option value="7">{l("Últimos 7 días", "Last 7 days", "Azken 7 egunak")}</option><option value="30">{l("Últimos 30 días", "Last 30 days", "Azken 30 egunak")}</option><option value="90">{l("Últimos 90 días", "Last 90 days", "Azken 90 egunak")}</option>
            <option value="year">{l("Este año", "This year", "Aurten")}</option><option value="all">{l("Todo el tiempo", "All time", "Denbora guztia")}</option><option value="custom">{l("Fechas personalizadas", "Custom dates", "Data pertsonalizatuak")}</option>
          </select>
          {period === "custom" && <>
            <input aria-label={l("Desde", "From", "Hasiera")} type="date" value={from} max={to || today} onChange={event => setFrom(event.target.value)} className={field} />
            <input aria-label={l("Hasta", "To", "Amaiera")} type="date" value={to} min={from} max={today} onChange={event => setTo(event.target.value)} className={field} />
          </>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={card}><strong className="block text-2xl">{Math.floor(stats.totalSeconds / 60)}</strong><span className="text-sm text-gray-300">{l("Minutos escuchados", "Minutes listened", "Entzundako minutuak")}</span></div>
        <div className={card}><strong className="block text-2xl">{plays}</strong><span className="text-sm text-gray-300">{l("Reproducciones contabilizadas", "Counted plays", "Zenbatutako erreprodukzioak")}</span></div>
      </div>
      {period !== "all" && selected.previous > 0 && <p className="text-sm text-gray-300">{Math.floor(selected.previous / 60)} min en el periodo anterior equivalente.</p>}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{l("Tiempo de escucha", "Listening time", "Entzunaldi-denbora")}</h2>
          <select aria-label={l("Agrupar escucha", "Group listening time", "Taldekatu entzunaldiak")} value={chart} onChange={event => setChart(event.target.value as typeof chart)} className={field}>
            <option value="day">{l("Por día", "By day", "Egunaren arabera")}</option><option value="hour">{l("Por hora", "By hour", "Orduaren arabera")}</option><option value="week">{l("Por semana", "By week", "Astearen arabera")}</option><option value="month">{l("Por mes", "By month", "Hilabetearen arabera")}</option>
          </select>
        </div>
        {series.length ? (
          <div className="mt-5 flex gap-3">
            <div aria-hidden="true" className="mt-1.5 flex h-[7.75rem] shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-gray-400">
              {[4, 3, 2, 1, 0].map(tick => <span key={tick}>{axisNumber.format(step * tick)} min</span>)}
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto pt-2">
              <div role="group" aria-label={l("Tiempo de escucha", "Listening time", "Entzunaldi-denbora")} className="relative flex h-36 gap-1">
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-5 top-0 flex flex-col justify-between">
                  {[0, 1, 2, 3, 4].map(tick => <div key={tick} className="border-t border-white/10" />)}
                </div>
                {series.map(([bucket, mins], index) => {
                  const label = formatBucket(bucket);
                  const detail = label + " · " + axisNumber.format(mins) + " min";
                  return <div key={bucket} tabIndex={0} aria-label={detail} title={detail} className="group relative flex min-w-4 flex-1 flex-col justify-end rounded-sm">
                    <div className="stats-listen-bar rounded-t transition-colors" style={{ height: `calc((100% - 1.25rem) * ${mins / ceiling})` }} />
                    <span aria-hidden="true" className="h-5 truncate text-center text-[10px] text-gray-400">{index % Math.max(1, Math.ceil(Math.min(series.length, 36) / 7)) === 0 ? label : ""}</span>
                  </div>;
                })}
              </div>
            </div>
          </div>
        ) : <p className="mt-3 text-sm text-gray-300">{l("Aún no hay escucha registrada en este periodo.", "No listening history in this period yet.", "Oraindik ez dago entzunaldirik epe honetan.")}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 font-semibold">{l("Canciones más escuchadas", "Top songs", "Abesti entzunenak")}</h2>
          <ol className="space-y-2">{topTracks.map(item => <li key={item.track.id} onContextMenu={event => onTrackContextMenu(event, item.track)}><button className="flex w-full min-w-0 items-center gap-2 rounded-lg p-1 text-left text-sm hover:bg-white/5" onClick={() => playTrack(item.track)}><img alt="" loading="lazy" src={item.track.thumbnail} className="size-8 shrink-0 rounded object-cover" /><span className="min-w-0 flex-1 truncate" title={item.track.title}>{item.track.title}</span><span className="shrink-0 tabular-nums text-gray-400">{Math.floor(item.seconds / 60)} min</span></button></li>)}</ol>
        </div>
        <div className={card}>
          <h2 className="mb-3 font-semibold">{l("Artistas más escuchados", "Top artists", "Artista entzunenak")}</h2>
          <ol className="space-y-2">{topArtists.map(item => <li key={item.name} className="flex min-w-0 items-center gap-2 p-1 text-sm"><ArtistAvatar name={item.name} seed={artistSeeds.get(normalizeSearch(item.name))} /><span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span><span className="shrink-0 tabular-nums text-gray-400">{Math.floor(item.seconds / 60)} min</span>{stats.totalSeconds > 0 && <span className="min-w-12 shrink-0 text-right tabular-nums text-brand-accent">{axisNumber.format(100 * item.seconds / stats.totalSeconds)}%</span>}</li>)}</ol>
        </div>
      </div>
      <div className={card}>
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-semibold">{l("Historial de escucha", "Listening history", "Entzunaldien historia")}</h2>
          <input aria-label={l("Buscar en el historial", "Search listening history", "Bilatu historian")} value={query} onChange={event => { setQuery(event.target.value); setVisible(25); }} placeholder={l("Canción, artista o álbum", "Song, artist or album", "Abestia, artista edo albuma")} className={field} />
        </div>
        <ul className="mt-3">
          {filtered.slice(0, visible).map(item => <li key={item.id} onContextMenu={event => onTrackContextMenu(event, item.track)} className="flex flex-wrap justify-between gap-x-3 border-t border-white/10 py-2 text-sm">
            <button onClick={() => playTrack(item.track)} className="text-left hover:underline">{item.track.title} · {item.track.artist}</button>
            <time dateTime={new Date(item.at).toISOString()} className="text-gray-300">{readableDate.format(item.at)}</time>
          </li>)}
        </ul>
        {filtered.length > visible && <button className="mt-2 text-sm underline" onClick={() => setVisible(count => count + 25)}>{l("Ver más", "Show more", "Ikusi gehiago")}</button>}
      </div>
      <div className={card}>
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="font-semibold">{l("Clasificación del mes", "Monthly ranking", "Hileko sailkapena")}</h2>
          <button className="text-sm underline" onClick={() => {
            void navigator.clipboard.writeText("IbraMusic · " + Math.floor(stats.totalSeconds / 60) + " minutos escuchados · " + plays + " reproducciones")
              .then(() => showToast(l("Estadísticas copiadas.", "Stats copied.", "Estatistikak kopiatu dira."), "success")).catch(() => showToast(l("No se pudieron copiar.", "Couldn't copy stats.", "Ezin izan dira estatistikak kopiatu."), "error"));
          }}>{l("Compartir mis estadísticas", "Share my stats", "Partekatu nire estatistikak")}</button>
        </div>
        {rankingStatus === "loading" && <LoadingSkeleton layout="tracks" count={3} label={l("Cargando clasificación…", "Loading ranking…", "Sailkapena kargatzen…")} />}
        {rankingStatus === "error" && <button className="mt-2 text-sm underline" onClick={() => { setRankingStatus("loading"); setAttempt(value => value + 1); }}>{l("Reintentar clasificación", "Retry ranking", "Saiatu sailkapena berriro kargatzen")}</button>}
        {priorWinner && <p className="my-3 text-sm text-gray-300">{l("Mes anterior", "Previous month", "Aurreko hilabetea")} · {priorWinner.username} · {priorWinner.minutes} min</p>}
        <ol className="mt-2">{currentRanking.map(item => <li key={item.user_id} className="flex justify-between gap-2 border-t border-white/5 py-1.5 text-sm"><span>{item.username}</span><span>{item.minutes} min</span></li>)}</ol>
        {rankingStatus === "ready" && !currentRanking.length && <p className="mt-2 text-sm text-gray-300">{l("Aún no hay participantes este mes.", "No participants this month yet.", "Oraindik ez dago parte-hartzailerik hilabete honetan.")}</p>}
      </div>
    </section>
  );
}
