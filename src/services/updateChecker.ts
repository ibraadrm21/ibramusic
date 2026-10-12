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

export const CURRENT_APP_VERSION = '1.1.8';

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
 * Returns true if running as a native Android or iOS app (Capacitor/Cordova/Electron wrapper),
 * NOT in a standard desktop or mobile web browser.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  // Capacitor native check
  const win = window as any;
  if (win.Capacitor?.isNativePlatform?.()) return true;
  if (win.Capacitor?.getPlatform && win.Capacitor.getPlatform() !== 'web') return true;
  // Android wrapper or standalone app
  if (win.AndroidBridge || win.isNativeApp) return true;
  return false;
}

/**
 * Checks for updates on GitHub releases (only for native apps).
 */
export async function checkForUpdates(_isAuto: boolean = false): Promise<UpdateInfo | null> {
  // Never show APK/App update prompts when running as a web page in a browser
  if (!isNativeApp()) {
    return null;
  }

  try {
    const currentVersion = localStorage.getItem('ibrastream_mock_version') || CURRENT_APP_VERSION;
    const { pat, owner, repo } = getUpdaterCredentials();
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest?t=${Date.now()}`;
    
    let data: any = null;

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (pat) {
      headers['Authorization'] = `Bearer ${pat}`;
    }

    const response = await fetch(url, { headers });
    if (response.ok) {
      data = await response.json();
    } else {
      throw new Error(`GitHub API returned status: ${response.status}`);
    }

    const latestVersion = data.tag_name ? data.tag_name.replace(/^v/, '') : '';
    if (!latestVersion) {
      return null;
    }

    const hasUpdate = isNewerVersion(currentVersion, latestVersion);

    const updateInfo: UpdateInfo = {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseUrl: data.html_url,
      releaseNotes: data.body,
      token: pat
    };

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
  setTimeout(() => checkForUpdates(true), 5000);

  setInterval(() => {
    checkForUpdates(true);
  }, intervalMinutes * 60 * 1000);
}

export async function redirectToUpdate(url: string, _token?: string): Promise<void> {
  window.open(url, '_blank');
}
