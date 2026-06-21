import { registerPlugin, Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

interface AppVersion {
  versionName: string;
  versionCode: number;
}

interface AppUpdaterPlugin {
  getAppVersion(): Promise<AppVersion>;
  installApk(options: { path: string }): Promise<{ status: string }>;
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  apkAssetId: number;
  apkSize: number;
}

export const getUpdaterCredentials = () => {
  return {
    pat: localStorage.getItem('github_updater_pat') || '',
    owner: localStorage.getItem('github_updater_owner') || '',
    repo: localStorage.getItem('github_updater_repo') || ''
  };
};

export const setUpdaterCredentials = (pat: string, owner: string, repo: string) => {
  localStorage.setItem('github_updater_pat', pat.trim());
  localStorage.setItem('github_updater_owner', owner.trim());
  localStorage.setItem('github_updater_repo', repo.trim());
};

export async function getLocalAppVersion(): Promise<AppVersion> {
  if (Capacitor.isNativePlatform()) {
    return await AppUpdater.getAppVersion();
  }
  return { versionName: '1.1.1', versionCode: 101 };
}

// Compare semantic versioning (e.g. "1.1.1" and "1.2.0")
function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map(Number);
  const currParts = parse(current);
  const lateParts = parse(latest);
  for (let i = 0; i < Math.max(currParts.length, lateParts.length); i++) {
    const curr = currParts[i] || 0;
    const late = lateParts[i] || 0;
    if (late > curr) return true;
    if (curr > late) return false;
  }
  return false;
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const { pat, owner, repo } = getUpdaterCredentials();
  if (!pat || !owner || !repo) {
    console.log('[Updater] Missing credentials. Auto-update check skipped.');
    return null;
  }

  try {
    const local = await getLocalAppVersion();
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    
    let releaseData: any = null;
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      const { CapacitorHttp } = await import('@capacitor/core');
      const response = await CapacitorHttp.request({
        url,
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${pat}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ibramusic-app-updater'
        }
      });
      if (response.status === 200) {
        releaseData = response.data;
      } else {
        throw new Error(`GitHub releases API failed with status ${response.status}`);
      }
    } else {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${pat}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (response.ok) {
        releaseData = await response.json();
      } else {
        throw new Error(`GitHub releases API failed with status ${response.status}`);
      }
    }

    if (!releaseData) return null;

    const latestVersion = releaseData.tag_name;
    const available = isNewerVersion(local.versionName, latestVersion);
    
    // Find APK asset
    const apkAsset = (releaseData.assets || []).find((asset: any) => asset.name.endsWith('.apk'));
    if (!apkAsset) {
      console.warn('[Updater] No APK asset found in the latest release.');
      return null;
    }

    return {
      available,
      currentVersion: local.versionName,
      latestVersion,
      releaseName: releaseData.name || latestVersion,
      releaseNotes: releaseData.body || '',
      apkAssetId: apkAsset.id,
      apkSize: apkAsset.size
    };
  } catch (err) {
    console.error('[Updater] Failed to check for updates:', err);
    throw err;
  }
}

export async function downloadAndInstallUpdate(
  apkAssetId: number,
  onProgress: (progress: number) => void
): Promise<void> {
  const { pat, owner, repo } = getUpdaterCredentials();
  if (!pat || !owner || !repo) {
    throw new Error('Missing updater credentials');
  }

  const isNative = Capacitor.isNativePlatform();
  if (!isNative) {
    console.log('[Updater] Mock download on non-native platform');
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      onProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        console.log('[Updater] Mock download complete');
      }
    }, 200);
    return;
  }

  try {
    const { CapacitorHttp } = await import('@capacitor/core');
    const downloadUrl = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${apkAssetId}`;
    const filename = `ibramusic-update-${apkAssetId}.apk`;

    // Verify cache directory existence
    try {
      await Filesystem.mkdir({
        path: 'updates',
        directory: Directory.Cache,
        recursive: true
      });
    } catch (e) {}

    const localPath = `updates/${filename}`;

    console.log(`[Updater] Downloading APK asset ${apkAssetId} via CapacitorHttp...`);
    
    // Download the binary file using ArrayBuffer response type to bypass webview boundary
    const response = await CapacitorHttp.request({
      url: downloadUrl,
      method: 'GET',
      headers: {
        'Accept': 'application/octet-stream',
        'Authorization': `Bearer ${pat}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ibramusic-app-updater'
      },
      responseType: 'arraybuffer'
    });

    if (response.status !== 200 || !response.data) {
      throw new Error(`Failed to download APK asset: HTTP ${response.status}`);
    }

    onProgress(50); // Download phase finished, writing to file

    console.log(`[Updater] Writing APK to Cache filesystem...`);
    await Filesystem.writeFile({
      path: localPath,
      data: response.data, // base64 encoded by arraybuffer responseType in Capacitor
      directory: Directory.Cache
    });

    onProgress(90);

    const fileUriResult = await Filesystem.getUri({
      path: localPath,
      directory: Directory.Cache
    });

    console.log(`[Updater] Launching native package installer for ${fileUriResult.uri}`);
    onProgress(100);

    const installResult = await AppUpdater.installApk({ path: fileUriResult.uri });
    if (installResult.status === 'need_permission') {
      throw new Error('Install permission required. Please enable it in the system settings screen that just opened and tap install again.');
    }
  } catch (err) {
    console.error('[Updater] Download & install failed:', err);
    throw err;
  }
}
