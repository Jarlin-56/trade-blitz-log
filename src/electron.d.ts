export interface WidgetConfig {
  shortcutToggle: string;
  shortcutCapture: string;
  autoHide: boolean;
  prefillAsset: string;
  prefillRisk: string;
}

export interface ElectronAPI {
  toggleAlwaysOnTop: (isPinned: boolean) => void;
  hideWindow: () => void;
  openExternalUrl: (url: string) => void;
  onOAuthCallback: (callback: (url: string) => void) => () => void;
  onScreenshotCaptured: (callback: (dataUrl: string) => void) => () => void;
  getPendingScreenshot: () => Promise<string | null>;
  ackScreenshotReceived: () => void;
  getConfig: () => Promise<WidgetConfig>;
  saveConfig: (config: Partial<WidgetConfig>) => Promise<WidgetConfig>;
  // Auto-update APIs
  onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void) => () => void;
  onDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
  onUpdateError: (callback: (err: { message: string }) => void) => () => void;
  downloadUpdate: () => void;
  installUpdate: () => void;
  checkForUpdate: () => void;
}

export interface CropAPI {
  onScreenshotData: (callback: (dataUrl: string) => void) => () => void;
  finish: (dataUrl: string) => void;
  cancel: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    cropAPI: CropAPI;
  }
}
