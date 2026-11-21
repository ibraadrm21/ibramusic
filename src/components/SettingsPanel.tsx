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

export interface SettingsPanelProps {
  themeSettings?: { theme: "dark" | "bright" | "noir"; [key: string]: any };
  setThemeSettings?: React.Dispatch<React.SetStateAction<any>>;
  filterExplicit?: boolean;
  onToggleFilterExplicit?: () => void;
  // Account & Sync
  userId?: string | null;
  language?: "es" | "en";
  onLanguageChange?: (lang: "es" | "en") => void;
  syncState?: "saved" | "pending" | "error";
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
    setLyricsWordByWord
  } = useAudio();

  const currentTheme = themeSettings?.theme || (document.documentElement.getAttribute("data-theme") as "dark" | "bright" | "noir") || "dark";
  const isNoir = currentTheme === "noir";

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

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4 sm:p-6 animate-fadeIn pb-28">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-brand-accent animate-pulse" />
            Ajustes
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span>IbraMusic {__APP_VERSION__}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${navigator.onLine ? "bg-emerald-400" : "bg-amber-400"}`} />
              {navigator.onLine ? "En línea" : "Modo sin conexión"}
            </span>
            {userId && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${syncState === "saved" ? "bg-emerald-400" : syncState === "pending" ? "bg-amber-400 animate-pulse" : "bg-red-400"}`} />
                  Sincronización: {{ saved: "Guardada", pending: "Pendiente", error: "Error" }[syncState]}
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
            Instalar App
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 1. Visual Customization Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Eye className="w-5 h-5 text-brand-accent" />
            Personalización Visual
          </h2>

          {/* Theme Selector */}
          <div className="flex flex-col gap-2 border-b border-white/5 pb-4">
            <span className="text-sm font-semibold text-white">Tema de la Interfaz</span>
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
                  {t === "dark" ? "Oscuro" : t === "bright" ? "Claro" : "Noir Puro"}
                </button>
              ))}
            </div>
          </div>

          {/* Ambient Glow */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex flex-col gap-0.5 max-w-[70%]">
              <span className="text-sm font-semibold text-white">Aura Ambiental Dinámica</span>
              <span className="text-[11px] text-gray-400">
                La portada de la canción elige el fondo y los colores de los controles.
              </span>
              {isNoir && (
                <span className="text-[10px] text-amber-400 font-semibold mt-1">
                  Desactivado en modo Noir (Negro absoluto)
                </span>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Aura Ambiental Dinámica"
              aria-checked={ambientGlowEnabled && !isNoir}
              disabled={isNoir}
              onClick={() => {
                if (isNoir) {
                  showToast("El aura está desactivada en modo Noir", "info");
                  return;
                }
                setAmbientGlowEnabled(!ambientGlowEnabled);
              }}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
                isNoir ? "bg-white/5 cursor-not-allowed opacity-40" : ambientGlowEnabled ? "bg-white" : "bg-white/10"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                  ambientGlowEnabled && !isNoir ? "bg-black translate-x-5" : "bg-gray-400 translate-x-0"
                }`}
              />
            </button>
          </div>

        </div>

        {/* 2. Playback & Queue Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Waves className="w-5 h-5 text-brand-accent" />
            Reproducción y Cola
          </h2>

          {/* Autoplay Toggle */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex flex-col gap-0.5 max-w-[70%]">
              <span className="text-sm font-semibold text-white">Reproducción Continua (Autoplay)</span>
              <span className="text-[11px] text-gray-400">
                Continúa automáticamente con temas relacionados al terminar la cola de reproducción.
              </span>
            </div>
            <button
              onClick={() => setAutoplay(!autoplay)}
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
              <span className="text-sm font-semibold text-white">Reparto Inteligente de Artistas</span>
              <span className="text-[11px] text-gray-400">
                Al reproducir en aleatorio, alterna artistas siempre que haya temas de otros disponibles.
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
                <span className="text-sm font-semibold text-white">Transición Fluida (Crossfade)</span>
                <span className="text-[11px] text-gray-400">
                  Desvanece el final de cada pista mientras inicia suavemente la siguiente.
                </span>
              </div>
              <button
                onClick={() => setSeamlessTransitions(!seamlessTransitions)}
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
                  <span className="text-gray-400">Duración del cruce:</span>
                  <span className="text-white font-bold">{seamlessDuration} segundos</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={seamlessDuration}
                  onChange={(e) => setSeamlessDuration(parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent"
                />
                <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                  <span>1s (Rápido)</span>
                  <span>4s (Recomendado)</span>
                  <span>12s (Largo)</span>
                </div>
              </div>
            )}
          </div>

          {/* Private Session */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 max-w-[70%]">
              <span className="text-sm font-semibold text-white">Sesión Privada</span>
              <span className="text-[11px] text-gray-400">
                No guarda reproducciones en el historial ni afecta las recomendaciones durante esta pestaña.
              </span>
            </div>
            <button
              onClick={() => setPrivateSession(!privateSession)}
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

        {/* 4. Lyrics Provider Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Mic className="w-5 h-5 text-brand-accent" />
            Fuente de Letras y Karaoke
          </h2>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-white">Motor de Letras Principal</span>
            <p className="text-[11px] text-gray-400">
              Elige el proveedor prioritario. Si una canción no se encuentra, se consultarán las demás fuentes automáticamente.
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
                <span className="text-[10px] opacity-70">Word-by-word</span>
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
                <span className="text-[10px] opacity-70">Sincronizado</span>
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
                <span className="text-[10px] opacity-70">Comunitario</span>
              </button>
            </div>

            {/* Word-by-Word Karaoke Toggle */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-1">
              <div className="flex flex-col gap-0.5 max-w-[70%]">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">Modo Karaoke (Palabra por palabra)</span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-brand-accent bg-brand-accent/20 border border-brand-accent/30 px-2 py-0.5 rounded-full">
                    Karaoke
                  </span>
                </div>
                <span className="text-[11px] text-gray-400">
                  Resalta de forma fluida cada sílaba y palabra en tiempo real mientras el artista canta.
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
            Cuenta y Preferencias
          </h2>

          {/* Navigation Language */}
          {onLanguageChange && (
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex flex-col gap-0.5 max-w-[65%]">
                <span className="text-sm font-semibold text-white">Idioma de la Interfaz</span>
                <span className="text-[11px] text-gray-400">
                  Selecciona el idioma principal de navegación.
                </span>
              </div>
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value === "en" ? "en" : "es")}
                className="bg-white/10 border border-white/10 text-white text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-brand-accent cursor-pointer"
              >
                <option value="es" className="bg-[#18181b] text-white">Español</option>
                <option value="en" className="bg-[#18181b] text-white">English</option>
              </select>
            </div>
          )}

          {/* Public Ranking */}
          {userId && onChangeRanking && (
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex flex-col gap-0.5 max-w-[65%]">
                <span className="text-sm font-semibold text-white">Clasificación Pública</span>
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
                <option value="off" className="bg-[#18181b] text-white">No participar</option>
                <option value="public" className="bg-[#18181b] text-white">Con mi nombre</option>
                <option value="anonymous" className="bg-[#18181b] text-white">Anónima</option>
              </select>
            </div>
          )}

          {/* Cloud Sync Status */}
          {userId && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-white">Sincronización en la Nube</span>
                <span className="text-[11px] text-gray-400">
                  {syncState === "error" && syncError ? syncError : "Las playlists, los favoritos y las estadísticas se sincronizan automáticamente."}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  syncState === "saved"
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : syncState === "pending"
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                      : "bg-red-500/15 border-red-500/30 text-red-400"
                }`}>
                  {{ saved: "Guardada", pending: "Pendiente", error: "Error" }[syncState]}
                </span>
                {onRetrySync && (
                  <button
                    type="button"
                    onClick={onRetrySync}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:text-white"
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {syncState === "error" ? "Reintentar" : "Sincronizar ahora"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Delete Account */}
          {userId && onDeleteAccount && (
            <div className="flex items-center justify-between pt-1">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-red-400">Eliminar Cuenta</span>
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
            Almacenamiento y Biblioteca
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
            Temporizador de Apagado
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
