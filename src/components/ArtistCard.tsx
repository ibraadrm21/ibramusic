import { useState } from "react";
import { ActionMenu, menuAction } from "./ActionMenu";
import { localized, useLanguage } from "../context/LanguageContext";
import { CoverImage } from "./CoverImage";
import { User, MoreVertical, Link, Heart } from "lucide-react";
import type { Artist } from "../services/musicApi";

interface ArtistCardProps {
  artist: Artist;
  onClick: (artist: Artist) => void;
  onShare?: (artist: Artist) => void;
  onFollow?: (artist: Artist) => void;
  followed?: boolean;
}

export const ArtistCard: React.FC<ArtistCardProps> = ({ artist, onClick, onShare, onFollow, followed }) => {
  const { language } = useLanguage();
  const [contextRequest, setContextRequest] = useState(0);
  const profile = localized(language, "Ver artista", "View artist", "Ikusi artista");
  return (
    <div className="relative" onContextMenu={event => {
      if ((!onShare && !onFollow) || !matchMedia("(min-width: 1024px)").matches) return;
      event.preventDefault(); setContextRequest(value => value + 1);
    }}>
    <button type="button"
      onClick={() => onClick(artist)}
      className="group relative flex w-full flex-col items-center gap-3 p-3.5 rounded-2xl glass-card cursor-pointer select-none transition-all duration-300 hover:bg-white/5"
    >
      {/* Profile Picture Container (Circular) */}
      <div className="relative w-36 h-36 rounded-full overflow-hidden shadow-lg shadow-black/40 border border-white/5">
        <CoverImage
          src={artist.thumbnail}
          alt={artist.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Cover Overlay details on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-4 text-center">
          <User className="w-6 h-6 text-brand-accent mb-1" />
          <span className="text-[10px] font-semibold text-white">{profile}</span>
        </div>
      </div>

      {/* Metadata */}
      <div className="w-full text-center min-w-0">
        <h3 className="font-semibold text-sm text-white truncate group-hover:text-brand-accent transition-colors duration-200">
          {artist.name}
        </h3>
      </div>
    </button>
    {(onShare || onFollow) && <div className="absolute right-2 top-2 z-10 hidden lg:block">
      <ActionMenu label={localized(language, "Acciones de artista", "Artist actions", "Artistaren ekintzak")} contextRequest={contextRequest}
        className="rounded-full bg-brand-darkBg p-2 text-gray-400 hover:text-white" button={<MoreVertical className="size-4" />}>
        {close => <>
          <button className={menuAction} onClick={() => { close(); onClick(artist); }}><User className="size-4" />{profile}</button>
          {onFollow && <button className={menuAction} onClick={() => { close(); onFollow(artist); }}><Heart className="size-4" />{followed ? localized(language, "Dejar de seguir", "Unfollow", "Utzi jarraitzeari") : localized(language, "Seguir", "Follow", "Jarraitu")}</button>}
          {onShare && <button className={menuAction} onClick={() => { close(); onShare(artist); }}><Link className="size-4" />{localized(language, "Copiar enlace", "Copy link", "Kopiatu esteka")}</button>}
        </>}
      </ActionMenu>
    </div>}
    </div>
  );
};

export default ArtistCard;
