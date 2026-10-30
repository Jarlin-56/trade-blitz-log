import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_PROD_REF = 'nkuwxxrntnkqoayfbrvv';

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function runProductionSmoke() {
  log('Starting Production Database Rollout Smoke Test (A9 Step 5)...');

  // 1. Retrieve keys dynamically from CLI for verified production ref only
  log(`Verifying target is production: ${ALLOWED_PROD_REF}`);
  const keysOutput = execFileSync('npx', [
    'supabase', 'projects', 'api-keys',
    '--project-ref', ALLOWED_PROD_REF,
    '--output', 'json'
  ], { encoding: 'utf8', shell: true });

  const parsed = JSON.parse(keysOutput);
  const keys = Array.isArray(parsed) ? parsed : (parsed.keys || []);
  const serviceRoleKey = keys.find(k => k.id === 'service_role')?.api_key;
  const anonKey = keys.find(k => k.id === 'anon')?.api_key;

  if (!serviceRoleKey || !anonKey) {
    throw new Error('Failed to retrieve production API keys from CLI');
  }

  const supabaseUrl = `https://${ALLOWED_PROD_REF}.supabase.co`;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const emailA = `smoke_prod_a_${testSuffix}@internal.test`;
  const emailB = `smoke_prod_b_${testSuffix}@internal.test`;
  const password = `SmokePass_${testSuffix}_123!#`;

  let userAId = null;
  let userBId = null;
  let clientA = null;
  let clientB = null;

  const smokeResults = {};

  let initialTradesCount = null;
  let initialProfilesCount = null;

  try {
    // Check initial row counts of restored user data
    const { count: initTrades, error: initErr1 } = await adminClient.from('trades').select('*', { count: 'exact', head: true });
    if (initErr1) throw new Error(`Failed to query initial trades count: ${initErr1.message}`);
    initialTradesCount = initTrades;

    const { count: initProfiles, error: initErr2 } = await adminClient.from('profiles').select('*', { count: 'exact', head: true });
    if (initErr2) throw new Error(`Failed to query initial profiles count: ${initErr2.message}`);
    initialProfilesCount = initProfiles;

    log(`Initial production counts: trades=${initialTradesCount}, profiles=${initialProfilesCount}`);

    // Create test accounts via admin API (auto-confirm: true, no emails sent)
    log('Creating test user A and user B without sending emails...');
    const { data: userAData, error: errA } = await adminClient.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true
    });
    if (errA || !userAData.user) throw new Error(`User A creation failed: ${errA?.message}`);
    userAId = userAData.user.id;

    const { data: userBData, error: errB } = await adminClient.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true
    });
    if (errB || !userBData.user) throw new Error(`User B creation failed: ${errB?.message}`);
    userBId = userBData.user.id;

    // Login client sessions
    clientA = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error: loginErrA } = await clientA.auth.signInWithPassword({ email: emailA, password });
    if (loginErrA) throw new Error(`Login A failed: ${loginErrA.message}`);

    clientB = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error: loginErrB } = await clientB.auth.signInWithPassword({ email: emailB, password });
    if (loginErrB) throw new Error(`Login B failed: ${loginErrB.message}`);

    // Profiles auto-created by on_auth_user_created trigger
    const { data: profA, error: profErrA } = await clientA.from('profiles').select('id').eq('user_id', userAId).single();
    if (profErrA || !profA) throw new Error(`Auto-created profile A query failed: ${profErrA?.message}`);
    const { data: profB, error: profErrB } = await clientB.from('profiles').select('id').eq('user_id', userBId).single();
    if (profErrB || !profB) throw new Error(`Auto-created profile B query failed: ${profErrB?.message}`);
    const profileA = profA.id;
    const profileB = profB.id;

    // Setup User A fixtures
    const { data: condA, error: condErrA } = await clientA.from('conditions').insert({ user_id: userAId, name: `CondA_${testSuffix}` }).select('id').single();
    if (condErrA || !condA) throw new Error(`Condition A insert failed: ${condErrA?.message}`);
    const { data: tagA, error: tagErrA } = await clientA.from('tags').insert({ user_id: userAId, name: `TagA_${testSuffix}` }).select('id').single();
    if (tagErrA || !tagA) throw new Error(`Tag A insert failed: ${tagErrA?.message}`);
    const { data: metricA, error: metricErrA } = await clientA.from('trade_metrics').insert({ user_id: userAId, profile_id: profileA, name: `MetricA_${testSuffix}`, min_value: 0, max_value: 10 }).select('id').single();
    if (metricErrA || !metricA) throw new Error(`Metric A insert failed: ${metricErrA?.message}`);

    // 1. Smoke: Create & Edit trade via atomic RPC
    log('1. Smoke testing create_trade_with_relations and update_trade_with_relations...');
    const tradePayload = {
      asset: 'BTCUSDT',
      direction: 'Long',
      entry_date: new Date().toISOString(),
      result: 'Win',
      earned_r: 2.0,
      missed_r: 0
    };
    const { data: tradeId, error: createErr } = await clientA.rpc('create_trade_with_relations', {
      p_profile_id: profileA,
      p_trade: tradePayload,
      p_condition_ids: [condA.id],
      p_tag_ids: [tagA.id],
      p_metric_values: [{ metric_id: metricA.id, value: 5 }]
    });
    if (createErr || !tradeId) throw new Error(`create_trade_with_relations failed: ${createErr?.message}`);

    const { error: updateErr } = await clientA.rpc('update_trade_with_relations', {
      p_trade_id: tradeId,
      p_profile_id: profileA,
      p_trade: { ...tradePayload, earned_r: 3.0 },
      p_condition_ids: [],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (updateErr) throw new Error(`update_trade_with_relations failed: ${updateErr.message}`);
    smokeResults['create_edit_rpc'] = 'PASSED';
    log(' - create and edit atomic RPCs PASSED');

    // 2. Smoke: Batch import & rollback on invalid row
    log('2. Smoke testing import_trades_with_relations and rollback on error...');
    const importBatch = [
      { trade: { ...tradePayload, asset: 'ADAUSDT' }, metric_values: [] },
      { trade: { ...tradePayload, asset: 'XRPUSDT' }, metric_values: [{ metric_id: metricA.id, value: 999 }] } // Invalid metric > max
    ];
    const { error: impErr } = await clientA.rpc('import_trades_with_relations', {
      p_profile_id: profileA,
      p_rows: importBatch
    });
    if (!impErr || !impErr.message.includes('outside the allowed range')) {
      throw new Error(`import rollback failed: error was expected but got ${impErr?.message}`);
    }
    // Verify 0 trades inserted from failed batch
    const { data: checkTrades, error: checkTradesErr } = await clientA.from('trades').select('id').in('asset', ['ADAUSDT', 'XRPUSDT']);
    if (checkTradesErr) throw new Error(`Query checkTrades failed: ${checkTradesErr.message}`);
    if (checkTrades && checkTrades.length > 0) throw new Error('Transaction rollback failed: rows persisted after error');
    smokeResults['import_rollback'] = 'PASSED';
    log(' - batch import rollback PASSED');

    // 3. Smoke: Cross-user and anonymous RPC isolation
    log('3. Smoke testing cross-user and anonymous rejection...');
    const { error: crossErr } = await clientB.rpc('create_trade_with_relations', {
      p_profile_id: profileA,
      p_trade: tradePayload,
      p_condition_ids: [],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (!crossErr || !crossErr.message.includes('Profile not found')) {
      throw new Error(`Cross-user profile check failed: got ${crossErr?.message}`);
    }

    const { error: anonErr } = await anonClient.rpc('create_trade_with_relations', {
      p_profile_id: profileA,
      p_trade: tradePayload,
      p_condition_ids: [],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (!anonErr) throw new Error('Anonymous RPC call was not rejected');
    smokeResults['security_isolation'] = 'PASSED';
    log(' - security isolation PASSED');

    // 4. Smoke: Legacy direct table writes & restrictive policy
    log('4. Smoke testing legacy direct table writes and restrictive policies...');
    const { data: legTrade, error: legErr } = await clientA.from('trades').insert({
      user_id: userAId,
      profile_id: profileA,
      asset: 'LEGACY_DIRECT',
      direction: 'Long',
      result: 'Win',
      entry_date: new Date().toISOString(),
      earned_r: 1.0,
      missed_r: 0
    }).select('id').single();
    if (legErr || !legTrade) throw new Error(`Legacy direct write failed: ${legErr?.message}`);

    const { error: spoofProfErr } = await clientB.from('trades').insert({
      user_id: userBId,
      profile_id: profileA, // User A's profile
      asset: 'SPOOF',
      direction: 'Long',
      result: 'Win',
      entry_date: new Date().toISOString(),
      earned_r: 1.0,
      missed_r: 0
    });
    if (!spoofProfErr || !spoofProfErr.message.includes('row-level security')) {
      throw new Error(`Restrictive policy failed: unowned profile insert not blocked (${spoofProfErr?.message})`);
    }
    smokeResults['legacy_direct_writes'] = 'PASSED';
    log(' - legacy direct writes and restrictive RLS PASSED');

    // 5. Smoke: Signed URL on test fixture image & direct public URL rejection (no real user image paths)
    log('5. Smoke testing storage private bucket and signed URL generation with test fixture...');
    const fixtureBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=', 'base64');
    const fixtureFileName = `smoke-fixture-${testSuffix}.png`;
    const fixtureStoragePath = `${userAId}/trades/${fixtureFileName}`;

    const { error: uploadErr } = await clientA.storage.from('trade-images').upload(fixtureStoragePath, fixtureBuffer, {
      contentType: 'image/png',
      upsert: true
    });
    if (uploadErr) throw new Error(`Fixture image upload failed: ${uploadErr.message}`);

    // Direct public URL with cache-buster
    const pubUrl = `${supabaseUrl}/storage/v1/object/public/trade-images/${fixtureStoragePath}?nocache=${Date.now()}`;
    const pubRes = await fetch(pubUrl);
    if (pubRes.status === 200) {
      throw new Error(`Storage private bucket leak: public URL returned 200 at ${pubUrl}`);
    }
    log(` - Public URL access rejected with HTTP ${pubRes.status}`);

    // Signed URL generated by owner client
    const { data: signedData, error: signErr } = await clientA
      .storage
      .from('trade-images')
      .createSignedUrl(fixtureStoragePath, 60);
    if (signErr || !signedData?.signedUrl) {
      throw new Error(`Signed URL creation failed: ${signErr?.message}`);
    }

    const signedUrlToFetch = signedData.signedUrl.startsWith('http')
      ? signedData.signedUrl
      : `${supabaseUrl}${signedData.signedUrl}`;

    const signRes = await fetch(signedUrlToFetch);
    if (signRes.status !== 200) {
      throw new Error(`Signed URL fetch failed with HTTP ${signRes.status}`);
    }
    const bytes = (await signRes.arrayBuffer()).byteLength;
    if (bytes !== fixtureBuffer.byteLength) {
      throw new Error(`Downloaded image size mismatch: expected ${fixtureBuffer.byteLength} bytes, got ${bytes}`);
    }
    smokeResults['signed_url_storage'] = 'PASSED';
    log(` - Signed URL verified (HTTP 200, ${bytes} bytes downloaded)`);

    log('========================================================================');
    log('ALL PRODUCTION SMOKE TESTS PASSED SUCCESSFULLY!');
    log('========================================================================');
  } finally {
    // Cleanup test fixtures
    log('Cleaning up production test accounts and storage fixtures...');
    const cleanupErrors = [];

    // Storage fixture cleanup
    if (userAId) {
      const fixtureStoragePath = `${userAId}/trades/smoke-fixture-${testSuffix}.png`;
      const { error: rmErr } = await adminClient.storage.from('trade-images').remove([fixtureStoragePath]);
      if (rmErr) {
        cleanupErrors.push(`Failed to remove fixture image: ${rmErr.message}`);
      }
    }

    if (userAId) {
      const { error: delA } = await adminClient.auth.admin.deleteUser(userAId);
      if (delA) cleanupErrors.push(`Failed deleting test user A (${userAId}): ${delA.message}`);
      else log('Cleaned up test user A');
    }
    if (userBId) {
      const { error: delB } = await adminClient.auth.admin.deleteUser(userBId);
      if (delB) cleanupErrors.push(`Failed deleting test user B (${userBId}): ${delB.message}`);
      else log('Cleaned up test user B');
    }

    // Confirm restored user data intact
    const { count: finalTradesCount, error: countErr1 } = await adminClient.from('trades').select('*', { count: 'exact', head: true });
    if (countErr1) cleanupErrors.push(`Failed to query final trades count: ${countErr1.message}`);

    const { count: finalProfilesCount, error: countErr2 } = await adminClient.from('profiles').select('*', { count: 'exact', head: true });
    if (countErr2) cleanupErrors.push(`Failed to query final profiles count: ${countErr2.message}`);

    if (finalTradesCount !== initialTradesCount) {
      cleanupErrors.push(`Trades count mismatch: expected initial=${initialTradesCount}, got final=${finalTradesCount}`);
    }
    if (finalProfilesCount !== initialProfilesCount) {
      cleanupErrors.push(`Profiles count mismatch: expected initial=${initialProfilesCount}, got final=${finalProfilesCount}`);
    }

    log(`Final production counts: trades=${finalTradesCount}, profiles=${finalProfilesCount}`);

    if (cleanupErrors.length > 0) {
      throw new Error(`Production smoke cleanup/integrity failures:\n - ${cleanupErrors.join('\n - ')}`);
    }
  }

  return smokeResults;
}

runProductionSmoke().then(results => {
  console.log('Smoke test summary:', JSON.stringify(results, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('[FATAL PRODUCTION SMOKE ERROR]', err.message);
  process.exit(1);
});
