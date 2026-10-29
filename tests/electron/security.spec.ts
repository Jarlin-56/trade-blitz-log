import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('sandboxed app/widget preload and crop bridge work without exposing Node', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trade-log-test-'));
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [resolve('dist-electron/main.js'), `--user-data-dir=${directory}`], env });
  try {
    const page = await app.firstWindow();
    await expect.poll(() => page.evaluate(() => typeof window.electronAPI?.getConfig)).toBe('function');
    const config = await page.evaluate(() => window.electronAPI.getConfig());
    expect(config.autoHide).toBe(true);
    await expect(page.evaluate(() => window.electronAPI.saveConfig({ shortcutCapture: 'invalid' }))).rejects.toThrow();
    const security = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => {
      // Electron exposes this runtime inspection method without declaring it in
      // the public WebContents type. Keep the test-only boundary narrowly typed.
      const preferences = (window.webContents as unknown as {
        getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean };
      }).getLastWebPreferences();
      return { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration };
    }));
    expect(security.length).toBeGreaterThanOrEqual(2);
    for (const preferences of security) expect(preferences).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    expect(await page.evaluate(() => typeof (globalThis as unknown as { require?: unknown }).require)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.cropAPI)).toBe('undefined');

    const cropPath = resolve('dist/crop.html');
    const preloadPath = resolve('dist-electron/preload.cjs');
    const newWindow = app.waitForEvent('window');
    await app.evaluate(async ({ BrowserWindow }, { cropPath, preloadPath }) => {
      const window = new BrowserWindow({ show: false, webPreferences: { preload: preloadPath, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      await window.loadFile(cropPath);
    }, { cropPath, preloadPath });
    const crop = await newWindow;
    await expect.poll(() => crop.evaluate(() => typeof window.cropAPI?.finish)).toBe('function');
    expect(await crop.evaluate(() => typeof window.electronAPI)).toBe('undefined');
    await app.evaluate(({ BrowserWindow }, cropPath) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/crop.html'));
      if (!window) throw new Error(`Crop window missing: ${cropPath}`);
      window.webContents.send('screenshot-data', 'data:image/png;base64,iVBORw0KGgoAAA==');
    }, cropPath);
    await expect(crop.locator('#screenshot')).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgoAAA==');
    // This independent crop fixture is not registered as the app's capture window.
    // Its finish/cancel IPC must be rejected by the main process sender checks.
    await crop.evaluate(() => { window.cropAPI.finish('data:image/png;base64,iVBORw0KGgoAAA=='); window.cropAPI.cancel(); });
    expect(crop.isClosed()).toBe(false);
  } finally {
    await app.evaluate(({ app }) => app.exit());
    await app.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
