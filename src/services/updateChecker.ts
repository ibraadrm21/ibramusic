import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  apkUrl?: string;
  token?: string;
}

export const getUpdaterCredentials = () => {
  return {
    pat: localStorage.getItem('github_updater_pat') || '',
    owner: localStorage.getItem('github_updater_owner') || 'ibraadrm21',
    repo: localStorage.getItem('github_updater_repo') || 'ibramusic'
  };
};

export const setUpdaterCredentials = (pat: string, owner: string, repo: string) => {
  localStorage.setItem('github_updater_pat', pat.trim());
  localStorage.setItem('github_updater_owner', owner.trim());
  localStorage.setItem('github_updater_repo', repo.trim());
};

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

    const { pat, owner, repo } = getUpdaterCredentials();
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest?t=${Date.now()}`;
    
    let data: any = null;
    const isNative = Capacitor.isNativePlatform();

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (pat) {
      headers['Authorization'] = `Bearer ${pat}`;
    }

    if (isNative) {
      const { CapacitorHttp } = await import('@capacitor/core');
      const response = await CapacitorHttp.request({
        url,
        method: 'GET',
        headers
      });
      if (response.status === 200) {
        data = response.data;
      } else {
        throw new Error(`GitHub API returned status: ${response.status}`);
      }
    } else {
      const response = await fetch(url, { headers });
      if (response.ok) {
        data = await response.json();
      } else {
        throw new Error(`GitHub API returned status: ${response.status}`);
      }
    }

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
        // If private, use the API asset endpoint instead of browser_download_url
        if (pat) {
          apkUrl = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${apkAsset.id}`;
        } else {
          apkUrl = apkAsset.browser_download_url;
        }
      }
    }

    const updateInfo: UpdateInfo = {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseUrl: data.html_url,
      releaseNotes: data.body,
      apkUrl: apkUrl || data.html_url,
      token: pat
    };

    // If auto-update is enabled and we are on Android, log availability
    const lastAttempt = localStorage.getItem('ibrastream_last_update_attempt');
    if (isAuto && hasUpdate && apkUrl && Capacitor.getPlatform() === 'android' && lastAttempt !== latestVersion) {
      console.log("Auto-update available: New version " + latestVersion);
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

export async function redirectToUpdate(url: string, _token?: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  } catch (error) {
    console.error('Failed to open update URL:', error);
    window.open(url, '_blank');
  }
}
