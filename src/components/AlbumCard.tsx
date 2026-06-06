import React from "react";
import { Disc, Calendar } from "lucide-react";
import type { Album } from "../services/musicApi";

interface AlbumCardProps {
  album: Album;
  onClick: (album: Album) => void;
}

export const AlbumCard: React.FC<AlbumCardProps> = ({ album, onClick }) => {
  return (
    <div
      onClick={() => onClick(album)}
      className="group relative flex flex-col items-center gap-3 p-3.5 rounded-2xl glass-card cursor-pointer select-none transition-all duration-300 hover:bg-white/5"
    >
      {/* Cover Art Container */}
      <div className="relative w-full aspect-square rounded-xl overflow-hidden shadow-lg shadow-black/40">
        <img
          src={album.thumbnail}
          alt={album.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Cover Overlay details on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-4 text-center">
          <Disc className="w-8 h-8 text-brand-accent animate-spin-slow mb-2" />
          <span className="text-xs font-semibold text-white">View Album</span>
          {album.numberOfTracks && (
            <span className="text-[10px] text-gray-400 mt-1">{album.numberOfTracks} Tracks</span>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="w-full text-center min-w-0">
        <h3 className="font-semibold text-sm text-white truncate group-hover:text-brand-accent transition-colors duration-200">
          {album.title}
        </h3>
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{album.artist}</p>
        
        {album.releaseDate && (
          <div className="flex items-center justify-center gap-1 mt-1 text-[9px] text-gray-500">
            <Calendar className="w-3 h-3" />
            <span>{album.releaseDate}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlbumCard;
