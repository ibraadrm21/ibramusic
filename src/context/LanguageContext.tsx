import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Language = "es" | "en" | "eu";
const dictionaries = {
  es: { home: "Inicio", search: "Buscar", favorites: "Favoritos", playlists: "Biblioteca", stats: "Estadísticas", settings: "Ajustes", admin: "Administración",
    importPlaylist: "Importar", newPlaylist: "Nueva lista", trash: "Papelera", restore: "Restaurar", yourFavorites: "Tus favoritos", playFavorites: "Reproducir favoritos",
    menu: "Menú", library: "Tu biblioteca", empty: "Biblioteca vacía", searchField: "Buscar canciones, artistas o enlaces", searching: "Buscando…",
    login: "Iniciar sesión", skip: "Saltar al contenido", explore: "Explorar", all: "Todo", track: "Canciones", album: "Álbumes", artist: "Artistas", community: "Comunidad",
  },
  en: { home: "Home", search: "Search", favorites: "Favorites", playlists: "Library", stats: "Stats", settings: "Settings", admin: "Administration",
    importPlaylist: "Import", newPlaylist: "New playlist", trash: "Trash", restore: "Restore", yourFavorites: "Your favorites", playFavorites: "Play favorites",
    menu: "Menu", library: "Your library", empty: "Empty library", searchField: "Search songs, artists, or links", searching: "Searching…",
    login: "Sign in", skip: "Skip to content", explore: "Explore", all: "All", track: "Tracks", album: "Albums", artist: "Artists", community: "Community",
  },
  eu: { home: "Hasiera", search: "Bilatu", favorites: "Gogokoak", playlists: "Liburutegia", stats: "Estatistikak", settings: "Ezarpenak", admin: "Administrazioa",
    importPlaylist: "Inportatu", newPlaylist: "Zerrenda berria", trash: "Zakarrontzia", restore: "Leheneratu", yourFavorites: "Zure gogokoak", playFavorites: "Erreproduzitu gogokoak",
    menu: "Menua", library: "Zure liburutegia", empty: "Liburutegia hutsik", searchField: "Bilatu abestiak, artistak edo estekak", searching: "Bilatzen…",
    login: "Hasi saioa", skip: "Joan edukira", explore: "Arakatu", all: "Guztiak", track: "Abestiak", album: "Albumak", artist: "Artistak", community: "Komunitatea",
  },
} satisfies Record<Language, Record<string, string>>;
const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({ language: "es", setLanguage: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("ibrastream_language");
    return saved === "en" || saved === "eu" ? saved : "es";
  });
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("ibrastream_language", language);
  }, [language]);

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  return { ...context, labels: dictionaries[context.language] };
}

export function localized(language: Language, es: string, en: string, eu: string) {
  return language === "eu" ? eu : language === "en" ? en : es;
}
