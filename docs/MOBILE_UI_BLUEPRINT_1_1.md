# Blueprint Técnico 1:1 — Arquitectura e Implementación Móvil "ibraStream"

Este documento contiene la especificación de ingeniería inversa completa, con resolución píxel a píxel, tokens de diseño y código fuente de producción en React + Tailwind CSS para clonar la aplicación móvil de música **ibraStream** (modo *Noir / Pure Black*) en cualquier otro proyecto.

Viewport de referencia: **390 × 844 px** (iPhone 12/13/14/15/16).

---

## 1. Sistema de Diseño y Tokens Globales (Design Tokens)

### 1.1 Paleta de Colores
* **Fondo Base de la Aplicación (Modo Noir):** `#000000` (Pure Black).
* **Barras Fijas Superior e Inferior:** `rgba(15, 15, 15, 0.96)` con `backdrop-filter: blur(20px)`.
* **Superficie Elevada (Hero Card Home):** `linear-gradient(145deg, rgba(25, 25, 25, 0.92) 0%, rgba(10, 10, 10, 0.98) 100%)`.
* **Contenedores y Tarjetas de Ajustes:** `rgba(255, 255, 255, 0.05)` (`bg-white/5` / `#0d0d0d`).
* **Chips, Botones de Mood e Inputs:** `rgba(255, 255, 255, 0.07)` (`bg-white/7`).
* **Superficie Activa / Botón Primario Blanco:** `#ffffff` con texto `#000000`.
* **Borde Sutil Global:** `rgba(255, 255, 255, 0.05)` (`border-white/5`).
* **Borde de Tarjetas e Inputs Activos:** `rgba(255, 255, 255, 0.10)` (`border-white/10`).
* **Texto Primario:** `#ffffff`.
* **Texto Secundario (Artistas, contadores):** `#9ca3af` (`text-gray-400`).
* **Texto Terciario / Placeholders / Inactivos:** `#6b7280` (`text-gray-500`).
* **Acento Favoritos:** `#f43f5e` (`text-rose-500`, con relleno `fill-rose-500`).
* **Acento Advertencias (Modo Noir):** `#eab308` (`text-yellow-500`).
* **Acento En Línea / Sincronización:** `#10b981` (`text-emerald-500`).

### 1.2 Jerarquía Tipográfica
* **Fuente:** `'Inter', system-ui, -apple-system, sans-serif` con `letter-spacing: -0.01em`.
* **Hero Title (H1):** `32px` (2rem), `font-weight: 800`, `line-height: 1.1`.
* **Section Titles (H2):** `24px` (1.5rem), `font-weight: 700`, `line-height: 1.2`.
* **Card Headers (H3):** `16px-18px`, `font-weight: 700`, `line-height: 1.3`.
* **Track / Album Titles:** `14px-15px`, `font-weight: 600`, `line-height: 1.25`.
* **Artist / Subtitles:** `12px-13px`, `font-weight: 400-500`, color `#9ca3af`.
* **Kickers / Tags ("BROWSE BY MOOD", "TRENDING NOW"):** `11px`, `font-weight: 700`, `letter-spacing: 0.1em`, `text-transform: uppercase`.
* **Bottom Nav Labels:** `9px`, `font-weight: 600`, `letter-spacing: 0.025em`.

---

## 2. Layout Espacial y Capas (Z-Index)

* **Top Bar (Fija Superior):** `top: 0`, altura `56px` + `env(safe-area-inset-top)`, `z-index: 30`.
* **Main Scroll Area:** `overflow-y: auto`, `padding-top: 68px`, `padding-bottom: 100px`, `px-4`.
* **Mini-Player Móvil:** `fixed`, `bottom: calc(64px + env(safe-area-inset-bottom))`, `left: 12px`, `right: 12px`, altura `60px`, `z-index: 40`.
* **Bottom Navigation:** `fixed`, `bottom: 0`, altura `64px` + `env(safe-area-inset-bottom)`, `z-index: 40`.
* **Player Expandido Full-Screen:** `fixed inset-0`, `z-index: 50`.
* **Modales y Overlays (Account, Queue, Context Menu, Import):** `fixed inset-0`, `z-index: 50` a `z-index: 100`.

