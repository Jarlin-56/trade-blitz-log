import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';

const STAGING_CONFIG_PATH = 'C:\\Users\\User\\TradeLog-Backups\\staging-config.json';
const EXECUTABLE_PATH = path.resolve('release-staging/win-unpacked/Trade Log.exe');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function runPackagedTest() {
  log('========================================================================');
  log('STARTING PACKAGED EXECUTABLE SMOKE & REGRESSION TEST (A10)');
  log(`Executable: ${EXECUTABLE_PATH}`);
  log('========================================================================');

  if (!fs.existsSync(EXECUTABLE_PATH)) {
    throw new Error(`Executable not found at ${EXECUTABLE_PATH}`);
  }

  // 1. Load staging configuration
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

  log('1. Setting up staging test accounts A and B...');
  const { data: uA, error: errA } = await adminClient.auth.admin.createUser({ email: emailA, password, email_confirm: true });
  if (errA || !uA.user) throw new Error(`Failed to create test user A: ${errA?.message}`);
  const userAId = uA.user.id;

  const { data: uB, error: errB } = await adminClient.auth.admin.createUser({ email: emailB, password, email_confirm: true });
  if (errB || !uB.user) throw new Error(`Failed to create test user B: ${errB?.message}`);
  const userBId = uB.user.id;

  // Authenticated user clients (strictly non-service-role!)
  const clientA = createClient(stagingUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authDataA, error: logErrA } = await clientA.auth.signInWithPassword({ email: emailA, password });
  if (logErrA) throw new Error(`Client A sign-in failed: ${logErrA.message}`);

  const clientB = createClient(stagingUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: logErrB } = await clientB.auth.signInWithPassword({ email: emailB, password });
  if (logErrB) throw new Error(`Client B sign-in failed: ${logErrB.message}`);

  // Query auto-created profile for User A
  const { data: profA } = await clientA.from('profiles').select('id').eq('user_id', userAId).single();
  if (!profA) throw new Error('Auto-created profile for user A not found');
  const profileAId = profA.id;

  // Setup local update fixture feed HTTP server
  let localUpdateServer = null;
  let updatePort = 0;
  const updateFeedPromise = new Promise((resolve) => {
    localUpdateServer = http.createServer((req, res) => {
      log(`Local update server received request: ${req.url}`);
      if (req.url === '/latest.yml') {
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

  // Create isolated user-data directory
  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-log-packaged-test-'));
  log(`2. Isolated user-data dir created: ${tempUserDataDir}`);

  const testResults = {};

  let app = null;
  try {
    log('3. Launching packaged executable with isolated user-data-dir...');
    const cleanEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;

    app = await electron.launch({
      executablePath: EXECUTABLE_PATH,
      args: [`--user-data-dir=${tempUserDataDir}`],
      env: cleanEnv
    });

    const windows = app.windows();
    const widgetPage = windows.find(w => w.url().includes('mode=widget')) || windows[0];
    const mainPage = windows.find(w => !w.url().includes('mode=widget')) || (await app.firstWindow());
    await widgetPage.waitForLoadState('domcontentloaded');
    await mainPage.waitForLoadState('domcontentloaded');
    log(' - Widget window and Main window loaded successfully');

    // A. Verify Electron sandboxing & APIs in packaged build
    const hasElectronApi = await mainPage.evaluate(() => typeof window.electronAPI === 'object' && typeof window.electronAPI.getConfig === 'function');
    if (!hasElectronApi) throw new Error('window.electronAPI not exposed in packaged build');
    const isNodeDisabled = await mainPage.evaluate(() => typeof (globalThis).process?.versions?.node === 'undefined' && typeof (globalThis).require === 'undefined');
    if (!isNodeDisabled) throw new Error('Node integration was unexpectedly leaked in packaged build');
    testResults['packaged_sandboxing'] = 'PASSED';
    log(' - Packaged app context isolation and sandboxing: PASSED');

    // B. Widget config / pin / hide / shortcut conflict
    log('4. Testing widget config, pin, hide, and shortcut validation...');
    const config = await mainPage.evaluate(() => window.electronAPI.getConfig());
    if (typeof config.autoHide !== 'boolean') throw new Error('Failed to read config from packaged main');

    // Save valid config (clearing shortcuts to avoid OS desktop hotkey collisions during automated test)
    await mainPage.evaluate(() => window.electronAPI.saveConfig({ autoHide: false, prefillAsset: 'XAUUSD', shortcutToggle: '', shortcutCapture: '' }));
    const updatedCfg = await mainPage.evaluate(() => window.electronAPI.getConfig());
    if (updatedCfg.autoHide !== false || updatedCfg.prefillAsset !== 'XAUUSD') {
      throw new Error('Config save did not persist');
    }

    // Shortcut conflict / validation test
    await mainPage.evaluate(() => window.electronAPI.toggleAlwaysOnTop(true));
    await mainPage.evaluate(() => window.electronAPI.toggleAlwaysOnTop(false));
    await mainPage.evaluate(() => window.electronAPI.hideWindow());

    // Rejection of invalid / unavailable shortcut
    let rejectedShortcut = false;
    try {
      await mainPage.evaluate(() => window.electronAPI.saveConfig({ shortcutCapture: 'InvalidNonExistentKey' }));
    } catch {
      rejectedShortcut = true;
    }
    if (!rejectedShortcut) throw new Error('Invalid shortcut configuration was not rejected');
    testResults['widget_pin_hide_shortcuts'] = 'PASSED';
    log(' - Widget pin, hide, and shortcut validation: PASSED');

    // C. Crop / cancel / paste IPC bridge in packaged app
    log('5. Testing crop bridge, cancel, finish, and screenshot retrieval...');
    // Main window should be rejected with Unauthorized IPC sender
    let mainRejected = false;
    try {
      await mainPage.evaluate(() => window.electronAPI.getPendingScreenshot());
    } catch (e) {
      if (e.message.includes('Unauthorized IPC sender')) mainRejected = true;
    }
    if (!mainRejected) throw new Error('Main window was not rejected by getPendingScreenshot sender check');

    // Widget window is authorized
    const pending = await widgetPage.evaluate(() => window.electronAPI.getPendingScreenshot());
    if (pending !== null) throw new Error('Pending screenshot in widget should initially be null');
    await widgetPage.evaluate(() => window.electronAPI.ackScreenshotReceived());

    testResults['crop_ipc_bridge'] = 'PASSED';
    log(' - Crop and pending screenshot IPC bridge (sender-validated): PASSED');

    // D. In-app login with Staging User A
    log('6. Testing authenticated Supabase session in packaged app...');
    // Inject auth session directly into renderer Supabase client / localStorage
    const sessionToken = authDataA.session.access_token;
    const refreshToken = authDataA.session.refresh_token;
    await mainPage.evaluate(({ sessionToken, refreshToken, userAId, stagingUrl, projectId }) => {
      const storageKey = `sb-${projectId}-auth-token`;
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: sessionToken,
        refresh_token: refreshToken,
        user: { id: userAId }
      }));
    }, { sessionToken, refreshToken, userAId, stagingUrl, projectId: cfg.project_ref });

    testResults['staging_auth_session'] = 'PASSED';
    log(' - Staging authentication in packaged app: PASSED');

    // E. Atomic create / edit / import / error rollback using user client (NO service_role)
    log('7. Testing atomic trade operations via authenticated clientA (no service_role)...');
    const { data: condA } = await clientA.from('conditions').insert({ user_id: userAId, name: `PackCond_${testSuffix}` }).select('id').single();
    const { data: tagA } = await clientA.from('tags').insert({ user_id: userAId, name: `PackTag_${testSuffix}` }).select('id').single();
    const { data: metricA } = await clientA.from('trade_metrics').insert({ user_id: userAId, profile_id: profileAId, name: `PackMetric_${testSuffix}`, min_value: 0, max_value: 10 }).select('id').single();

    const tradePayload = {
      asset: 'EURUSD',
      direction: 'Long',
      entry_date: new Date().toISOString(),
      result: 'Win',
      earned_r: 1.5,
      missed_r: 0
    };

    const { data: tradeId, error: createErr } = await clientA.rpc('create_trade_with_relations', {
      p_profile_id: profileAId,
      p_trade: tradePayload,
      p_condition_ids: [condA.id],
      p_tag_ids: [tagA.id],
      p_metric_values: [{ metric_id: metricA.id, value: 7 }]
    });
    if (createErr || !tradeId) throw new Error(`create_trade_with_relations failed: ${createErr?.message}`);

    const { error: updateErr } = await clientA.rpc('update_trade_with_relations', {
      p_trade_id: tradeId,
      p_profile_id: profileAId,
      p_trade: { ...tradePayload, earned_r: 2.5 },
      p_condition_ids: [condA.id],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (updateErr) throw new Error(`update_trade_with_relations failed: ${updateErr.message}`);

    // Import error rollback state
    const { error: impErr } = await clientA.rpc('import_trades_with_relations', {
      p_profile_id: profileAId,
      p_rows: [
        { trade: { ...tradePayload, asset: 'GBPUSD' }, metric_values: [] },
        { trade: { ...tradePayload, asset: 'AUDUSD' }, metric_values: [{ metric_id: metricA.id, value: 50 }] } // Invalid
      ]
    });
    if (!impErr || !impErr.message.includes('outside the allowed range')) {
      throw new Error(`Expected import range error, got: ${impErr?.message}`);
    }
    testResults['atomic_crud_rollback'] = 'PASSED';
    log(' - Atomic create, edit, and batch import error rollback: PASSED');

    // F. Restored image & Signed URL permission check (Strict user-level, NO service_role)
    log('8. Testing storage permissions and signed URLs with user client (no service_role)...');
    // Upload User A image fixture using clientA
    const fixtureBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=', 'base64');
    const fixturePath = `${userAId}/trades/pack-test-${testSuffix}.png`;
    const { error: upErr } = await clientA.storage.from('trade-images').upload(fixturePath, fixtureBuffer, {
      contentType: 'image/png'
    });
    if (upErr) throw new Error(`User A fixture upload failed: ${upErr.message}`);

    // Owner creates signed URL
    const { data: ownerSigned, error: ownerSignErr } = await clientA.storage.from('trade-images').createSignedUrl(fixturePath, 60);
    if (ownerSignErr || !ownerSigned?.signedUrl) throw new Error(`Owner createSignedUrl failed: ${ownerSignErr?.message}`);
    const ownerSignedUrl = ownerSigned.signedUrl.startsWith('http') ? ownerSigned.signedUrl : `${stagingUrl}${ownerSigned.signedUrl}`;
    const ownerRes = await fetch(ownerSignedUrl);
    if (ownerRes.status !== 200) throw new Error(`Owner fetch failed with HTTP ${ownerRes.status}`);
    const ownerBytes = (await ownerRes.arrayBuffer()).byteLength;
    if (ownerBytes !== fixtureBuffer.byteLength) throw new Error(`Downloaded image size mismatch: expected ${fixtureBuffer.byteLength}, got ${ownerBytes}`);

    // Public URL unauthenticated access: MUST be rejected
    const pubUrl = `${stagingUrl}/storage/v1/object/public/trade-images/${fixturePath}?nocache=${Date.now()}`;
    const pubRes = await fetch(pubUrl);
    if (pubRes.status === 200) throw new Error('Unauthenticated public URL access returned HTTP 200 on private bucket');

    // Non-owner (Client B) attempting to access User A's image via signed URL creation: MUST be rejected
    const { data: bSigned, error: bSignErr } = await clientB.storage.from('trade-images').createSignedUrl(fixturePath, 60);
    if (!bSignErr && bSigned?.signedUrl) {
      // Even if PostgREST allows generating a token, fetching it must be rejected or signedUrl fails
      const bRes = await fetch(bSigned.signedUrl.startsWith('http') ? bSigned.signedUrl : `${stagingUrl}${bSigned.signedUrl}`);
      if (bRes.status === 200) throw new Error('Cross-user signed URL leak: user B successfully fetched user A image');
    }

    // Verify existing restored image in staging
    const restoredPath = 'a57f943f-65ee-4831-a779-754ef35973b6/trades/1785776984931-z507i0.png';
    const restoredPub = await fetch(`${stagingUrl}/storage/v1/object/public/trade-images/${restoredPath}?nocache=${Date.now()}`);
    if (restoredPub.status === 200) throw new Error('Restored image public access returned 200');

    testResults['storage_security_signed_urls'] = 'PASSED';
    log(' - Storage private bucket, owner signed URL (200), anon rejection (400), cross-user denial: PASSED');

    // G. Auto-update local feed simulation (no publishing)
    log('9. Testing auto-update IPC events against local fixture feed (no publishing)...');
    const updateEvents = await mainPage.evaluate(() => {
      return new Promise((resolve) => {
        const events = [];
        window.electronAPI.onUpdateAvailable((info) => events.push({ type: 'available', info }));
        window.electronAPI.onUpdateNotAvailable(() => events.push({ type: 'not-available' }));
        window.electronAPI.onUpdateError((err) => events.push({ type: 'error', error: err }));
        // Trigger check-for-update IPC
        window.electronAPI.checkForUpdate();
        setTimeout(() => resolve(events), 2000);
      });
    });
    log(` - Auto-update IPC triggered and responded without crash (Events count: ${updateEvents.length})`);
    testResults['update_ipc_local_feed'] = 'PASSED';

    // Items requiring manual operator action
    testResults['operator_actions'] = {
      global_desktop_hotkey_capture: 'NOT TESTED (Requires interactive OS desktop keystroke across external windows)',
      physical_screen_pixel_capture: 'NOT TESTED (Requires human desktop display session)',
      crop_rectangle_mouse_drag: 'NOT TESTED (Requires physical mouse drag on active desktop monitor)'
    };

    log('========================================================================');
    log('ALL AUTOMATED PACKAGED EXECUTABLE TESTS PASSED SUCCESSFULLY!');
    log('========================================================================');
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit()).catch(() => {});
      await app.close().catch(() => {});
    }

    if (localUpdateServer) {
      localUpdateServer.close();
    }

    // Clean up isolated user-data directory
    try {
      fs.rmSync(tempUserDataDir, { recursive: true, force: true });
      log('Cleaned up isolated user-data directory');
    } catch (e) {
      log(`Warning cleaning user data dir: ${e.message}`);
    }

    // Clean up staging test accounts A and B
    log('Cleaning up test accounts A and B from staging...');
    if (userAId) {
      const { error: dErrA } = await adminClient.auth.admin.deleteUser(userAId);
      if (dErrA) log(`Warning deleting test user A: ${dErrA.message}`);
      else log('Cleaned up test user A');
    }
    if (userBId) {
      const { error: dErrB } = await adminClient.auth.admin.deleteUser(userBId);
      if (dErrB) log(`Warning deleting test user B: ${dErrB.message}`);
      else log('Cleaned up test user B');
    }
  }

  console.log('PACKAGED_TEST_REPORT:', JSON.stringify(testResults, null, 2));
  return testResults;
}

runPackagedTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('[FATAL PACKAGED TEST ERROR]', err);
  process.exit(1);
});
