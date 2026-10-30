import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';

const STAGING_CONFIG_PATH = 'C:\\Users\\User\\TradeLog-Backups\\staging-config.json';
const EXECUTABLE_PATH = path.resolve('release-staging/win-unpacked/Trade Log.exe');
const APP_UPDATE_YML_PATH = path.resolve('release-staging/win-unpacked/resources/app-update.yml');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function runPackagedTest() {
  log('========================================================================');
  log('STARTING PACKAGED EXECUTABLE SMOKE & REGRESSION TEST (A10-R)');
  log(`Executable: ${EXECUTABLE_PATH}`);
  log('========================================================================');

  if (!fs.existsSync(EXECUTABLE_PATH)) {
    throw new Error(`Executable not found at ${EXECUTABLE_PATH}`);
  }

  // Load staging configuration
  const rawCfg = fs.readFileSync(STAGING_CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
  const cfg = JSON.parse(rawCfg);
  const stagingUrl = cfg.supabase_url;
  const anonKey = cfg.anon_key;
  const serviceKey = cfg.service_role_key;

  // Staging admin client for setting up test users & cleanup only
  const adminClient = createClient(stagingUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const emailA = `pack_test_a_${testSuffix}@internal.test`;
  const emailB = `pack_test_b_${testSuffix}@internal.test`;
  const password = `PackPass_${testSuffix}_123!#`;

  // Item 5: Cleanup tracking begins BEFORE creating test users
  const cleanupTasks = {
    userIds: [],
    storagePaths: [],
    tempDirs: [],
    servers: [],
    apps: [],
    appUpdateBackup: null
  };
  const cleanupErrors = [];

  const testResults = {
    packaged_ui: {},
    backend_api: {},
    packaged_electron: {},
    updater: {},
    not_tested: {}
  };

  let testError = null;

  try {
    log('1. Setting up staging test accounts A and B...');
    const { data: uA, error: errA } = await adminClient.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    if (errA || !uA.user) throw new Error(`Failed to create test user A: ${errA?.message}`);
    cleanupTasks.userIds.push(uA.user.id);
    const userAId = uA.user.id;

    const { data: uB, error: errB } = await adminClient.auth.admin.createUser({ email: emailB, password, email_confirm: true });
    if (errB || !uB.user) throw new Error(`Failed to create test user B: ${errB?.message}`);
    cleanupTasks.userIds.push(uB.user.id);
    const userBId = uB.user.id;

    // Authenticated user clients (strictly non-service-role)
    const clientA = createClient(stagingUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: logErrA } = await clientA.auth.signInWithPassword({ email: emailA, password });
    if (logErrA) throw new Error(`Client A sign-in failed: ${logErrA.message}`);

    const clientB = createClient(stagingUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: logErrB } = await clientB.auth.signInWithPassword({ email: emailB, password });
    if (logErrB) throw new Error(`Client B sign-in failed: ${logErrB.message}`);

    // Query auto-created profile for User A
    const { data: profA } = await clientA.from('profiles').select('id').eq('user_id', userAId).single();
    if (!profA) throw new Error('Auto-created profile for user A not found');
    const profileAId = profA.id;

    // Item 3: Local update fixture feed server
    const updaterRequests = [];
    let localUpdateServer = null;
    let updatePort = 0;
    const updateFeedPromise = new Promise((resolve) => {
      localUpdateServer = http.createServer((req, res) => {
        log(`Local update server received request: ${req.url}`);
        updaterRequests.push(req.url);
        const urlPath = req.url.split('?')[0];
        if (urlPath === '/latest.yml') {
          res.writeHead(200, { 'Content-Type': 'text/yaml' });
          res.end(`version: 0.1.34\nfiles:\n  - url: Trade-Log-Setup-0.1.34.exe\n    sha512: dGVzdA==\npath: Trade-Log-Setup-0.1.34.exe\nsha512: dGVzdA==\nreleaseDate: '2026-10-30T00:00:00.000Z'\n`);
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      localUpdateServer.listen(0, '127.0.0.1', () => {
        updatePort = localUpdateServer.address().port;
        log(`Local update mock server listening on port ${updatePort}`);
        resolve();
      });
    });
    await updateFeedPromise;
    cleanupTasks.servers.push(localUpdateServer);

    // Item 3: Configure packaged app's updater to connect to local feed via harness
    if (fs.existsSync(APP_UPDATE_YML_PATH)) {
      cleanupTasks.appUpdateBackup = {
        path: APP_UPDATE_YML_PATH,
        content: fs.readFileSync(APP_UPDATE_YML_PATH, 'utf8')
      };
      fs.writeFileSync(APP_UPDATE_YML_PATH, `provider: generic\nurl: http://127.0.0.1:${updatePort}/\nupdaterCacheDirName: trade-blitz-log-updater\n`);
      log(' - Local update fixture feed wired into packaged resources/app-update.yml');
    }

    // Isolated user-data directory
    const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-log-packaged-test-'));
    cleanupTasks.tempDirs.push(tempUserDataDir);
    log(`2. Isolated user-data dir created: ${tempUserDataDir}`);

    // Launch packaged executable
    log('3. Launching packaged executable with isolated user-data-dir...');
    const cleanEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;

    const app = await electron.launch({
      executablePath: EXECUTABLE_PATH,
      args: [`--user-data-dir=${tempUserDataDir}`],
      env: cleanEnv
    });
    cleanupTasks.apps.push(app);

    const windows = app.windows();
    const widgetPage = windows.find(w => w.url().includes('mode=widget')) || windows[0];
    const mainPage = windows.find(w => !w.url().includes('mode=widget')) || (await app.firstWindow());
    mainPage.on('console', msg => log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`));
    mainPage.on('pageerror', err => log(`[BROWSER ERROR] ${err.message}`));
    await widgetPage.waitForLoadState('domcontentloaded');
    await mainPage.waitForLoadState('domcontentloaded');
    log(' - Packaged application windows initialized successfully');

    // Electron isolation & sandboxing
    const hasElectronApi = await mainPage.evaluate(() => typeof window.electronAPI === 'object' && typeof window.electronAPI.getConfig === 'function');
    if (!hasElectronApi) throw new Error('window.electronAPI not exposed in packaged build');
    const isNodeDisabled = await mainPage.evaluate(() => typeof (globalThis).process?.versions?.node === 'undefined' && typeof (globalThis).require === 'undefined');
    if (!isNodeDisabled) throw new Error('Node integration was unexpectedly leaked in packaged build');
    testResults.packaged_electron['sandboxing_and_isolation'] = 'PASSED';
    log(' - Packaged app context isolation and sandboxing: PASSED');

    // Widget config, pin, hide, shortcuts
    log('4. Testing widget config, pin, hide, and shortcut validation...');
    const config = await mainPage.evaluate(() => window.electronAPI.getConfig());
    if (typeof config.autoHide !== 'boolean') throw new Error('Failed to read config from packaged main');

    await mainPage.evaluate(() => window.electronAPI.saveConfig({ autoHide: false, prefillAsset: 'XAUUSD', shortcutToggle: '', shortcutCapture: '' }));
    const updatedCfg = await mainPage.evaluate(() => window.electronAPI.getConfig());
    if (updatedCfg.autoHide !== false || updatedCfg.prefillAsset !== 'XAUUSD') {
      throw new Error('Config save did not persist');
    }

    await mainPage.evaluate(() => window.electronAPI.toggleAlwaysOnTop(true));
    await mainPage.evaluate(() => window.electronAPI.toggleAlwaysOnTop(false));
    await mainPage.evaluate(() => window.electronAPI.hideWindow());

    let rejectedShortcut = false;
    try {
      await mainPage.evaluate(() => window.electronAPI.saveConfig({ shortcutCapture: 'InvalidNonExistentKey' }));
    } catch {
      rejectedShortcut = true;
    }
    if (!rejectedShortcut) throw new Error('Invalid shortcut configuration was not rejected');
    testResults.packaged_electron['widget_pin_hide_shortcuts'] = 'PASSED';
    log(' - Widget pin, hide, and shortcut validation: PASSED');

    // Item 4: Crop IPC authorization
    log('5. Testing crop IPC sender authorization...');
    let mainRejected = false;
    try {
      await mainPage.evaluate(() => window.electronAPI.getPendingScreenshot());
    } catch (e) {
      if (e.message.includes('Unauthorized IPC sender')) mainRejected = true;
    }
    if (!mainRejected) throw new Error('Main window was not rejected by getPendingScreenshot sender check');

    const pending = await widgetPage.evaluate(() => window.electronAPI.getPendingScreenshot());
    if (pending !== null) throw new Error('Pending screenshot in widget should initially be null');
    await widgetPage.evaluate(() => window.electronAPI.ackScreenshotReceived());

    testResults.packaged_electron['crop_ipc_authorization'] = 'PASSED (Sender authorization validated; physical crop pipeline NOT tested)';
    log(' - Crop IPC sender authorization: PASSED');

    // Item 1: Real UI Login
    log('6. Testing real UI login in packaged executable...');
    await mainPage.evaluate(() => { window.location.hash = '#/login'; });
    await mainPage.waitForSelector('input#email', { timeout: 10000 });
    await mainPage.fill('input#email', emailA);
    await mainPage.fill('input#password', password);
    await mainPage.click('button[type="submit"]', { force: true });

    // Wait for authenticated layout to mount (sidebar "Log Trade" button)
    await mainPage.waitForSelector('button:has-text("Log Trade")', { timeout: 15000 });
    const postLoginUrl = await mainPage.evaluate(() => window.location.hash);
    if (postLoginUrl.includes('/login')) {
      throw new Error(`Failed to leave login page; current hash: ${postLoginUrl}`);
    }

    // Assert that the UI displays the actual test account
    await mainPage.evaluate(() => { window.location.hash = '#/profile'; });
    const emailLocator = mainPage.locator(`text=${emailA}`).first();
    await emailLocator.waitFor({ state: 'visible', timeout: 15000 });
    const isEmailVisible = await emailLocator.isVisible();
    if (!isEmailVisible) {
      throw new Error(`UI did not render the authenticated test account email ${emailA}`);
    }
    testResults.packaged_ui['login_ui'] = 'PASSED';
    log(` - UI Login verified: left login page and rendered ${emailA}: PASSED`);

    // Item 2: Create trade via real UI
    log('7. Testing trade creation through packaged UI...');
    const testAsset = `AUD_${testSuffix}`.toUpperCase();
    await mainPage.evaluate(() => { window.location.hash = '#/trades/new'; });
    await mainPage.waitForSelector('input[placeholder="e.g. XAUUSD"]', { timeout: 10000 });
    await mainPage.fill('input[placeholder="e.g. XAUUSD"]', testAsset);
    await mainPage.click('button:has-text("Long")', { force: true });
    await mainPage.click('button:has-text("Win")', { force: true });
    await mainPage.waitForSelector('input[placeholder="e.g. 2.5"]', { timeout: 10000 });
    await mainPage.fill('input[placeholder="e.g. 2.5"]', '1.5');
    await mainPage.click('button[type="submit"]:has-text("Save Trade")', { force: true });

    // Wait for redirect to trades list
    await mainPage.waitForURL(url => url.hash.includes('/trades') && !url.hash.includes('/new'), { timeout: 15000 });
    await mainPage.waitForSelector(`text=${testAsset}`, { timeout: 15000 });

    // Verify after reload
    await mainPage.reload();
    await mainPage.waitForSelector(`text=${testAsset}`, { timeout: 15000 });

    // Verify in staging database
    const { data: dbCreatedTrades, error: dbCreateErr } = await clientA.from('trades').select('*').eq('asset', testAsset);
    if (dbCreateErr || !dbCreatedTrades || dbCreatedTrades.length !== 1) {
      throw new Error(`Staging DB does not reflect trade created via UI: ${dbCreateErr?.message}`);
    }
    if (Number(dbCreatedTrades[0].earned_r) !== 1.5 || dbCreatedTrades[0].direction !== 'Long') {
      throw new Error(`Trade data mismatch in staging DB: expected 1.5 Long, got ${dbCreatedTrades[0].earned_r} ${dbCreatedTrades[0].direction}`);
    }
    const createdTradeId = dbCreatedTrades[0].id;
    testResults.packaged_ui['create_trade_ui'] = 'PASSED';
    log(` - Create trade via UI (persisted across reload & verified in staging DB): PASSED`);

    // Item 2: Edit trade via real UI
    log('8. Testing trade edit through packaged UI...');
    await mainPage.evaluate((id) => { window.location.hash = `#/trades/${id}/edit`; }, createdTradeId);
    await mainPage.waitForSelector('input[placeholder="e.g. 2.5"]', { timeout: 10000 });
    await mainPage.fill('input[placeholder="e.g. 2.5"]', '2.5');
    await mainPage.click('button[type="submit"]:has-text("Save Changes")', { force: true });

    await mainPage.waitForURL(url => !url.hash.includes('/edit'), { timeout: 15000 });

    // Verify after reload
    await mainPage.reload();
    await mainPage.waitForSelector(`text=${testAsset}`, { timeout: 15000 });

    // Verify in staging database
    const { data: dbUpdatedTrade, error: dbUpdateErr } = await clientA.from('trades').select('*').eq('id', createdTradeId).single();
    if (dbUpdateErr || !dbUpdatedTrade) {
      throw new Error(`Failed to query updated trade from staging DB: ${dbUpdateErr?.message}`);
    }
    if (Number(dbUpdatedTrade.earned_r) !== 2.5) {
      throw new Error(`Trade update mismatch in staging DB: expected 2.5, got ${dbUpdatedTrade.earned_r}`);
    }
    testResults.packaged_ui['edit_trade_ui'] = 'PASSED';
    log(` - Edit trade via UI (persisted across reload & verified in staging DB): PASSED`);

    // Item 2: Import trades via real UI CSV upload
    log('9. Testing trade import through packaged UI...');
    const impAsset = `IMP_${testSuffix}`.toUpperCase();
    const validCsvPath = path.join(tempUserDataDir, `import-valid-${testSuffix}.csv`);
    const validCsvContent = `Date,Asset,Direction,Result,Earned R,Missed R,Duration (min),Recap\n2026-10-30 10:00:00,${impAsset},Long,Win,3.0,0,25,Imported via UI regression\n`;
    fs.writeFileSync(validCsvPath, validCsvContent);

    await mainPage.evaluate(() => { window.location.hash = '#/trades'; });
    await mainPage.waitForSelector('button:has-text("Import CSV")', { timeout: 10000 });
    await mainPage.click('button:has-text("Import CSV")', { force: true });
    await mainPage.waitForSelector('input[type="file"][accept*=".csv"]', { state: 'attached', timeout: 10000 });

    await mainPage.setInputFiles('input[type="file"][accept*=".csv"]', validCsvPath);
    await mainPage.waitForSelector(`text=${impAsset}`, { timeout: 10000 });
    await mainPage.click('button:has-text("นำเข้า")', { force: true });

    // Wait for the imported trade to appear in the trades view
    await mainPage.waitForSelector(`text=${impAsset}`, { timeout: 15000 });

    // Verify after reload
    await mainPage.reload();
    await mainPage.waitForSelector(`text=${impAsset}`, { timeout: 15000 });

    // Verify in staging database
    const { data: dbImpTrades, error: dbImpErr } = await clientA.from('trades').select('*').eq('asset', impAsset);
    if (dbImpErr || !dbImpTrades || dbImpTrades.length !== 1) {
      throw new Error(`Imported trade not found in staging DB: ${dbImpErr?.message}`);
    }
    if (Number(dbImpTrades[0].earned_r) !== 3.0) {
      throw new Error(`Imported trade earned_r mismatch: expected 3.0, got ${dbImpTrades[0].earned_r}`);
    }
    testResults.packaged_ui['import_trade_ui'] = 'PASSED';
    log(` - Import trade via UI (persisted across reload & verified in staging DB): PASSED`);

    // Item 2: Import error rollback confirmation
    log('10. Testing import error rollback via UI & verifying zero partial records...');
    const { data: metricA } = await clientA.from('trade_metrics').insert({
      user_id: userAId, profile_id: profileAId, name: `Metric_${testSuffix}`, min_value: 0, max_value: 100
    }).select('id').single();

    // Navigate to trades so React Query loads & caches Metric with max_value = 100
    await mainPage.evaluate(() => { window.location.hash = '#/dashboard'; });
    await mainPage.evaluate(() => { window.location.hash = '#/trades'; });
    await mainPage.waitForSelector('button:has-text("Import CSV")', { timeout: 10000 });
    await mainPage.click('button:has-text("Import CSV")', { force: true });
    await mainPage.waitForSelector('input[type="file"][accept*=".csv"]', { state: 'attached', timeout: 10000 });

    // Now tighten DB constraint behind the client's back so client parser accepts both rows but RPC transaction fails
    await clientA.from('trade_metrics').update({ max_value: 5 }).eq('id', metricA.id);

    const failPartialAsset = `FAIL_P_${testSuffix}`.toUpperCase();
    const failExceedAsset = `FAIL_E_${testSuffix}`.toUpperCase();
    const invalidCsvPath = path.join(tempUserDataDir, `import-fail-${testSuffix}.csv`);
    const invalidCsvContent = `Date,Asset,Direction,Result,Earned R,Missed R,Metric_${testSuffix}\n2026-10-30 10:00:00,${failPartialAsset},Long,Win,1.0,0,4\n2026-10-30 10:01:00,${failExceedAsset},Long,Win,1.0,0,50\n`;
    fs.writeFileSync(invalidCsvPath, invalidCsvContent);

    await mainPage.setInputFiles('input[type="file"][accept*=".csv"]', invalidCsvPath);
    await mainPage.waitForSelector(`text=${failPartialAsset}`, { timeout: 10000 });
    await mainPage.click('button:has-text("นำเข้า")', { force: true });

    // Confirm UI caught and surfaced the import error
    await mainPage.waitForSelector('text=นำเข้าไม่สำเร็จ', { timeout: 10000 });

    // Assert that NO partial rows remain in staging DB
    const { data: partialRows, error: pErr } = await clientA.from('trades').select('id, asset').in('asset', [failPartialAsset, failExceedAsset]);
    if (pErr) throw new Error(`Failed to check partial rows in staging DB: ${pErr.message}`);
    if (partialRows && partialRows.length > 0) {
      throw new Error(`Import error left ${partialRows.length} partial row(s) in staging DB; atomic rollback failed!`);
    }
    testResults.packaged_ui['import_error_rollback_ui'] = 'PASSED';
    log(' - UI batch import error atomic rollback (zero partial rows remaining): PASSED');

    // Backend API integration tests (separated from packaged UI results)
    log('11. Testing backend API integration (direct RPC rollback & storage permissions)...');
    const { error: directRpcErr } = await clientA.rpc('import_trades_with_relations', {
      p_profile_id: profileAId,
      p_rows: [
        { trade: { asset: `DIR_A_${testSuffix}`, direction: 'Long', entry_date: new Date().toISOString(), result: 'Win', earned_r: 1.0, missed_r: 0 }, metric_values: [] },
        { trade: { asset: `DIR_B_${testSuffix}`, direction: 'Long', entry_date: new Date().toISOString(), result: 'Win', earned_r: 1.0, missed_r: 0 }, metric_values: [{ metric_id: metricA.id, value: 50 }] }
      ]
    });
    if (!directRpcErr || !directRpcErr.message.includes('outside the allowed range')) {
      throw new Error(`Expected direct RPC range error, got: ${directRpcErr?.message}`);
    }
    testResults.backend_api['direct_client_rpc_rollback'] = 'PASSED';

    // Storage fixture upload & signed URL permission verification
    const fixtureBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=', 'base64');
    const fixturePath = `${userAId}/trades/pack-test-${testSuffix}.png`;
    cleanupTasks.storagePaths.push(fixturePath);

    const { error: upErr } = await clientA.storage.from('trade-images').upload(fixturePath, fixtureBuffer, { contentType: 'image/png' });
    if (upErr) throw new Error(`User A fixture upload failed: ${upErr.message}`);

    const { data: ownerSigned, error: ownerSignErr } = await clientA.storage.from('trade-images').createSignedUrl(fixturePath, 60);
    if (ownerSignErr || !ownerSigned?.signedUrl) throw new Error(`Owner createSignedUrl failed: ${ownerSignErr?.message}`);
    const ownerSignedUrl = ownerSigned.signedUrl.startsWith('http') ? ownerSigned.signedUrl : `${stagingUrl}${ownerSigned.signedUrl}`;
    const ownerRes = await fetch(ownerSignedUrl);
    if (ownerRes.status !== 200) throw new Error(`Owner fetch failed with HTTP ${ownerRes.status}`);

    const pubUrl = `${stagingUrl}/storage/v1/object/public/trade-images/${fixturePath}?nocache=${Date.now()}`;
    const pubRes = await fetch(pubUrl);
    if (pubRes.status === 200) throw new Error('Unauthenticated public access returned HTTP 200 on private bucket');

    const { data: bSigned, error: bSignErr } = await clientB.storage.from('trade-images').createSignedUrl(fixturePath, 60);
    if (!bSignErr && bSigned?.signedUrl) {
      const bRes = await fetch(bSigned.signedUrl.startsWith('http') ? bSigned.signedUrl : `${stagingUrl}${bSigned.signedUrl}`);
      if (bRes.status === 200) throw new Error('Cross-user signed URL leak: user B successfully fetched user A image');
    }

    testResults.backend_api['storage_private_bucket_signed_urls'] = 'PASSED';
    testResults.backend_api['storage_cross_user_denial'] = 'PASSED';
    log(' - Backend API integration (direct RPC rollback & storage security): PASSED');

    // Item 3: Auto-updater check against local fixture feed
    log('12. Testing auto-update against local fixture feed...');
    await mainPage.evaluate(() => {
      window.__updateEvents = [];
      window.electronAPI.onUpdateAvailable((info) => window.__updateEvents.push({ type: 'available', info }));
      window.electronAPI.onUpdateNotAvailable(() => window.__updateEvents.push({ type: 'not-available' }));
      window.electronAPI.onUpdateError((err) => window.__updateEvents.push({ type: 'error', error: err }));
    });

    await mainPage.evaluate(() => window.electronAPI.checkForUpdate());

    let receivedUpdateEvents = [];
    const updStart = Date.now();
    while (Date.now() - updStart < 8000) {
      receivedUpdateEvents = await mainPage.evaluate(() => window.__updateEvents);
      if (receivedUpdateEvents.length > 0) break;
      await new Promise(r => setTimeout(r, 200));
    }

    if (updaterRequests.length === 0) {
      throw new Error('Local update server received zero requests; updater was not connected to local feed');
    }
    if (receivedUpdateEvents.length === 0) {
      throw new Error('Zero update events received from autoUpdater within timeout');
    }
    const updateEvent = receivedUpdateEvents[0];
    if (updateEvent.type === 'error') {
      throw new Error(`Unexpected update error: ${JSON.stringify(updateEvent.error)}`);
    }
    if (updateEvent.type !== 'available' || updateEvent.info?.version !== '0.1.34') {
      throw new Error(`Expected update-available event with version 0.1.34, got: ${JSON.stringify(updateEvent)}`);
    }

    testResults.updater['check_update_local_feed'] = 'PASSED';
    testResults.updater['download_and_install'] = 'NOT TESTED (Requires interactive OS installation and application restart)';
    log(' - Auto-updater check against local fixture feed: PASSED');

    // Item 4 & Unperformed items explicitly categorized
    testResults.not_tested = {
      screen_capture_desktop: 'NOT TESTED (Operator checklist: press Ctrl+Shift+X hotkey to invoke desktopCapturer fullscreen overlay)',
      crop_interactive_drag: 'NOT TESTED (Operator checklist: mouse click and drag rectangle overlay on crop.html canvas)',
      crop_save_and_paste: 'NOT TESTED (Operator checklist: click crop confirm or double-click to deliver screenshot to widget form)',
      crop_cancel: 'NOT TESTED (Operator checklist: press Escape or click cancel to abort overlay and restore widget)',
      updater_download_and_install: 'NOT TESTED (Operator checklist: download and execute installer binary with relaunch)',
      setup_installer_installation: 'NOT TESTED (Operator checklist: execute Trade-Log-Setup-*.exe on clean Windows machine and verify desktop/start-menu shortcuts)'
    };

    log('========================================================================');
    log('ALL AUTOMATED PACKAGED TESTS COMPLETED SUCCESSFULLY!');
    log('========================================================================');
  } catch (err) {
    testError = err;
    log(`[ERROR IN TEST RUN] ${err.message}`);
  } finally {
    log('Starting cleanup phase...');

    // Restore app-update.yml
    if (cleanupTasks.appUpdateBackup) {
      try {
        fs.writeFileSync(cleanupTasks.appUpdateBackup.path, cleanupTasks.appUpdateBackup.content);
        log('Restored original app-update.yml');
      } catch (e) {
        const msg = `Failed to restore app-update.yml: ${e.message}`;
        log(msg);
        cleanupErrors.push(msg);
      }
    }

    // Close Electron apps
    for (const appInstance of cleanupTasks.apps) {
      try {
        await appInstance.evaluate(({ app }) => app.exit(0)).catch(() => {});
        await appInstance.close().catch(() => {});
        log('Closed Electron app instance');
      } catch (e) {
        log(`Warning closing app: ${e.message}`);
      }
    }

    // Close mock HTTP servers
    for (const srv of cleanupTasks.servers) {
      try {
        srv.close();
        log('Closed local update mock server');
      } catch (e) {
        log(`Warning closing server: ${e.message}`);
      }
    }

    // Clean up temporary directories
    for (const dir of cleanupTasks.tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        log(`Cleaned up temp dir: ${dir}`);
      } catch (e) {
        log(`Warning cleaning temp dir ${dir}: ${e.message}`);
      }
    }

    // Item 5: Delete Storage fixtures BEFORE deleting user accounts
    if (cleanupTasks.storagePaths.length > 0) {
      try {
        log(`Deleting ${cleanupTasks.storagePaths.length} storage fixture(s)...`);
        const { error: sDelErr } = await adminClient.storage.from('trade-images').remove(cleanupTasks.storagePaths);
        if (sDelErr) {
          const msg = `Storage cleanup failed: ${sDelErr.message}`;
          log(msg);
          cleanupErrors.push(msg);
        } else {
          log('Storage fixtures successfully deleted');
        }
      } catch (e) {
        const msg = `Exception deleting storage fixtures: ${e.message}`;
        log(msg);
        cleanupErrors.push(msg);
      }
    }

    // Delete test users
    for (const uid of cleanupTasks.userIds) {
      try {
        const { error: dErr } = await adminClient.auth.admin.deleteUser(uid);
        if (dErr) {
          const msg = `Failed to delete test user ${uid}: ${dErr.message}`;
          log(msg);
          cleanupErrors.push(msg);
        } else {
          log(`Cleaned up test user ${uid}`);
        }
      } catch (e) {
        const msg = `Exception deleting test user ${uid}: ${e.message}`;
        log(msg);
        cleanupErrors.push(msg);
      }
    }
  }

  console.log('PACKAGED_TEST_REPORT:', JSON.stringify(testResults, null, 2));

  // Item 5: Cleanup failure must report and exit nonzero
  if (cleanupErrors.length > 0) {
    log(`[FATAL] Cleanup failures occurred:\n - ${cleanupErrors.join('\n - ')}`);
    process.exit(1);
  }

  if (testError) {
    log(`[FATAL] Test failed: ${testError.message}`);
    throw testError;
  }

  return testResults;
}

runPackagedTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('[FATAL PACKAGED TEST ERROR]', err);
  process.exit(1);
});
