import { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, desktopCapturer, screen, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { validateConfig as parseConfig, isSafeExternalUrl, isDataImage } from './security';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The built directory structure
const DIST = path.join(__dirname, '../dist');
const PUBLIC = app.isPackaged ? DIST : path.join(DIST, '../public');
process.env.DIST = DIST;
process.env.VITE_PUBLIC = PUBLIC;

let mainWindow: BrowserWindow | null;
let quickNoteWindow: BrowserWindow | null = null;
let tray: Tray | null;
let cropWindow: BrowserWindow | null = null;
let isQuitting = false;
/** Held until the widget renderer confirms it received the screenshot (avoids race on show/load). */
let pendingScreenshot: string | null = null;
let pendingOAuthUrl: string | null = null;

// Register custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('trade-blitz-log', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('trade-blitz-log');
}

// Prevent multiple instances — only one Trade Log can run at a time
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // Someone tried to open a second instance — focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
    
    // Find deep link URL on Windows/Linux
    const url = commandLine.find((arg) => arg.startsWith('trade-blitz-log://'));
    if (url && mainWindow) {
      mainWindow.webContents.send('oauth-callback', url);
    }
  });
}

// Handle deep link on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('oauth-callback', url);
  } else {
    pendingOAuthUrl = url;
  }
});

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

interface WidgetConfig {
  shortcutToggle: string;
  shortcutCapture: string;
  autoHide: boolean;
  prefillAsset: string;
  prefillRisk: string;
}

const AUTH_ORIGIN = process.env.VITE_SUPABASE_URL;

const DEFAULT_CONFIG: WidgetConfig = {
  shortcutToggle: 'CommandOrControl+Shift+Space',
  shortcutCapture: 'CommandOrControl+Shift+X',
  autoHide: true,
  prefillAsset: '',
  prefillRisk: '',
};

function getConfigPath() {
  return path.join(app.getPath('userData'), 'widget-config.json');
}

let currentConfig = { ...DEFAULT_CONFIG };

function loadConfig() {
  try {
    const data = fs.readFileSync(getConfigPath(), 'utf-8');
    currentConfig = validateConfig(JSON.parse(data));
  } catch {
    currentConfig = { ...DEFAULT_CONFIG };
  }
}

function validateConfig(config: unknown): WidgetConfig {
  return parseConfig(config, DEFAULT_CONFIG);
}

function applyShortcuts(config: WidgetConfig) {
  globalShortcut.unregisterAll();
  const toggleRegistered = !config.shortcutToggle || globalShortcut.register(config.shortcutToggle, toggleQuickNote);
  const captureRegistered = !config.shortcutCapture || globalShortcut.register(config.shortcutCapture, captureScreen);
  if (!toggleRegistered || !captureRegistered) {
    globalShortcut.unregisterAll();
    throw new Error('A configured keyboard shortcut is unavailable');
  }
}

