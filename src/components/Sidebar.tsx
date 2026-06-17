import React from "react";
import { Home, Search, Heart, Music, ListMusic, Sparkles } from "lucide-react";

const Github: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  playlists: any[];
  followedArtists: any[];
  onSelectPlaylist: (playlist: any) => void;
  onSelectArtist: (artist: any) => void;
  userEmail?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  playlists,
  followedArtists,
  onSelectPlaylist,
  onSelectArtist,
  userEmail,
}) => {
  const menuItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "search", label: "Search", icon: Search },
    { id: "favorites", label: "Favorites", icon: Heart },
    { id: "playlists", label: "Playlists", icon: ListMusic },
    ...(userEmail === "ibradramee123@gmail.com" ? [{ id: "admin", label: "Dashboard", icon: Sparkles }] : []),
    { id: "github", label: "GitHub", icon: Github, url: "https://github.com/ibraadrm21" }
  ];

  // Load library order from localStorage
  const [libraryOrder, setLibraryOrder] = React.useState<{ id: string, type: 'playlist' | 'artist' }[]>(() => {
    const saved = localStorage.getItem("ibrastream_library_order");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  // Combine playlists and artists into a single array
  const combinedLibrary = React.useMemo(() => {
    const items = [
      ...playlists.map(p => ({ ...p, type: 'playlist' as const })),
      ...followedArtists.map(a => ({ ...a, type: 'artist' as const }))
    ];

    // Sort items according to libraryOrder
    if (libraryOrder.length > 0) {
      items.sort((a, b) => {
        const idxA = libraryOrder.findIndex(item => item.id === a.id && item.type === a.type);
        const idxB = libraryOrder.findIndex(item => item.id === b.id && item.type === b.type);
        
        // If both are in the order, sort by order
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        // If only one is in the order, put it first
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        // Otherwise keep original order
        return 0;
      });
    }
    return items;
  }, [playlists, followedArtists, libraryOrder]);

  // Drag and drop states
  const [draggedIdx, setDraggedIdx] = React.useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIdx(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    
    // Reorder combinedLibrary
    const updated = [...combinedLibrary];
    const item = updated[draggedIdx];
    updated.splice(draggedIdx, 1);
    updated.splice(index, 0, item);
    
    setDraggedIdx(index);

    // Save the new order as a list of { id, type }
    const newOrder = updated.map(item => ({ id: item.id, type: item.type }));
    setLibraryOrder(newOrder);
    localStorage.setItem("ibrastream_library_order", JSON.stringify(newOrder));
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-[calc(100vh-96px)] fixed left-0 top-0 glass-panel border-r border-gray-800 p-5 z-10 select-none justify-between">
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 bg-white/8 border border-white/10 rounded-xl flex items-center justify-center">
              <Music className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight text-white">
                ibrastream
              </span>
              <span className="block text-[9px] text-gray-500 font-medium tracking-widest uppercase">
                Music Player
              </span>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="flex flex-col gap-1.5 shrink-0">
            <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-wider mb-1 pl-3">
              Menu
            </span>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              if (item.url) {
                return (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-lg transition-all duration-200 font-medium text-xs w-full text-gray-500 hover:text-gray-200 hover:bg-white/4"
                  >
                    <div className="flex items-center gap-3.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                  </a>
                );
              }
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                  }}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg transition-all duration-200 font-medium text-xs w-full ${
                    isActive
                      ? "bg-white/8 text-white"
                      : "text-gray-500 hover:text-gray-200 hover:bg-white/4"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <Icon className={`w-4 h-4 ${isActive ? "text-white" : ""}`} />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Your Library List (Spotify Left Sidebar style) */}
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-1 select-none">
            <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-wider mb-1 pl-3">
              Your Library
            </span>
            <div className="flex flex-col gap-1.5 pl-1.5">
              {combinedLibrary.map((item, idx) => {
                const isPlaylist = item.type === 'playlist';
                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => isPlaylist ? onSelectPlaylist(item) : onSelectArtist(item)}
                    draggable={true}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3.5 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-all group ${
                      draggedIdx === idx ? 'opacity-40 bg-white/10 scale-95' : ''
                    }`}
                  >
                    {isPlaylist ? (
                      <div className="w-8.5 h-8.5 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.coverUrl || (item.tracks && item.tracks.length > 0 && item.tracks[0].thumbnail) ? (
                          <img src={item.coverUrl || item.tracks[0].thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <ListMusic className="w-4.5 h-4.5 text-brand-accent group-hover:scale-105 transition-transform" />
                        )}
                      </div>
                    ) : (
                      <img
                        src={item.thumbnail}
                        alt={item.name}
                        className="w-8.5 h-8.5 rounded-full object-cover shrink-0"
                      />
                    )}

                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate group-hover:text-brand-accent transition-colors">{item.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {isPlaylist ? `Playlist • ${item.tracks ? item.tracks.length : 0} Songs` : "Artist"}
                      </p>
                    </div>
                  </div>
                );
              })}

              {combinedLibrary.length === 0 && (
                <span className="text-[10px] text-gray-600 pl-3 italic">Empty Library</span>
              )}
            </div>
          </div>
        </div>

        {/* Branding Footer */}
        <div className="border-t border-white/5 pt-4 mt-auto shrink-0 flex items-center justify-center">
          <span className="text-[10px] text-gray-600 font-medium tracking-wider uppercase">ibrastream v1.0</span>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(64px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-[#0f0f0f]/96 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-2 z-40 select-none">
        {[
          { id: "home",      icon: Home,      label: "Home" },
          { id: "search",    icon: Search,    label: "Search" },
          { id: "favorites", icon: Heart,     label: "Liked" },
          { id: "playlists", icon: ListMusic, label: "Library" },
          ...(userEmail === "ibradramee123@gmail.com"
            ? [{ id: "admin", icon: Sparkles, label: "Dashboard" }]
            : [{ id: "github", icon: Github, label: "GitHub", url: "https://github.com/ibraadrm21" }])
        ].map(({ id, icon: Icon, label, url }) => {
          const isActive = activeTab === id;
          if (url) {
            return (
              <a
                key={id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all"
              >
                <div className="p-1.5 rounded-xl transition-all">
                  <Icon className="w-5 h-5 text-gray-500" />
                </div>
                <span className="text-[9px] font-semibold tracking-wide text-gray-600">
                  {label}
                </span>
              </a>
            );
          }
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all active:scale-90"
            >
              <div className={`p-1.5 rounded-xl transition-all ${isActive ? "bg-white/10" : ""}`}>
                <Icon className={`w-5 h-5 transition-all ${isActive ? "text-white" : "text-gray-500"}`} />
              </div>
              <span className={`text-[9px] font-semibold tracking-wide transition-all ${isActive ? "text-white" : "text-gray-600"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
export default Sidebar;
