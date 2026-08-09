import { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, desktopCapturer, screen, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The built directory structure
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

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
    currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch (e) {
    currentConfig = { ...DEFAULT_CONFIG };
  }
}

function saveConfig(newConfig: Partial<WidgetConfig>) {
  currentConfig = { ...currentConfig, ...newConfig };
  fs.writeFileSync(getConfigPath(), JSON.stringify(currentConfig, null, 2));
  
  // Re-apply shortcuts
  globalShortcut.unregisterAll();
  if (currentConfig.shortcutToggle) globalShortcut.register(currentConfig.shortcutToggle, () => toggleQuickNote());
  if (currentConfig.shortcutCapture) globalShortcut.register(currentConfig.shortcutCapture, () => captureScreen());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST, 'index.html'));
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
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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
    quickNoteWindow.loadFile(path.join(process.env.DIST, 'index.html'), { query: { mode: 'widget' } });
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
  tray = new Tray(path.join(process.env.VITE_PUBLIC, 'icon-192.png')); 
  
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

ipcMain.on('toggle-always-on-top', (event, isPinned) => {
  if (quickNoteWindow) {
    quickNoteWindow.setAlwaysOnTop(isPinned, 'screen-saver');
  }
});

ipcMain.on('hide-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.hide();
});

ipcMain.on('open-external-url', (_event, url) => {
  shell.openExternal(url).catch((err) => {
    console.error('Failed to open external URL:', err);
  });
});

ipcMain.handle('get-config', () => currentConfig);
ipcMain.on('save-config', (event, newConfig) => saveConfig(newConfig));
ipcMain.on('install-update', () => autoUpdater.quitAndInstall());
ipcMain.on('check-for-update', () => autoUpdater.checkForUpdates().catch(() => {}));

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

ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate().catch(() => {});
});

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  createQuickNoteWindow();
  try { setupTray(); } catch(e) { console.error('Tray icon failed', e) }
  
  if (currentConfig.shortcutToggle) globalShortcut.register(currentConfig.shortcutToggle, () => toggleQuickNote());
  if (currentConfig.shortcutCapture) globalShortcut.register(currentConfig.shortcutCapture, () => captureScreen());

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
    
    let wasPinned = false;
    // Hide quickNoteWindow BEFORE capturing so it doesn't appear in the screenshot
    if (quickNoteWindow && quickNoteWindow.isVisible()) {
      wasPinned = true;
      quickNoteWindow.hide();
      // Wait a moment for the OS to repaint the screen without the window
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'], 
      thumbnailSize: { width: width * scaleFactor, height: height * scaleFactor } 
    });
    const primarySource = sources[0]; 
    
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
        nodeIntegration: true,
        contextIsolation: false,
      }
    });

    cropWindow.loadFile(path.join(process.env.VITE_PUBLIC, 'crop.html'));
    
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

ipcMain.on('crop-finished', (_event, croppedDataUrl: string) => {
  if (cropWindow) {
    cropWindow.close();
    cropWindow = null;
  }
  
  // Always open Log Trade widget and attach the crop
  deliverScreenshotToWidget(croppedDataUrl);
});

ipcMain.handle('get-pending-screenshot', () => {
  const data = pendingScreenshot;
  return data;
});
ipcMain.on('screenshot-received', () => {
  pendingScreenshot = null;
});


ipcMain.on('crop-cancelled', () => {
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
