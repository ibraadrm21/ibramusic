import { ChevronRight } from "lucide-react";
import type { Playlist } from "../services/librarySync";

const action = "rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 transition-all hover:border-white/20 hover:text-white";
const disclosure = "flex cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold text-gray-300 hover:text-white [&::-webkit-details-marker]:hidden";

export function LibraryExtras({ deleted, onRestore }: { deleted: Playlist[]; onRestore: (playlist: Playlist) => void }) {
  if (!deleted.length) return null;
  return (
    <details className="group border-b border-white/5 px-1 py-3">
      <summary className={disclosure}>
        <ChevronRight aria-hidden="true" className="size-4 text-brand-accent transition-transform group-open:rotate-90" />
        Papelera ({deleted.length})
      </summary>
      <ul className="mt-3 space-y-2">
        {deleted.map(playlist => (
          <li key={playlist.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{playlist.name}</span>
            <button type="button" className={action} onClick={() => onRestore(playlist)}>Restaurar</button>
          </li>
        ))}
      </ul>
    </details>
  );
}
