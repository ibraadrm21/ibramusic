import { User } from "lucide-react";
import type { Artist } from "../services/musicApi";

interface ArtistCardProps {
  artist: Artist;
  onClick: (artist: Artist) => void;
}

export const ArtistCard: React.FC<ArtistCardProps> = ({ artist, onClick }) => {
  return (
    <div
      onClick={() => onClick(artist)}
      className="group relative flex flex-col items-center gap-3 p-3.5 rounded-2xl glass-card cursor-pointer select-none transition-all duration-300 hover:bg-white/5"
    >
      {/* Profile Picture Container (Circular) */}
      <div className="relative w-36 h-36 rounded-full overflow-hidden shadow-lg shadow-black/40 border border-white/5">
        <img
          src={artist.thumbnail}
          alt={artist.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Cover Overlay details on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-4 text-center">
          <User className="w-6 h-6 text-brand-accent mb-1" />
          <span className="text-[10px] font-semibold text-white">View Profile</span>
        </div>
      </div>

      {/* Metadata */}
      <div className="w-full text-center min-w-0">
        <h3 className="font-semibold text-sm text-white truncate group-hover:text-brand-accent transition-colors duration-200">
          {artist.name}
        </h3>
      </div>
    </div>
  );
};

export default ArtistCard;