---

## 3. Navegación Inferior (7 Pestañas)

1. **Home (`activeTab === 'home'`):** Hero Card, saludo dinámico ("Good Afternoon"), cuadrícula 2x2 de recomendaciones y lanzamientos.
2. **Search (`activeTab === 'search'`):** Input de búsqueda universal, cuadrícula 2 columnas de 8 estados de ánimo (*Browse by Mood*), y lista vertical de pistas en tendencia (*Trending Now*).
3. **Liked (`activeTab === 'favorites'`):** Cabecera de Favoritos con botón circular blanco de reproducción total (*Play All FAB*), barra de filtrado local y lista de pistas marcadas con corazón rojo.
4. **Library (`activeTab === 'playlists'`):** Botones de creación e importación rápida de Spotify, barra de filtrado y cuadrícula 2 columnas de playlists.
5. **Stats (`activeTab === 'stats'`):** Métricas de escucha acumuladas, minutos totales, podio de artistas/canciones y tabla mensual de clasificación.
6. **Settings (`activeTab === 'settings'`):** Selector de temas (*Dark*, *Bright*, *Noir*), conmutador de Aura luminosa (*Ambient Glow*) y selector de perfiles de audio/ecualizador.
7. **Dashboard (`activeTab === 'admin'`):** Panel de administración para el gestor de la aplicación (destacados de Home, portadas, purga de caché).

---

## 4. Componentes Clave de Reproducción

### 4.1 Mini-Player Móvil (`<MobileMiniPlayer />`)
Flota inmediatamente encima de la barra de navegación inferior (`bottom: calc(64px + var(--safe-bottom))`):

```tsx
export const MobileMiniPlayer: React.FC = () => {
  const { currentTrack, isPlaying, togglePlay, isLoading, nextTrack } = useAudio();
  const { currentTime, duration } = useAudioProgress();
  const [showFullPlayer, setShowFullPlayer] = useState(false);

  if (!currentTrack) return null;

  return (
    <>
      <div 
        className="md:hidden fixed left-3 right-3 z-40"
        style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div 
          onClick={() => setShowFullPlayer(true)}
          className="flex items-center gap-3 bg-[#0f0f0f]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2.5 shadow-2xl shadow-black/80 cursor-pointer select-none"
        >
          {/* Carátula con badge animado al sonar */}
          <div className="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden bg-neutral-900 border border-white/5">
            <img src={currentTrack.thumbnail} alt={currentTrack.title} className="w-full h-full object-cover" />
            {isPlaying && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
              </div>
            )}
          </div>

          {/* Información y barra de progreso fina */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{currentTrack.title}</p>
            <p className="text-xs text-gray-400 truncate mt-0.5 leading-tight">{currentTrack.artist}</p>
            <div className="h-0.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all"
                style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {/* Controles de reproducción */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={togglePlay}
              disabled={isLoading}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center active:scale-90 transition-all"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4.5 h-4.5 fill-current" />
              ) : (
                <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
              )}
            </button>
            <button onClick={nextTrack} className="p-2 text-gray-400 active:scale-90">
              <SkipForward className="w-4.5 h-4.5 fill-current" />
            </button>
          </div>
        </div>
      </div>

      {showFullPlayer && (
        <FullPlayerDrawer onClose={() => setShowFullPlayer(false)} />
      )}
    </>
  );
};
```

### 4.2 Reproductor Expandido a Pantalla Completa (`<FullPlayerDrawer />`)
Modal deslizable desde abajo hacia arriba (`slideUp 0.25s cubic-bezier(0.16,1,0.3,1)`):

