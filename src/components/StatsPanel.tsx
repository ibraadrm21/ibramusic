import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { localDate, statsFor, type ListeningEntry } from "../services/listeningHistory";
import { normalizeSearch } from "../services/catalog";
import type { ListeningStats } from "../services/librarySync";
import type { Track } from "../services/musicApi";

interface StatsPanelProps {
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
const readableDate = new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" });

export default function StatsPanel({ accumulatedStats, entries, playTrack, showToast }: StatsPanelProps) {
  const [period, setPeriod] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [chart, setChart] = useState<"day" | "hour">("day");
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

  const stats = period === "all" ? accumulatedStats : statsFor(selected.items);
  const topTracks = Object.values(stats.tracks).sort((a, b) => b.seconds - a.seconds).slice(0, 7);
  const topArtists = Object.values(stats.artists).sort((a, b) => b.seconds - a.seconds).slice(0, 7);
  const plays = Object.values(stats.tracks).reduce((sum, item) => sum + item.count, 0);
  const filtered = selected.items.filter(item =>
    normalizeSearch(item.track.title + " " + item.track.artist + " " + (item.track.albumName ?? "")).includes(normalizeSearch(query)),
  ).slice().reverse();
  const bars = new Map<string, number>();
  for (const item of selected.items) {
    const date = new Date(item.at);
    const key = chart === "hour" ? String(date.getHours()).padStart(2, "0") + ":00" : localDate(date);
    bars.set(key, (bars.get(key) ?? 0) + item.seconds / 60);
  }
  const series = [...bars].sort(([a], [b]) => a.localeCompare(b)).slice(chart === "day" ? -30 : 0);
  const maximum = Math.max(1, ...series.map(([, minutes]) => minutes));
  const currentRanking = ranking.filter(item => item.month === currentMonth).slice(0, 20);
  const priorWinner = ranking.find(item => item.month === previousMonth);

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-5 pb-8 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Estadísticas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Periodo" value={period} onChange={event => setPeriod(event.target.value)} className={field}>
            <option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option>
            <option value="year">Este año</option><option value="all">Todo el tiempo</option><option value="custom">Fechas personalizadas</option>
          </select>
          {period === "custom" && <>
            <input aria-label="Desde" type="date" value={from} max={to || today} onChange={event => setFrom(event.target.value)} className={field} />
            <input aria-label="Hasta" type="date" value={to} min={from} max={today} onChange={event => setTo(event.target.value)} className={field} />
          </>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={card}><strong className="block text-2xl">{Math.floor(stats.totalSeconds / 60)}</strong><span className="text-sm text-gray-300">Minutos escuchados</span></div>
        <div className={card}><strong className="block text-2xl">{plays}</strong><span className="text-sm text-gray-300">Reproducciones contabilizadas</span></div>
      </div>
      {period !== "all" && selected.previous > 0 && <p className="text-sm text-gray-300">{Math.floor(selected.previous / 60)} min en el periodo anterior equivalente.</p>}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Tiempo de escucha</h2>
          <select aria-label="Agrupar escucha" value={chart} onChange={event => setChart(event.target.value === "day" ? "day" : "hour")} className={field}>
            <option value="day">Por día</option><option value="hour">Por hora</option>
          </select>
        </div>
        {series.length ? (
          <div role="img" aria-label={series.map(([bucket, mins]) => bucket + ", " + mins.toFixed(1) + " min").join("; ")} className="mt-4 flex h-32 items-end gap-1">
            {series.map(([bucket, mins]) => <div key={bucket} title={bucket + " · " + mins.toFixed(1) + " min"} className="flex-1 rounded-t bg-brand-accent" style={{ height: Math.max(2, mins / maximum * 100) + "%" }} />)}
          </div>
        ) : <p className="mt-3 text-sm text-gray-300">Aún no hay escucha registrada en este periodo.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 font-semibold">Canciones más escuchadas</h2>
          <ol className="space-y-2">{topTracks.map(item => <li key={item.track.id}><button className="text-left text-sm hover:underline" onClick={() => playTrack(item.track)}>{item.track.title} · {Math.floor(item.seconds / 60)} min</button></li>)}</ol>
        </div>
        <div className={card}>
          <h2 className="mb-3 font-semibold">Artistas más escuchados</h2>
          <ol className="space-y-2">{topArtists.map(item => <li key={item.name} className="text-sm">{item.name} · {Math.floor(item.seconds / 60)} min</li>)}</ol>
        </div>
      </div>
      <div className={card}>
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-semibold">Historial de escucha</h2>
          <input aria-label="Buscar en el historial" value={query} onChange={event => { setQuery(event.target.value); setVisible(25); }} placeholder="Canción, artista o álbum" className={field} />
        </div>
        <ul className="mt-3">
          {filtered.slice(0, visible).map(item => <li key={item.id} className="flex flex-wrap justify-between gap-x-3 border-t border-white/10 py-2 text-sm">
            <button onClick={() => playTrack(item.track)} className="text-left hover:underline">{item.track.title} · {item.track.artist}</button>
            <time dateTime={new Date(item.at).toISOString()} className="text-gray-300">{readableDate.format(item.at)}</time>
          </li>)}
        </ul>
        {filtered.length > visible && <button className="mt-2 text-sm underline" onClick={() => setVisible(count => count + 25)}>Ver más</button>}
      </div>
      <div className={card}>
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="font-semibold">Clasificación del mes</h2>
          <button className="text-sm underline" onClick={() => {
            void navigator.clipboard.writeText("IbraMusic · " + Math.floor(stats.totalSeconds / 60) + " minutos escuchados · " + plays + " reproducciones")
              .then(() => showToast("Estadísticas copiadas.", "success")).catch(() => showToast("No se pudieron copiar.", "error"));
          }}>Compartir mis estadísticas</button>
        </div>
        {rankingStatus === "loading" && <p role="status" className="mt-2 text-sm">Cargando clasificación…</p>}
        {rankingStatus === "error" && <button className="mt-2 text-sm underline" onClick={() => { setRankingStatus("loading"); setAttempt(value => value + 1); }}>Reintentar clasificación</button>}
        {priorWinner && <p className="my-3 text-sm text-gray-300">Mes anterior · {priorWinner.username} · {priorWinner.minutes} min</p>}
        <ol className="mt-2">{currentRanking.map(item => <li key={item.user_id} className="flex justify-between gap-2 border-t border-white/5 py-1.5 text-sm"><span>{item.username}</span><span>{item.minutes} min</span></li>)}</ol>
        {rankingStatus === "ready" && !currentRanking.length && <p className="mt-2 text-sm text-gray-300">Aún no hay participantes este mes.</p>}
      </div>
    </section>
  );
}
