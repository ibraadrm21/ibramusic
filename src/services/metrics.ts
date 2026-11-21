import { StorageService } from "./storageService";

export type Metric = "search" | "play" | "play_error";
interface Observation { count: number; mean: number }

export const METRICS_KEY = "ibrastream_device_metrics";

export function measure(metric: Metric, duration: number) {
  if (sessionStorage.getItem("ibrastream_private_session") === "true" || !Number.isFinite(duration) || duration < 0) return;
  const current = StorageService.getItemSync<Partial<Record<Metric, Observation>>>(METRICS_KEY) ?? {};
  const previous = current[metric] ?? { count: 0, mean: 0 };
  const count = previous.count + 1;
  current[metric] = { count, mean: Math.round((previous.mean * previous.count + duration) / count) };
  StorageService.setItemSync(METRICS_KEY, current);
}
