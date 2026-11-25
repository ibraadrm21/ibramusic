export function crossfadeVolumes(elapsedMs: number, durationMs: number, volume: number, muted: boolean) {
  const progress = Math.min(1, Math.max(0, elapsedMs / durationMs));
  const total = muted ? 0 : Math.round(Math.max(0, Math.min(1, volume)) * 100);
  const incoming = Math.round(total * progress);
  return { progress, incoming, outgoing: total - incoming };
}
