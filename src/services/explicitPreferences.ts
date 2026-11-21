import { StorageService } from "./storageService";

const preferenceKey = "ibrastream_track_version_preferences";

export function trackVersionId(id: string) {
  return id.replace(/^yt-/, "");
}

export function readTrackVersionPreferences(): Record<string, boolean> {
  return StorageService.getItemSync<Record<string, boolean>>(preferenceKey) ?? {};
}

export function saveTrackVersionPreferences(preferences: Record<string, boolean>) {
  StorageService.setItemSync(preferenceKey, preferences);
}

export function readTrackVersionPreference(id: string, preferences = readTrackVersionPreferences()): boolean | undefined {
  const value = preferences[trackVersionId(id)];
  return typeof value === "boolean" ? value : undefined;
}
