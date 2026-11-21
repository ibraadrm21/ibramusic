import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Language = "es" | "en";
const dictionaries = {
  es: { home: "Inicio", search: "Buscar", favorites: "Favoritos", playlists: "Biblioteca", stats: "Estadísticas", settings: "Ajustes", admin: "Administración",
    menu: "Menú", library: "Tu biblioteca", empty: "Biblioteca vacía", searchField: "Buscar canciones, artistas o enlaces", searching: "Buscando…",
    login: "Iniciar sesión", skip: "Saltar al contenido", explore: "Explorar", all: "Todo", track: "Canciones", album: "Álbumes", artist: "Artistas", community: "Comunidad",
  },
  en: { home: "Home", search: "Search", favorites: "Favorites", playlists: "Library", stats: "Stats", settings: "Settings", admin: "Administration",
    menu: "Menu", library: "Your library", empty: "Empty library", searchField: "Search songs, artists, or links", searching: "Searching…",
    login: "Sign in", skip: "Skip to content", explore: "Explore", all: "All", track: "Tracks", album: "Albums", artist: "Artists", community: "Community",
  },
} satisfies Record<Language, Record<string, string>>;
const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({ language: "es", setLanguage: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem("ibrastream_language") === "en" ? "en" : "es");
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
