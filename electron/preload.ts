import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electronAPI', {
    toggleAlwaysOnTop: (isPinned: boolean) => ipcRenderer.send('toggle-always-on-top', isPinned),
    hideWindow: () => ipcRenderer.send('hide-window'),
    openExternalUrl: (url: string) => ipcRenderer.send('open-external-url', url),
    onOAuthCallback: (callback: (url: string) => void) => {
      const subscription = (_event: any, url: string) => callback(url);
      ipcRenderer.on('oauth-callback', subscription);
      return () => {
        ipcRenderer.removeListener('oauth-callback', subscription);
      };
    },
    onScreenshotCaptured: (callback: (dataUrl: string) => void) =>
      ipcRenderer.on('screenshot-captured', (_event, dataUrl) => callback(dataUrl)),
    getPendingScreenshot: () => ipcRenderer.invoke('get-pending-screenshot') as Promise<string | null>,
    ackScreenshotReceived: () => ipcRenderer.send('screenshot-received'),
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config: any) => ipcRenderer.send('save-config', config),
    // Auto-update APIs
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void) =>
      ipcRenderer.on('update-available', (_event, info) => callback(info)),
    onDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) =>
      ipcRenderer.on('download-progress', (_event, progress) => callback(progress)),
    onUpdateDownloaded: (callback: (info: { version: string }) => void) =>
      ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
    onUpdateNotAvailable: (callback: () => void) =>
      ipcRenderer.on('update-not-available', () => callback()),
    onUpdateError: (callback: (err: { message: string }) => void) =>
      ipcRenderer.on('update-error', (_event, err) => callback(err)),
    downloadUpdate: () => ipcRenderer.send('download-update'),
    installUpdate: () => ipcRenderer.send('install-update'),
    checkForUpdate: () => ipcRenderer.send('check-for-update'),
  }
);