function saveConfig(newConfig: Partial<WidgetConfig>) {
  const previous = currentConfig;
  const candidate = validateConfig({ ...previous, ...newConfig });
  try {
    applyShortcuts(candidate);
    const temporaryPath = `${getConfigPath()}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(candidate, null, 2));
    fs.renameSync(temporaryPath, getConfigPath());
  } catch (error) {
    try { applyShortcuts(previous); } catch (restoreError) { console.error('Could not restore shortcuts', restoreError); }
    throw error;
  }
  currentConfig = candidate;
  return currentConfig;
}

function hardenWindow(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url, AUTH_ORIGIN)) void shell.openExternal(url).catch(console.error);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-redirect', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

function trustedSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent, role: 'app' | 'widget' = 'app') {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (event.senderFrame !== event.sender.mainFrame) return false;
  if (role === 'widget') return window === quickNoteWindow;
  return window === mainWindow || window === quickNoteWindow;
}

function requireSender(event: Electron.IpcMainInvokeEvent) {
  if (!trustedSender(event)) throw new Error('Unauthorized IPC sender');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  hardenWindow(mainWindow);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(DIST, 'index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    // Check for pending deep link from startup (Windows/Linux)
    const startupUrl = process.argv.find((arg) => arg.startsWith('trade-blitz-log://'));
    if (startupUrl) {
      mainWindow?.webContents.send('oauth-callback', startupUrl);
    }
    
    // Check for pending deep link from macOS
    if (pendingOAuthUrl) {
      mainWindow?.webContents.send('oauth-callback', pendingOAuthUrl);
      pendingOAuthUrl = null;
    }
  });
}

function createQuickNoteWindow() {
  quickNoteWindow = new BrowserWindow({
    width: 480,
    height: 720,
    frame: false,
    transparent: false,
    backgroundColor: '#0e1015',
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  hardenWindow(quickNoteWindow);

  quickNoteWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      quickNoteWindow?.hide();
    }
  });
  
  quickNoteWindow.on('blur', () => {
    if (quickNoteWindow && currentConfig.autoHide && !quickNoteWindow.isAlwaysOnTop() && !quickNoteWindow.webContents.isDevToolsOpened()) {
      quickNoteWindow.hide();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    quickNoteWindow.loadURL(`${VITE_DEV_SERVER_URL}?mode=widget`);
  } else {
    quickNoteWindow.loadFile(path.join(DIST, 'index.html'), { query: { mode: 'widget' } });
  }
}

function toggleQuickNote() {
  if (!quickNoteWindow || quickNoteWindow.isDestroyed()) {
    createQuickNoteWindow();
  }
  
  if (quickNoteWindow!.isVisible()) {
    quickNoteWindow!.hide();
  } else {
    quickNoteWindow!.show();
    quickNoteWindow!.focus();
  }
}
function showQuickNoteWindow() {
  if (!quickNoteWindow || quickNoteWindow.isDestroyed()) {
    createQuickNoteWindow();
  }
  if (!quickNoteWindow) return;
  if (!quickNoteWindow.isVisible()) {
    quickNoteWindow.show();
  }
  quickNoteWindow.focus();
}
function deliverScreenshotToWidget(dataUrl: string) {
  pendingScreenshot = dataUrl;
  if (!quickNoteWindow || quickNoteWindow.isDestroyed()) {
    createQuickNoteWindow();
    quickNoteWindow?.webContents.once('did-finish-load', () => {
      if (pendingScreenshot && quickNoteWindow && !quickNoteWindow.isDestroyed()) {
        quickNoteWindow.webContents.send('screenshot-captured', pendingScreenshot);
      }
      showQuickNoteWindow();
    });
    return;
  }
  const send = () => {
    if (!quickNoteWindow || quickNoteWindow.isDestroyed() || !pendingScreenshot) return;
    quickNoteWindow.webContents.send('screenshot-captured', pendingScreenshot);
    showQuickNoteWindow();
  };
  if (quickNoteWindow.webContents.isLoading()) {
    quickNoteWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}


function setupTray() {
  // Use a blank tray icon or standard icon for now (fallback to nothing if error)
  tray = new Tray(path.join(PUBLIC, 'icon-192.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Main App', click: () => mainWindow?.show() },
    { label: 'Show Quick Note', click: () => toggleQuickNote() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);
  
  tray.setToolTip('Trade Blitz Log');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow?.show();
  });
}

ipcMain.on('toggle-always-on-top', (event, isPinned: unknown) => {
  if (trustedSender(event, 'widget') && typeof isPinned === 'boolean') {
    quickNoteWindow?.setAlwaysOnTop(isPinned, 'screen-saver');
  }
});

ipcMain.on('hide-window', (event) => {
  if (!trustedSender(event)) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.hide();
});

ipcMain.on('open-external-url', (event, url: unknown) => {
  if (!trustedSender(event)) return;
  if (!isSafeExternalUrl(url, AUTH_ORIGIN)) return;
  shell.openExternal(url).catch((err: Error) => {
    console.error('Failed to open external URL:', err);
  });
});

ipcMain.handle('get-config', (event) => { requireSender(event); return currentConfig; });
ipcMain.handle('save-config', (event, newConfig: unknown) => {
  requireSender(event);
  return saveConfig(parseConfig(newConfig, currentConfig));
});
ipcMain.on('install-update', (event) => { if (trustedSender(event)) autoUpdater.quitAndInstall(); });
ipcMain.on('check-for-update', (event) => { if (trustedSender(event)) void autoUpdater.checkForUpdates().catch(console.error); });

function setupAutoUpdater() {
  // Don't check for updates in dev mode
  if (VITE_DEV_SERVER_URL) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
    mainWindow?.webContents.send('update-error', { message: err?.message || 'Unknown error' });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-not-available');
  });

  // Check on startup (after a short delay)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);

  // Check every 30 minutes
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
}

ipcMain.on('download-update', (event) => {
  if (!trustedSender(event)) return;
  autoUpdater.downloadUpdate().catch(() => {});
});

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  createQuickNoteWindow();
  try { setupTray(); } catch(e) { console.error('Tray icon failed', e) }
  
  try { applyShortcuts(currentConfig); } catch (error) { console.error('Keyboard shortcuts unavailable', error); }

  setupAutoUpdater();


  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    mainWindow = null;
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

async function captureScreen() {
  if (cropWindow) return; // Already capturing

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    // Use scaling factor if necessary, but getPrimaryDisplay.size usually handles it
    const { width, height } = primaryDisplay.size;
    // For high DPI, scale factor might be needed
    const scaleFactor = primaryDisplay.scaleFactor;
    
    // Hide quickNoteWindow BEFORE capturing so it doesn't appear in the screenshot
    if (quickNoteWindow && quickNoteWindow.isVisible()) {
      quickNoteWindow.hide();
      // Wait a moment for the OS to repaint the screen without the window
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'], 
      thumbnailSize: { width: width * scaleFactor, height: height * scaleFactor } 
    });
    const primarySource = sources.find(source => source.display_id === String(primaryDisplay.id)) ?? sources[0];
    if (!primarySource) throw new Error('No screen is available for capture');
    
    const screenshotDataUrl = primarySource.thumbnail.toDataURL();

    cropWindow = new BrowserWindow({
      width, height,
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      }
    });
    hardenWindow(cropWindow);

    cropWindow.loadFile(path.join(PUBLIC, 'crop.html'));
    
    cropWindow.webContents.on('did-finish-load', () => {
      cropWindow?.webContents.send('screenshot-data', screenshotDataUrl);
      cropWindow?.focus();
      
      // We intentionally do not call moveTop() here anymore.
      // moveTop() on Windows with transparent frameless windows can cause
      // the window to lose hit testing (become unclickable) after the crop window closes.
      // The user can still crop over the Quick Note.
    });

    cropWindow.on('closed', () => {
      cropWindow = null;
    });

  } catch (err) {
    console.error("Failed to capture screen:", err);
  }
}

ipcMain.on('crop-finished', (event, croppedDataUrl: unknown) => {
  if (BrowserWindow.fromWebContents(event.sender) !== cropWindow || event.senderFrame !== event.sender.mainFrame || !isDataImage(croppedDataUrl)) return;
  if (cropWindow) {
    cropWindow.close();
    cropWindow = null;
  }
  
  // Always open Log Trade widget and attach the crop
  deliverScreenshotToWidget(croppedDataUrl);
});

ipcMain.handle('get-pending-screenshot', (event) => {
  if (!trustedSender(event, 'widget')) throw new Error('Unauthorized IPC sender');
  const data = pendingScreenshot;
  return data;
});
ipcMain.on('screenshot-received', (event) => {
  if (!trustedSender(event, 'widget')) return;
  pendingScreenshot = null;
});


ipcMain.on('crop-cancelled', (event) => {
  if (BrowserWindow.fromWebContents(event.sender) !== cropWindow || event.senderFrame !== event.sender.mainFrame) return;
  if (cropWindow) {
    cropWindow.close();
    cropWindow = null;
  }
  if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
    // Restore widget if it was visible before capture (alwaysOnTop / pinned path)
    if (quickNoteWindow.isAlwaysOnTop() || quickNoteWindow.isVisible()) {
      showQuickNoteWindow();
    }
  }
});
