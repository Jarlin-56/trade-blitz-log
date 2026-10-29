import { contextBridge, ipcRenderer } from 'electron';

export interface WidgetConfig {
  shortcutToggle: string;
  shortcutCapture: string;
  autoHide: boolean;
  prefillAsset: string;
  prefillRisk: string;
}

type UpdateInfo = { version: string; releaseNotes?: string };
type DownloadProgress = { percent: number; transferred: number; total: number };

const subscribe = <T>(channel: string, callback: (value: T) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
if (location.pathname.endsWith('/crop.html') || location.pathname.endsWith('\\crop.html') || location.href.includes('crop.html')) {
  contextBridge.exposeInMainWorld('cropAPI', {
    onScreenshotData: (callback: (dataUrl: string) => void) => subscribe('screenshot-data', callback),
    finish: (dataUrl: string) => ipcRenderer.send('crop-finished', dataUrl),
    cancel: () => ipcRenderer.send('crop-cancelled'),
  });
} else {
contextBridge.exposeInMainWorld(
  'electronAPI', {
    toggleAlwaysOnTop: (isPinned: boolean) => ipcRenderer.send('toggle-always-on-top', isPinned),
    hideWindow: () => ipcRenderer.send('hide-window'),
    openExternalUrl: (url: string) => ipcRenderer.send('open-external-url', url),
    onOAuthCallback: (callback: (url: string) => void) => subscribe('oauth-callback', callback),
    onScreenshotCaptured: (callback: (dataUrl: string) => void) =>
      subscribe('screenshot-captured', callback),
    getPendingScreenshot: () => ipcRenderer.invoke('get-pending-screenshot') as Promise<string | null>,
    ackScreenshotReceived: () => ipcRenderer.send('screenshot-received'),
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config: Partial<WidgetConfig>) => ipcRenderer.invoke('save-config', config),
    // Auto-update APIs
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => subscribe('update-available', callback),
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => subscribe('download-progress', callback),
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => subscribe('update-downloaded', callback),
    onUpdateNotAvailable: (callback: () => void) => subscribe('update-not-available', callback),
    onUpdateError: (callback: (err: { message: string }) => void) => subscribe('update-error', callback),
    downloadUpdate: () => ipcRenderer.send('download-update'),
    installUpdate: () => ipcRenderer.send('install-update'),
    checkForUpdate: () => ipcRenderer.send('check-for-update'),
  }
);

}