```tsx
export const FullPlayerDrawer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, seek, isShuffle, toggleShuffle, isRepeat, toggleRepeat } = useAudio();
  const { currentTime, duration } = useAudioProgress();
  const [activeTab, setActiveTab] = useState<"overview" | "lyrics" | "queue">("overview");

  if (!currentTrack) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col justify-between p-6 select-none animate-[slideUp_0.25s_cubic-bezier(0.16,1,0.3,1)]">
      {/* Barra superior del Drawer */}
      <div className="flex items-center justify-between pb-4">
        <button onClick={onClose} className="p-2 rounded-full bg-white/5 active:scale-90 text-gray-300">
          <ChevronDown className="w-6 h-6" />
        </button>
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
          {(["overview", "lyrics", "queue"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded-xl text-xs font-bold capitalize transition-all ${
                activeTab === tab ? "bg-white text-black" : "text-gray-400"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button className="p-2 rounded-full bg-white/5 text-gray-300">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Vista de Carátula / Overview */}
      {activeTab === "overview" && (
        <div className="flex flex-col items-center justify-center flex-1 my-4">
          <div className="w-[300px] h-[300px] rounded-[28px] overflow-hidden bg-neutral-900 border border-white/10 shadow-2xl">
            <img src={currentTrack.thumbnail} alt={currentTrack.title} className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* Vista de Letras Sincronizadas (LRC) */}
      {activeTab === "lyrics" && (
        <div className="flex-1 overflow-y-auto my-4 flex flex-col gap-4 text-center px-4">
          <p className="text-xl font-bold text-white">Letras sincronizadas vía LRCLIB</p>
        </div>
      )}

      {/* Metadata y Controles de Pista */}
      <div className="flex flex-col gap-4 mt-auto">
        <div className="flex items-center justify-between">
          <div className="flex flex-col min-w-0 pr-4">
            <h2 className="text-xl font-black text-white truncate">{currentTrack.title}</h2>
            <p className="text-sm font-medium text-gray-400 truncate mt-0.5">{currentTrack.artist}</p>
          </div>
          <button className="p-2 text-rose-500">
            <Heart className="w-6 h-6 fill-current" />
          </button>
        </div>

        {/* Barra de Progreso Deslizable */}
        <div className="flex flex-col gap-1.5">
          <input
            type="range"
            min={0}
            max={duration || 1}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer"
          />
          <div className="flex justify-between text-[11px] font-medium text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Botones de Control Principal */}
        <div className="flex items-center justify-between px-2 pt-2">
          <button onClick={toggleShuffle} className={`p-2 ${isShuffle ? "text-white" : "text-gray-500"}`}>
            <Shuffle className="w-5 h-5" />
          </button>
          <button onClick={prevTrack} className="p-2 text-white active:scale-90">
            <SkipBack className="w-7 h-7 fill-current" />
          </button>
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center active:scale-95 shadow-xl"
          >
            {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
          </button>
          <button onClick={nextTrack} className="p-2 text-white active:scale-90">
            <SkipForward className="w-7 h-7 fill-current" />
          </button>
          <button onClick={toggleRepeat} className={`p-2 ${isRepeat ? "text-white" : "text-gray-500"}`}>
            <Repeat className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## 5. Overlays de la Barra Superior

### 5.1 Account / Profile Dropdown (`<MobileAccountOverlay />`)
```tsx
export const MobileAccountOverlay: React.FC<{ onClose: () => void; user: any; pfp: string; username: string }> = ({
  onClose,
  user,
  pfp,
  username
}) => (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
    <div className="w-full max-w-sm rounded-[28px] bg-[#121212] border border-white/10 p-6 flex flex-col gap-4 shadow-2xl relative">
      <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white">
        <X className="w-5 h-5" />
      </button>

      {/* Avatar e Identidad */}
      <div className="flex flex-col items-center gap-2 pb-4 border-b border-white/5">
        <div className="w-20 h-20 rounded-full border-2 border-red-500 overflow-hidden bg-white p-0.5">
          <img src={pfp} alt="Avatar" className="w-full h-full object-cover rounded-full" />
        </div>
        <h3 className="text-base font-bold text-white mt-1">{username}</h3>
        <span className="text-xs text-gray-500">{user?.email}</span>
        <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold mt-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Sincronizado en la nube
        </div>
      </div>

      {/* Opciones */}
      <div className="flex flex-col gap-2">
        <button className="w-full py-2.5 px-4 rounded-xl bg-white/5 text-left text-xs font-semibold text-white flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" /> Editar Perfil
        </button>
        <button className="w-full py-2.5 px-4 rounded-xl bg-white/5 text-left text-xs font-semibold text-white flex items-center gap-2">
          <Globe className="w-4 h-4 text-gray-400" /> Playlists Públicas
        </button>
        <button className="w-full py-2.5 px-4 rounded-xl bg-red-500/10 text-left text-xs font-semibold text-red-400 flex items-center gap-2 mt-2">
          <LogOut className="w-4 h-4" /> Cerrar Sesión
        </button>
      </div>
    </div>
  </div>
);
```

### 5.2 Listen Together Overlay (`<ListenTogetherOverlay />`)
```tsx
export const ListenTogetherOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col p-4 pt-12">
    <div className="bg-[#121212] border border-white/10 rounded-[28px] w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative">
      <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/5 text-gray-400">
        <X className="w-5 h-5" />
      </button>
      <div className="p-6 overflow-y-auto">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Radio className="w-5 h-5 text-emerald-400 animate-pulse" /> Listen Together
        </h2>
        <p className="text-xs text-gray-400 mt-1">Escucha en sincronía con tus amigos en tiempo real.</p>
      </div>
    </div>
  </div>
);
```

---

## 6. Menús Contextuales y Modales de Playlists

### 6.1 Menú Contextual de Pista (`<TrackContextMenu />`)
Se posiciona exactamente sobre las coordenadas del toque (`adjustedCoords`):
```tsx
export const TrackContextMenu: React.FC<TrackContextMenuProps> = ({ x, y, track, isFavorite, onClose, onToggleFavorite, onAddToQueue }) => (
  <>
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
    <div
      style={{ top: `${Math.min(y, window.innerHeight - 320)}px`, left: `${Math.min(x, window.innerWidth - 220)}px` }}
      className="fixed z-[70] w-56 rounded-2xl bg-[#141414]/95 border border-white/10 p-2 flex flex-col gap-1 shadow-2xl select-none"
    >
      <button onClick={onToggleFavorite} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white rounded-xl hover:bg-white/5">
        <Heart className={`w-4 h-4 ${isFavorite ? "text-rose-500 fill-rose-500" : "text-gray-400"}`} />
        <span>{isFavorite ? "Quitar de Favoritos" : "Añadir a Favoritos"}</span>
      </button>
      <button onClick={onAddToQueue} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white rounded-xl hover:bg-white/5">
        <ListPlus className="w-4 h-4 text-gray-400" />
        <span>Añadir a la Cola</span>
      </button>
      <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white rounded-xl hover:bg-white/5">
        <Download className="w-4 h-4 text-gray-400" />
        <span>Descargar Offline</span>
      </button>
      <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white rounded-xl hover:bg-white/5">
        <Share2 className="w-4 h-4 text-gray-400" />
        <span>Compartir Enlace</span>
      </button>
    </div>
  </>
);
```

### 6.2 Modal Crear Playlist (`<CreatePlaylistModal />`)
```tsx
export const CreatePlaylistModal: React.FC<{ onClose: () => void; onCreate: (name: string) => void }> = ({ onClose, onCreate }) => {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-white">Create Playlist</h3>
        <input
          type="text"
          placeholder="Nombre de la playlist..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none"
        />
        <div className="flex gap-3 mt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-white/10 text-xs font-semibold text-gray-400">
            Cancel
          </button>
          <button onClick={() => onCreate(name)} className="flex-1 py-2.5 rounded-full bg-white text-black text-xs font-bold shadow-md">
            Create
          </button>
        </div>
      </div>
    </div>
  );
};
```

### 6.3 Modal Importar Spotify (`<ImportSpotifyModal />`)
```tsx
export const ImportSpotifyModal: React.FC<{ onClose: () => void; onImport: (url: string) => void }> = ({ onClose, onImport }) => {
  const [url, setUrl] = useState("");
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-white">Import Playlist</h3>
        <p className="text-xs text-gray-400">Pega el enlace público de la playlist de Spotify para importarla.</p>
        <input
          type="text"
          placeholder="https://open.spotify.com/playlist/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none"
        />
        <div className="flex gap-3 mt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-white/10 text-xs font-semibold text-gray-400">
            Cancel
          </button>
          <button onClick={() => onImport(url)} className="flex-1 py-2.5 rounded-full bg-white text-black text-xs font-bold shadow-md">
            Import
          </button>
        </div>
      </div>
    </div>
  );
};
```
