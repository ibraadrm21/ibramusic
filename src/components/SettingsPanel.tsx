import { localized, type Language } from "../context/LanguageContext";
import { equalizerFrequencies, equalizerPresets } from "../services/localPlayback";
import React, { useState, useEffect } from "react";
import { 
  Eye, Clock, Trash2, ShieldAlert, Sparkles, HardDrive, Waves, ShieldOff, Mic,
  Globe, Download, RefreshCw, AlertTriangle, Keyboard, Activity, Info,
  ChevronDown, Smartphone
} from "lucide-react";
import { useAudio } from "../context/AudioContext";
import { METRICS_KEY, type Metric } from "../services/metrics";
import { StorageService } from "../services/storageService";
import type { Playlist } from "../services/librarySync";

import type { AmbientMode } from "../services/coverArt";

export interface SettingsPanelProps {
  ambientMode: AmbientMode;
  onAmbientModeChange: (mode: AmbientMode) => void;
  liquidGlassEnabled?: boolean;
  onToggleLiquidGlass?: () => void;
  themeSettings?: { theme: "dark" | "bright" | "noir"; [key: string]: any };
  setThemeSettings?: React.Dispatch<React.SetStateAction<any>>;
  filterExplicit?: boolean;
  onToggleFilterExplicit?: () => void;
  // Account & Sync
  userId?: string | null;
  language?: Language;
  onLanguageChange?: (lang: Language) => void;
  syncState?: "saved" | "pending" | "syncing" | "offline" | "error";
  syncError?: string;
  onRetrySync?: () => void;
  rankingPreference?: "public" | "anonymous" | "off";
  rankingBusy?: boolean;
  onChangeRanking?: (pref: "public" | "anonymous" | "off") => void;
  onDeleteAccount?: () => void;
  // Library & Data
  hiddenPlaylists?: Playlist[];
  onShowPlaylist?: (playlist: Playlist) => void;
  onOpenHiddenPlaylist?: (playlist: Playlist) => void;
  onExportLibrary?: () => void;
  onClearHistory?: () => void;
  hasCustomRecommendations?: boolean;
  onResetRecommendations?: () => void;
  // PWA Install
  canInstall?: boolean;
  onInstall?: () => void;
  installHelp?: boolean;
  onToggleInstallHelp?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  ambientMode,
  onAmbientModeChange,
  liquidGlassEnabled = true,
  onToggleLiquidGlass,
  themeSettings, 
  setThemeSettings,
  filterExplicit,
  onToggleFilterExplicit,
  userId,
  language = "es",
  onLanguageChange,
  syncState = "saved",
  syncError,
  onRetrySync,
  rankingPreference = "off",
  rankingBusy = false,
  onChangeRanking,
  onDeleteAccount,
  hiddenPlaylists = [],
  onShowPlaylist,
  onOpenHiddenPlaylist,
  onExportLibrary,
  onClearHistory,
  hasCustomRecommendations = false,
  onResetRecommendations,
  canInstall = false,
  onInstall,
  installHelp = false,
  onToggleInstallHelp
}) => {
  const {
    autoplay,
    setAutoplay,
    smartShuffle,
    setSmartShuffle,
    privateSession,
    setPrivateSession,
    ambientGlowEnabled,
    setAmbientGlowEnabled,
    seamlessTransitions,
    setSeamlessTransitions,
    seamlessDuration,
    setSeamlessDuration,
    sleepTimerRemaining,
    startSleepTimer,
    cancelSleepTimer,
    showToast,
    lyricsProvider,
    setLyricsProvider,
    lyricsWordByWord,
    setLyricsWordByWord,
    equalizer,
    setEqualizer,
  } = useAudio();

  const currentTheme = themeSettings?.theme || (document.documentElement.getAttribute("data-theme") as "dark" | "bright" | "noir") || "dark";

  const [customTimerMinutes, setCustomTimerMinutes] = useState<number>(30);
  const metrics = StorageService.getItemSync<Partial<Record<Metric, { count: number; mean: number }>>>(METRICS_KEY);
  const [offlineReady, setOfflineReady] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const sync = () => setOfflineReady(!!navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", sync);
    sync();
    return () => navigator.serviceWorker.removeEventListener("controllerchange", sync);
  }, []);

  const [cachedLyricsCount, setCachedLyricsCount] = useState<number>(0);

  useEffect(() => {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("ibrastream_lyrics_") || key.startsWith("ibrastream_meta_"))) {
        count++;
      }
    }
    setCachedLyricsCount(count);
  }, []);

  const formatRemainingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleClearCache = () => {
    let clearedCount = 0;
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("ibrastream_lyrics_")) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(k => {
      localStorage.removeItem(k);
      clearedCount++;
    });

    setCachedLyricsCount(0);
    showToast(`Se han borrado ${clearedCount} elementos en caché`, "success");
  };

  const toggleAccordion = (id: string) => {
    setOpenAccordion(prev => prev === id ? null : id);
  };
  const copy = (es: string, en: string, eu: string) => localized(language, es, en, eu);
  const syncLabel = {
    saved: copy("Sincronizada", "Synced", "Sinkronizatuta"),
    pending: copy("Guardada en este navegador", "Saved in this browser", "Nabigatzaile honetan gordeta"),
    syncing: copy("Sincronizando…", "Syncing…", "Sinkronizatzen…"),
    offline: copy("Sin conexión", "Offline", "Konexiorik gabe"),
    error: copy("Error", "Error", "Errorea"),
  }[syncState];

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4 sm:p-6 animate-fadeIn pb-28">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-brand-accent animate-pulse" />
            {copy("Ajustes", "Settings", "Ezarpenak")}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span>IbraMusic {__APP_VERSION__}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${navigator.onLine ? "bg-emerald-400" : "bg-amber-400"}`} />
              {navigator.onLine ? copy("En línea", "Online", "Linean") : copy("Sin conexión", "Offline", "Konexiorik gabe")}
            </span>
            {userId && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${syncState === "saved" ? "bg-emerald-400" : (syncState === "pending" || syncState === "syncing" || syncState === "offline") ? "bg-amber-400 animate-pulse" : "bg-red-400"}`} />
                  {copy("Sincronización", "Sync", "Sinkronizazioa")}: {syncLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {canInstall && onInstall && (
          <button
            onClick={onInstall}
            className="self-start sm:self-auto px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg"
          >
            <Smartphone className="w-4 h-4 text-brand-accent" />
            {copy("Instalar App", "Install app", "Instalatu aplikazioa")}
          </button>
        )}
      </div>

      {installHelp && onToggleInstallHelp && (
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-gray-300 flex items-center justify-between gap-3">
          <p>Para instalar en este dispositivo: abre el menú del navegador y selecciona <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.</p>
          <button onClick={onToggleInstallHelp} className="text-gray-400 hover:text-white text-xs underline shrink-0">Entendido</button>
        </div>
      )}

      {/* Main Grid of Settings Cards */}
      <div className="desktop-settings grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 1. Visual Customization Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Eye className="w-5 h-5 text-brand-accent" />
            {copy("Apariencia", "Appearance", "Itxura")}
          </h2>

          {/* Theme Selector */}
          <div className="flex flex-col gap-2 border-b border-white/5 pb-4">
            <span className="text-sm font-semibold text-white">{copy("Tema de la Interfaz", "Interface theme", "Interfazearen gaia")}</span>
            <div className="grid grid-cols-3 gap-2">
              {(["dark", "bright", "noir"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    if (t === "noir") setAmbientGlowEnabled(false);
                    if (setThemeSettings) {
                      setThemeSettings((prev: any) => ({
                        ...prev,
                        theme: t,
                        bgColor: t === "noir" ? "#000000" : prev.bgColor
                      }));
                    }
                  }}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold capitalize transition-all ${
                    currentTheme === t
                      ? "bg-white text-black border-white shadow-lg"
                      : "bg-white/5 text-gray-400 border-white/5 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {t === "dark" ? copy("Oscuro", "Dark", "Iluna") : t === "bright"
                    ? copy("Claro", "Light", "Argia") : copy("Noir Puro", "Pure Noir", "Noir hutsa")}
                </button>
              ))}
            </div>
          </div>

          {onToggleLiquidGlass && <div className="hidden items-center justify-between gap-4 border-b border-white/5 pb-4 lg:flex">
            <div><p className="text-sm font-semibold text-white">Liquid Glass</p>
              <p className="mt-1 text-[11px] text-gray-400">{copy("Efecto de cristal en la tarjeta de bienvenida de Inicio.", "Glass effect on the Home welcome card.", "Kristal-efektua Hasierako ongietorri-txartelean.")}</p></div>
            <button type="button" role="switch" aria-label="Liquid Glass" aria-checked={liquidGlassEnabled} onClick={onToggleLiquidGlass}
              className={"h-6 w-11 shrink-0 rounded-full p-1 transition-colors " + (liquidGlassEnabled ? "bg-brand-accent" : "bg-white/10")}>
              <span className={"block size-4 rounded-full transition-transform " + (liquidGlassEnabled ? "translate-x-5 bg-brand-darkBg" : "bg-gray-400")} />
            </button>
          </div>}

          {/* Ambient Glow */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex flex-col gap-0.5 max-w-[70%]">
              <span className="text-sm font-semibold text-white">{copy("Aura Ambiental Dinámica", "Dynamic ambient theme", "Giro-gai dinamikoa")}</span>
              <span className="text-[11px] text-gray-400">
                {copy("La portada de la canción elige el fondo y los colores de los controles.", "The track artwork sets the background and control colors.", "Abestiaren azalak hondoa eta kontrolen koloreak zehazten ditu.")}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-label={copy("Aura Ambiental Dinámica", "Dynamic ambient theme", "Giro-gai dinamikoa")}
              aria-checked={ambientGlowEnabled}
              onClick={() => setAmbientGlowEnabled(!ambientGlowEnabled)}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                ambientGlowEnabled ? "bg-white" : "bg-white/10"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                  ambientGlowEnabled ? "bg-black translate-x-5" : "bg-gray-400 translate-x-0"
                }`}
              />
            </button>
          </div>
          {ambientGlowEnabled && (
            <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-white">
              {copy("Modo ambiental", "Ambient Theme Mode", "Giro-gaiaren modua")}
              <select
                className="rounded-full border border-white/10 bg-brand-cardBg px-3 py-2 text-xs text-white focus-visible:outline-2 focus-visible:outline-brand-accent"
                value={ambientMode}
                onChange={event => onAmbientModeChange(event.currentTarget.value as AmbientMode)}
              >
                <option value="classic">Classic</option>
                <option value="cover">Cover Aura</option>
                <option value="secondary">Secondary Palette</option>
              </select>
            </label>
          )}

        </div>

        {/* 2. Playback & Queue Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Waves className="w-5 h-5 text-brand-accent" />
            {copy("Reproducción y cola", "Playback and queue", "Erreprodukzioa eta ilara")}
          </h2>

          {/* Autoplay Toggle */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex flex-col gap-0.5 max-w-[70%]">
              <span className="text-sm font-semibold text-white">{copy("Reproducción Continua (Autoplay)", "Autoplay", "Erreprodukzio jarraitua")}</span>
              <span className="text-[11px] text-gray-400">
                {copy("Continúa con canciones relacionadas cuando termina la cola.", "Keeps playing related tracks when the queue ends.", "Ilararen amaieran antzeko abestiak erreproduzitzen ditu.")}
              </span>
            </div>
            <button
              onClick={() => setAutoplay(!autoplay)}
              role="switch" aria-checked={autoplay} aria-label={copy("Reproducción continua", "Autoplay", "Erreprodukzio jarraitua")}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                autoplay ? "bg-white" : "bg-white/10"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                  autoplay ? "bg-black translate-x-5" : "bg-gray-400 translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Smart Shuffle */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex flex-col gap-0.5 max-w-[70%]">
              <span className="text-sm font-semibold text-white">{copy("Reparto Inteligente de Artistas", "Balanced artist shuffle", "Artisten ausazko banaketa orekatua")}</span>
              <span className="text-[11px] text-gray-400">
                {copy("Alterna artistas cuando hay canciones de otros disponibles.", "Alternates artists when tracks by other artists are available.", "Artistak txandakatzen ditu beste artisten abestiak daudenean.")}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Reparto inteligente de artistas"
              aria-checked={smartShuffle}
              onClick={() => setSmartShuffle(!smartShuffle)}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                smartShuffle ? "bg-white" : "bg-white/10"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                  smartShuffle ? "bg-black translate-x-5" : "bg-gray-400 translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Seamless Transitions (Crossfade) */}
          <div className="flex flex-col gap-3 border-b border-white/5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5 max-w-[70%]">
                <span className="text-sm font-semibold text-white">{copy("Transición Fluida (Crossfade)", "Crossfade", "Trantsizio leuna")}</span>
                <span className="text-[11px] text-gray-400">
                {copy("Desvanece el final de cada pista mientras empieza la siguiente.", "Fades out the current track as the next begins.", "Uneko pista pixkanaka itzaltzen du hurrengoa hasten denean.")}
                </span>
              </div>
              <button
                onClick={() => setSeamlessTransitions(!seamlessTransitions)}
                role="switch" aria-checked={seamlessTransitions} aria-label={copy("Transición fluida", "Crossfade", "Trantsizio leuna")}
                className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                  seamlessTransitions ? "bg-white" : "bg-white/10"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                    seamlessTransitions ? "bg-black translate-x-5" : "bg-gray-400 translate-x-0"
                  }`}
                />
              </button>
            </div>

            {seamlessTransitions && (
              <div className="flex flex-col gap-2 pt-2 animate-fadeIn">
                <div className="flex justify-between text-xs font-semibold text-gray-300">
                  <span className="text-gray-400">{copy("Duración del cruce:", "Crossfade duration", "Trantsizioaren iraupena")}</span>
                  <span className="text-white font-bold">{seamlessDuration} s</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={seamlessDuration}
                  aria-label={copy("Duración del cruce", "Crossfade duration", "Trantsizioaren iraupena")}
                  onChange={(e) => setSeamlessDuration(parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent"
                />
                <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                  <span>{copy("1 s (rápido)", "1 s (short)", "1 s (laburra)")}</span>
                  <span>{copy("4 s (recomendado)", "4 s (recommended)", "4 s (gomendatua)")}</span>
                  <span>{copy("12 s (largo)", "12 s (long)", "12 s (luzea)")}</span>
                </div>
              </div>
            )}
          </div>

          {/* Private Session */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 max-w-[70%]">
              <span className="text-sm font-semibold text-white">{copy("Sesión Privada", "Private session", "Saio pribatua")}</span>
              <span className="text-[11px] text-gray-400">
                {copy("Las reproducciones de esta sesión quedan fuera del historial y de las recomendaciones.", "Plays in this session stay out of your history and recommendations.", "Saio honetako erreprodukzioak historiatik eta gomendioetatik kanpo geratzen dira.")}
              </span>
            </div>
            <button
              onClick={() => setPrivateSession(!privateSession)}
              role="switch" aria-checked={privateSession} aria-label={copy("Sesión privada", "Private session", "Saio pribatua")}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                privateSession ? "bg-white" : "bg-white/10"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                  privateSession ? "bg-black translate-x-5" : "bg-gray-400 translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <section className="hidden flex-col gap-4 rounded-3xl border border-white/5 bg-white/5 p-6 lg:flex">
          <h2 className="text-lg font-bold text-white">{localized(language, "Ecualizador", "Equalizer", "Ekualizadorea")}</h2>
          <p className="text-xs text-gray-400">
            {localized(language, "Se aplica al audio local. YouTube se reproduce con su propio audio.", "Applies to local audio. YouTube uses its own audio output.", "Audio lokalari aplikatzen zaio. YouTubek bere audio-irteera erabiltzen du.")}
          </p>
          <div className="flex flex-wrap gap-2">
            {([
              ["flat", "Plano", "Flat", "Laua"],
              ["bass", "Graves", "Bass", "Baxuak"],
              ["voice", "Voces", "Vocals", "Ahotsak"],
              ["electronic", "Electrónica", "Electronic", "Elektronikoa"],
            ] as const).map(([key, es, en, eu]) => {
              const active = equalizer.every((gain, index) => gain === equalizerPresets[key][index]);
              return <button type="button" key={key} aria-pressed={active} onClick={() => setEqualizer(equalizerPresets[key])}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-brand-accent text-brand-accent" : "border-white/10 bg-white/5 text-gray-300"}`}>
                {localized(language, es, en, eu)}
              </button>;
            })}
          </div>
          {equalizerFrequencies.map((frequency, index) => (
            <label key={frequency} className="grid grid-cols-[4rem_1fr_3rem] items-center gap-3 text-xs">
              <span>{frequency.toLocaleString(language)} Hz</span>
              <input type="range" min={-12} max={12} value={equalizer[index]} className="min-w-0 accent-brand-accent"
                onChange={event => setEqualizer(equalizer.map((gain, band) => band === index ? Number(event.target.value) : gain))} />
              <span className="text-right tabular-nums">{equalizer[index]} dB</span>
            </label>
          ))}
        </section>

        {/* 4. Lyrics Provider Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Mic className="w-5 h-5 text-brand-accent" />
            {copy("Letras y karaoke", "Lyrics and karaoke", "Letrak eta karaokea")}
          </h2>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-white">{copy("Motor de Letras Principal", "Preferred lyrics provider", "Letren hornitzaile nagusia")}</span>
            <p className="text-[11px] text-gray-400">
              {copy("Elige el primer proveedor. Si falta una letra, se consultan las demás fuentes.", "Choose which provider to check first. Other sources are tried when lyrics are missing.", "Aukeratu lehen hornitzailea. Letra falta bada, beste iturriak kontsultatuko dira.")}
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs mt-1">
              <button
                onClick={() => {
                  setLyricsProvider("spicylyrics");
                  showToast("Motor de letras: Spicy Lyrics (Karaoke)", "success");
                }}
                className={`py-3 px-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                  lyricsProvider === "spicylyrics"
                    ? "bg-white text-black border-white shadow-lg"
                    : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="font-extrabold text-sm">Spicy</span>
                <span className="text-[10px] opacity-70">{copy("Palabra por palabra", "Word by word", "Hitzez hitz")}</span>
              </button>

              <button
                onClick={() => {
                  setLyricsProvider("lrcred");
                  showToast("Motor de letras: LRC.RED", "success");
                }}
                className={`py-3 px-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                  lyricsProvider === "lrcred"
                    ? "bg-white text-black border-white shadow-lg"
                    : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="font-extrabold text-sm">LRC.RED</span>
                <span className="text-[10px] opacity-70">{copy("Sincronizado", "Synced", "Sinkronizatua")}</span>
              </button>

              <button
                onClick={() => {
                  setLyricsProvider("lrclib");
                  showToast("Motor de letras: LRCLIB", "success");
                }}
                className={`py-3 px-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                  lyricsProvider === "lrclib"
                    ? "bg-white text-black border-white shadow-lg"
                    : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="font-extrabold text-sm">LRCLIB</span>
                <span className="text-[10px] opacity-70">{copy("Comunitario", "Community", "Komunitatea")}</span>
              </button>
            </div>

            {/* Word-by-Word Karaoke Toggle */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-1">
              <div className="flex flex-col gap-0.5 max-w-[70%]">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{copy("Karaoke palabra por palabra", "Word-by-word karaoke", "Hitzez hitzeko karaokea")}</span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-brand-accent bg-brand-accent/20 border border-brand-accent/30 px-2 py-0.5 rounded-full">
                    Karaoke
                  </span>
                </div>
                <span className="text-[11px] text-gray-400">
                  {copy("Resalta la letra a medida que canta el artista.", "Highlights the lyrics as the artist sings.", "Artistak abestu ahala hitzak nabarmentzen ditu.")}
                </span>
              </div>
              <button
                onClick={() => {
                  const next = !lyricsWordByWord;
                  setLyricsWordByWord(next);
                  if (next && lyricsProvider !== "spicylyrics" && lyricsProvider !== "lrcred") {
                    setLyricsProvider("spicylyrics");
                  }
                  showToast(next ? "Modo Karaoke activado" : "Sincronización por líneas activada", "success");
                }}
                className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                  lyricsWordByWord ? "bg-white" : "bg-white/10"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                    lyricsWordByWord ? "bg-black translate-x-5" : "bg-gray-400 translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 5. Account & Cloud Sync Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Globe className="w-5 h-5 text-brand-accent" />
            {copy("Cuenta y preferencias", "Account and preferences", "Kontua eta hobespenak")}
          </h2>

          {/* Navigation Language */}
          {onLanguageChange && (
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex flex-col gap-0.5 max-w-[65%]">
                <span className="text-sm font-semibold text-white">{copy("Idioma de la interfaz", "Interface language", "Interfazearen hizkuntza")}</span>
                <span className="text-[11px] text-gray-400">
                  {copy("Selecciona el idioma de IbraMusic.", "Choose the language of IbraMusic.", "Aukeratu IbraMusic-en hizkuntza.")}
                </span>
              </div>
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value === "en" || e.target.value === "eu" ? e.target.value : "es")}
                className="bg-white/10 border border-white/10 text-white text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-brand-accent cursor-pointer"
              >
                <option value="es" className="bg-[#18181b] text-white">Español</option>
                <option value="en" className="bg-[#18181b] text-white">English</option>
                <option value="eu" className="bg-[#18181b] text-white">Euskara</option>
              </select>
            </div>
          )}

          {/* Public Ranking */}
          {userId && onChangeRanking && (
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex flex-col gap-0.5 max-w-[65%]">
                <span className="text-sm font-semibold text-white">{copy("Clasificación Pública", "Public ranking", "Sailkapen publikoa")}</span>
                <span className="text-[11px] text-gray-400">
                  Elige cómo aparecer en el ranking comunitario de oyentes.
                </span>
              </div>
              <select
                disabled={rankingBusy}
                value={rankingPreference}
                onChange={(e) => onChangeRanking(e.target.value as "public" | "anonymous" | "off")}
                className="bg-white/10 border border-white/10 text-white text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-brand-accent cursor-pointer disabled:opacity-50"
              >
                <option value="off" className="bg-[#18181b] text-white">{copy("No participar", "Opt out", "Ez parte hartu")}</option>
                <option value="public" className="bg-[#18181b] text-white">{copy("Con mi nombre", "Show my name", "Erakutsi nire izena")}</option>
                <option value="anonymous" className="bg-[#18181b] text-white">{copy("Anónima", "Anonymous", "Anonimoa")}</option>
              </select>
            </div>
          )}

          {/* Cloud Sync Status */}
          {userId && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-white">{copy("Sincronización en la nube", "Cloud sync", "Hodeiko sinkronizazioa")}</span>
                <span className="text-[11px] text-gray-400">
                  {syncState === "error" && syncError ? syncError : copy("Las playlists, los favoritos y las estadísticas se sincronizan automáticamente.", "Playlists, favorites and stats sync automatically.", "Erreprodukzio-zerrendak, gogokoak eta estatistikak automatikoki sinkronizatzen dira.")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  syncState === "saved"
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : (syncState === "pending" || syncState === "syncing" || syncState === "offline")
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                      : "bg-red-500/15 border-red-500/30 text-red-400"
                }`}>
                  {syncLabel}
                </span>
                {onRetrySync && (
                  <button
                    type="button"
                    onClick={onRetrySync}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:text-white"
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {syncState === "error" ? copy("Reintentar", "Retry", "Saiatu berriro") : copy("Sincronizar ahora", "Sync now", "Sinkronizatu orain")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Delete Account */}
          {userId && onDeleteAccount && (
            <div className="flex items-center justify-between pt-1">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-red-400">{copy("Eliminar Cuenta", "Delete account", "Ezabatu kontua")}</span>
                <span className="text-[11px] text-gray-500">
                  Borra todos tus datos y playlists sincronizados en la nube.
                </span>
              </div>
              <button
                onClick={onDeleteAccount}
                className="px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Eliminar
              </button>
            </div>
          )}
        </div>

        {/* 6. Storage & Library Data Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <HardDrive className="w-5 h-5 text-brand-accent" />
            {copy("Almacenamiento y biblioteca", "Storage and library", "Biltegia eta liburutegia")}
          </h2>

          <div className="flex flex-col gap-3.5 text-xs text-gray-400">
            <details className="rounded-2xl border border-white/5 bg-white/5 p-3.5">
              <summary className="cursor-pointer font-bold text-white">Playlists ocultas ({hiddenPlaylists.length})</summary>
              {hiddenPlaylists.length ? (
                <ul className="mt-3 space-y-2">
                  {hiddenPlaylists.map(playlist => (
                    <li key={playlist.id} className="flex flex-wrap items-center gap-2">
                      <span className="mr-auto text-sm text-white">{playlist.name}</span>
                      <button type="button" aria-label={"Abrir " + playlist.name} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold hover:text-white" onClick={() => onOpenHiddenPlaylist?.(playlist)}>Abrir</button>
                      <button type="button" aria-label={"Mostrar " + playlist.name + " en Biblioteca"} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold hover:text-white" onClick={() => onShowPlaylist?.(playlist)}>Mostrar en Biblioteca</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2">No tienes playlists ocultas.</p>}
            </details>

            {/* Cache cleaner */}
            <div className="flex justify-between items-center bg-white/5 p-3.5 rounded-2xl border border-white/5">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-white">Caché de Letras y Portadas</span>
                <span className="text-[10px] text-gray-500">Archivos temporales en el navegador ({cachedLyricsCount} elementos).</span>
              </div>
              <button
                onClick={handleClearCache}
                disabled={cachedLyricsCount === 0}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpiar
              </button>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {onExportLibrary && (
                <button
                  onClick={onExportLibrary}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold flex items-center justify-center gap-2 transition-all text-xs"
                >
                  <Download className="w-4 h-4 text-brand-accent" />
                  Exportar Biblioteca (JSON)
                </button>
              )}

              {onClearHistory && (
                <button
                  onClick={onClearHistory}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-gray-300 hover:text-white font-bold flex items-center justify-center gap-2 transition-all text-xs"
                >
                  <Trash2 className="w-4 h-4 text-gray-400" />
                  Borrar Historial
                </button>
              )}
            </div>

            {hasCustomRecommendations && onResetRecommendations && (
              <button
                onClick={onResetRecommendations}
                className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-all"
              >
                Restablecer preferencias de recomendaciones
              </button>
            )}
          </div>
        </div>

        {/* 7. Content Filters Card */}
        {onToggleFilterExplicit && (
          <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
              <ShieldOff className="w-5 h-5 text-brand-accent" />
              Filtro de Contenido
            </h2>

            <div className="flex justify-between items-center bg-white/5 p-3.5 rounded-2xl border border-white/5">
              <div className="flex flex-col gap-0.5 max-w-[75%]">
                <span className="font-bold text-white">Ocultar contenido explícito</span>
                <span className="text-[11px] text-gray-400">
                  Las pistas marcadas con la insignia [E] no se mostrarán en búsquedas ni listas.
                </span>
              </div>
              <button
                onClick={onToggleFilterExplicit}
                className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                  filterExplicit ? "bg-brand-accent" : "bg-white/10"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                    filterExplicit ? "bg-black translate-x-5" : "bg-gray-400 translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* 8. Sleep Timer Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Clock className="w-5 h-5 text-brand-accent" />
            {copy("Temporizador de apagado", "Sleep timer", "Itzaltzeko tenporizadorea")}
          </h2>

          {sleepTimerRemaining !== null ? (
            <div className="flex flex-col items-center justify-center py-4 bg-white/5 rounded-2xl border border-white/5 gap-3">
              <span className="text-xs text-gray-400 font-medium">Temporizador activo • Tiempo restante</span>
              <span className="text-4xl font-extrabold text-white tracking-widest tabular-nums animate-pulse">
                {formatRemainingTime(sleepTimerRemaining)}
              </span>
              <button
                onClick={cancelSleepTimer}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-bold transition-all mt-1"
              >
                Cancelar Temporizador
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <span className="text-xs text-gray-400">
                Pausa la música automáticamente trascurrido el tiempo. El volumen se atenúa suavemente en los últimos 30 segundos.
              </span>
              
              {/* Presets */}
              <div className="grid grid-cols-4 gap-2 text-xs font-bold">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => startSleepTimer(mins)}
                    className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/5 transition-all"
                  >
                    {mins} min
                  </button>
                ))}
              </div>

              {/* Custom Selector */}
              <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                <div className="flex justify-between text-xs font-semibold text-gray-300">
                  <span className="text-gray-400">Duración personalizada:</span>
                  <span className="text-white font-bold">{customTimerMinutes} minutos</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={180}
                  step={5}
                  value={customTimerMinutes}
                  onChange={(e) => setCustomTimerMinutes(parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent"
                />
                <button
                  onClick={() => startSleepTimer(customTimerMinutes)}
                  className="w-full py-2.5 mt-1 rounded-xl bg-white text-black text-xs font-bold hover:bg-gray-200 transition-all shadow-md"
                >
                  Activar Temporizador
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Accordions for Advanced Info & Shortcuts */}
      <div className="flex flex-col gap-3 mt-2">
        
        {/* Keyboard Shortcuts Accordion */}
        <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden transition-all">
          <button
            onClick={() => toggleAccordion("shortcuts")}
            className="w-full p-4 flex items-center justify-between text-left text-sm font-bold text-white hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Keyboard className="w-4 h-4 text-brand-accent" />
              Atajos de Teclado
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openAccordion === "shortcuts" ? "rotate-180" : ""}`} />
          </button>
          {openAccordion === "shortcuts" && (
            <div className="p-4 pt-0 border-t border-white/5 text-xs text-gray-300 grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 animate-fadeIn">
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                <span className="text-gray-400">Reproducir / Pausar</span>
                <kbd className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-white">Espacio / F7</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                <span className="text-gray-400">Retroceder / Avanzar 5s</span>
                <kbd className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-white">← / →</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                <span className="text-gray-400">Subir / Bajar volumen</span>
                <kbd className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-white">↑ / ↓</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                <span className="text-gray-400">Silenciar audio</span>
                <kbd className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-white">M</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                <span className="text-gray-400">Pista anterior / siguiente</span>
                <kbd className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-white">F6 / F8</kbd>
              </div>
            </div>
          )}
        </div>

        {/* Diagnostics Accordion */}
        <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden transition-all">
          <button
            onClick={() => toggleAccordion("diagnostics")}
            className="w-full p-4 flex items-center justify-between text-left text-sm font-bold text-white hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Activity className="w-4 h-4 text-brand-accent" />
              Diagnóstico del Dispositivo
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openAccordion === "diagnostics" ? "rotate-180" : ""}`} />
          </button>
          {openAccordion === "diagnostics" && (
            <div className="p-4 pt-0 border-t border-white/5 text-xs text-gray-300 flex flex-col gap-2 mt-3 animate-fadeIn">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-gray-400">Apertura sin conexión (Service Worker):</span>
                <span className="font-semibold text-white">{offlineReady ? "Preparada y activa" : "Pendiente en este navegador"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-gray-400">Latencia media de primer resultado:</span>
                <span className="font-semibold text-white">{metrics?.search ? `${metrics.search.mean} ms` : "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-gray-400">Latencia media de inicio de audio:</span>
                <span className="font-semibold text-white">{metrics?.play ? `${metrics.play.mean} ms` : "—"}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Incidentes de reproducción registrados:</span>
                <span className="font-semibold text-white">{metrics?.play_error?.count ?? 0}</span>
              </div>
            </div>
          )}
        </div>

        {/* Privacy & Storage Accordion */}
        <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden transition-all">
          <button
            onClick={() => toggleAccordion("privacy")}
            className="w-full p-4 flex items-center justify-between text-left text-sm font-bold text-white hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Info className="w-4 h-4 text-brand-accent" />
              Privacidad y Almacenamiento
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openAccordion === "privacy" ? "rotate-180" : ""}`} />
          </button>
          {openAccordion === "privacy" && (
            <div className="p-4 pt-0 border-t border-white/5 text-xs text-gray-300 leading-relaxed mt-3 animate-fadeIn">
              <p>
                Los archivos de audio guardados localmente y las preferencias de ecualización se almacenan exclusivamente en el navegador de este dispositivo.
              </p>
              <p className="mt-2">
                Al iniciar sesión, tus playlists, favoritos, artistas seguidos y estadísticas acumuladas se respaldan de forma cifrada en Supabase. Las consultas a catálogos y letras se procesan de forma anónima sin recopilar datos personales.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Safety Notice footer */}
      <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex gap-3 text-xs text-yellow-500/80 leading-relaxed shrink-0">
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
        <p>
          <strong>Aviso:</strong> Las preferencias personalizadas (Crossfade, Ecualizador y modificadores visuales) se guardan localmente en tu dispositivo. Cerrar sesión en otros clientes no restablecerá tu configuración en este navegador.
        </p>
      </div>

    </div>
  );
};

export default SettingsPanel;
