import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';

const Media3Session = (Capacitor as any).Plugins?.Media3Session || registerPlugin<any>("Media3Session");

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  apkUrl?: string;
}

/**
 * Compares two semantic version strings (e.g. "1.2.0" and "1.1.9")
 * Returns true if the latest version is greater than the current version.
 */
function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/[^0-9.]/g, '').split('.').map(Number);
  const currentParts = parse(current);
  const latestParts = parse(latest);

  const maxLen = Math.max(currentParts.length, latestParts.length);
  for (let i = 0; i < maxLen; i++) {
    const curVal = currentParts[i] || 0;
    const latVal = latestParts[i] || 0;
    if (latVal > curVal) return true;
    if (curVal > latVal) return false;
  }
  return false;
}

/**
 * Checks for updates on GitHub releases.
 */
export async function checkForUpdates(isAuto: boolean = false): Promise<UpdateInfo | null> {
  try {
    let currentVersion = '1.0.0';

    if (Capacitor.isNativePlatform()) {
      const info = await App.getInfo();
      currentVersion = info.version;
    } else {
      currentVersion = localStorage.getItem('ibrastream_mock_version') || '1.0.0';
    }

    // Add timestamp to avoid caching
    const response = await fetch(`https://api.github.com/repos/ibraadrm21/ibramusic/releases/latest?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`GitHub API returned status: ${response.status}`);
    }

    const data = await response.json();
    const latestVersion = data.tag_name ? data.tag_name.replace(/^v/, '') : '';
    if (!latestVersion) {
      return null;
    }

    const hasUpdate = isNewerVersion(currentVersion, latestVersion);

    // Find the APK file link if present in the assets
    let apkUrl = '';
    if (data.assets && Array.isArray(data.assets)) {
      const apkAsset = data.assets.find((asset: any) => asset.name && asset.name.endsWith('.apk'));
      if (apkAsset) {
        apkUrl = apkAsset.browser_download_url;
      }
    }

    const updateInfo: UpdateInfo = {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseUrl: data.html_url,
      releaseNotes: data.body,
      apkUrl: apkUrl || data.html_url
    };

    // If auto-update is enabled and we are on Android, trigger download immediately
    const lastAttempt = localStorage.getItem('ibrastream_last_update_attempt');
    if (isAuto && hasUpdate && apkUrl && Capacitor.getPlatform() === 'android' && lastAttempt !== latestVersion) {
      console.log("Auto-update triggered: Downloading new version...");
      localStorage.setItem('ibrastream_last_update_attempt', latestVersion);
      Media3Session.downloadAndInstallApk({ url: apkUrl }).catch((err: any) => {
        console.error("Auto-update download failed:", err);
      });
    }

    return updateInfo;
  } catch (error) {
    console.error('Update check failed:', error);
    return null;
  }
}

/**
 * Starts a background interval to check for updates periodically.
 */
export function startAutoUpdatePolling(intervalMinutes: number = 30) {
  // Initial check
  setTimeout(() => checkForUpdates(true), 5000);

  // Periodic check
  setInterval(() => {
    checkForUpdates(true);
  }, intervalMinutes * 60 * 1000);
}

export async function redirectToUpdate(url: string): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await Media3Session.downloadAndInstallApk({ url });
      return;
    } catch (error) {
      console.error('Direct APK installation failed, falling back to browser:', error);
    }
  }

  try {
    await Browser.open({ url });
  } catch (error) {
    console.error('Failed to open browser:', error);
    // Fallback
    window.open(url, '_blank');
  }
}
