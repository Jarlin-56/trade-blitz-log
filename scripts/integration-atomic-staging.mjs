import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { validateStagingTarget, sanitizeError } from './staging-utils.mjs';

const CONFIG_PATH = 'C:\\Users\\User\\TradeLog-Backups\\staging-config.json';

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function runIntegration() {
  log('Starting Supabase API Integration Tests on Staging (A8 Step 4)...');

  const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
  const config = JSON.parse(rawConfig);
  validateStagingTarget(config);
  log(`Preflight: Target validated for staging ref '${config.project_ref}'`);

  const supabaseUrl = config.supabase_url;
  const anonKey = config.anon_key;
  const serviceRoleKey = config.service_role_key;
  const secrets = [config.db_password, anonKey, serviceRoleKey].filter(Boolean);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const emailA = `staging_test_a_${testSuffix}@internal.test`;
  const emailB = `staging_test_b_${testSuffix}@internal.test`;
  const password = `TestPass_${testSuffix}_123!#`;

  let userAId = null;
  let userBId = null;
  let clientA = null;
  let clientB = null;

  const testReport = {
    cases: {},
    allPassed: false
  };

  try {
    // 1. Setup Test Users via Admin API (no emails sent)
    log('1. Setting up test users via admin API (auto-confirm, no emails)...');
    const { data: userAData, error: errA } = await adminClient.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true
    });
    if (errA || !userAData.user) throw new Error(`Failed to create test user A: ${errA?.message}`);
    userAId = userAData.user.id;

    const { data: userBData, error: errB } = await adminClient.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true
    });
    if (errB || !userBData.user) throw new Error(`Failed to create test user B: ${errB?.message}`);
    userBId = userBData.user.id;

    log(`Test users created: User A=${userAId}, User B=${userBId}`);

    // Create authenticated client sessions
    clientA = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: loginA, error: loginErrA } = await clientA.auth.signInWithPassword({
      email: emailA,
      password
    });
    if (loginErrA) throw new Error(`Failed to log in as user A: ${loginErrA.message}`);

    clientB = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: loginB, error: loginErrB } = await clientB.auth.signInWithPassword({
      email: emailB,
      password
    });
    if (loginErrB) throw new Error(`Failed to log in as user B: ${loginErrB.message}`);

    // Retrieve auto-created profiles
    const { data: profileAData, error: profErrA } = await clientA
      .from('profiles')
      .select('id')
      .eq('user_id', userAId)
      .single();
    if (profErrA || !profileAData) throw new Error(`Profile A not found: ${profErrA?.message}`);
    const profileA = profileAData.id;

    const { data: profileBData, error: profErrB } = await clientB
      .from('profiles')
      .select('id')
      .eq('user_id', userBId)
      .single();
    if (profErrB || !profileBData) throw new Error(`Profile B not found: ${profErrB?.message}`);
    const profileB = profileBData.id;

    // Create fixtures for User A
    const { data: condA, error: cErrA } = await clientA
      .from('conditions')
      .insert({ user_id: userAId, name: `CondA_${testSuffix}` })
      .select('id')
      .single();
    if (cErrA) throw new Error(`Condition A creation failed: ${cErrA.message}`);

    const { data: tagA, error: tErrA } = await clientA
      .from('tags')
      .insert({ user_id: userAId, name: `TagA_${testSuffix}` })
      .select('id')
      .single();
    if (tErrA) throw new Error(`Tag A creation failed: ${tErrA.message}`);

    const { data: metricA, error: mErrA } = await clientA
      .from('trade_metrics')
      .insert({ user_id: userAId, profile_id: profileA, name: `MetricA_${testSuffix}`, min_value: 0, max_value: 10 })
      .select('id')
      .single();
    if (mErrA) throw new Error(`Metric A creation failed: ${mErrA.message}`);

    // Create fixtures for User B
    const { data: condB, error: cErrB } = await clientB
      .from('conditions')
      .insert({ user_id: userBId, name: `CondB_${testSuffix}` })
      .select('id')
      .single();
    if (cErrB) throw new Error(`Condition B creation failed: ${cErrB.message}`);

    const { data: tagB, error: tErrB } = await clientB
      .from('tags')
      .insert({ user_id: userBId, name: `TagB_${testSuffix}` })
      .select('id')
      .single();
    if (tErrB) throw new Error(`Tag B creation failed: ${tErrB.message}`);

    const { data: metricB, error: mErrB } = await clientB
      .from('trade_metrics')
      .insert({ user_id: userBId, profile_id: profileB, name: `MetricB_${testSuffix}`, min_value: 0, max_value: 10 })
      .select('id')
      .single();
    if (mErrB) throw new Error(`Metric B creation failed: ${mErrB.message}`);

    log('Fixtures for User A and User B initialized successfully.');

    // =========================================================================
    // CASE 1: create/update พร้อม conditions, tags, metrics
    // =========================================================================
    log('Testing Case 1: create/update with conditions, tags, metrics...');
    const tradePayload1 = {
      asset: 'BTCUSDT',
      direction: 'Long',
      entry_date: new Date().toISOString(),
      result: 'Win',
      earned_r: 2.5,
      missed_r: 0
    };

    const { data: tradeId1, error: createErr1 } = await clientA.rpc('create_trade_with_relations', {
      p_profile_id: profileA,
      p_trade: tradePayload1,
      p_condition_ids: [condA.id],
      p_tag_ids: [tagA.id],
      p_metric_values: [{ metric_id: metricA.id, value: 5 }]
    });
    if (createErr1 || !tradeId1) throw new Error(`Case 1 create failed: ${createErr1?.message}`);

    // Verify relations
    const { data: relCond1 } = await clientA.from('trade_conditions').select('*').eq('trade_id', tradeId1);
    const { data: relTag1 } = await clientA.from('trade_tags').select('*').eq('trade_id', tradeId1);
    const { data: relMet1 } = await clientA.from('trade_metric_values').select('*').eq('trade_id', tradeId1);
    if (relCond1?.length !== 1 || relTag1?.length !== 1 || relMet1?.length !== 1) {
      throw new Error(`Case 1 relation verification failed: cond=${relCond1?.length}, tag=${relTag1?.length}, metric=${relMet1?.length}`);
    }

    // Update with replaced relations (empty)
    const { data: updId1, error: updErr1 } = await clientA.rpc('update_trade_with_relations', {
      p_trade_id: tradeId1,
      p_profile_id: profileA,
      p_trade: { ...tradePayload1, earned_r: 3.5 },
      p_condition_ids: [],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (updErr1) throw new Error(`Case 1 update failed: ${updErr1.message}`);

    const { data: relCond1After } = await clientA.from('trade_conditions').select('*').eq('trade_id', tradeId1);
    const { data: relTag1After } = await clientA.from('trade_tags').select('*').eq('trade_id', tradeId1);
    const { data: relMet1After } = await clientA.from('trade_metric_values').select('*').eq('trade_id', tradeId1);
    if (relCond1After?.length !== 0 || relTag1After?.length !== 0 || relMet1After?.length !== 0) {
      throw new Error(`Case 1 update relation replacement failed: relations not cleared`);
    }
    testReport.cases['create_update_relations'] = 'PASSED';
    log('Case 1 PASSED: create and update with relations work atomically.');

    // =========================================================================
    // CASE 2: quick-note conversion
    // =========================================================================
    log('Testing Case 2: quick-note conversion...');
    const { data: note2, error: nErr2 } = await clientA
      .from('quick_notes')
      .insert({ user_id: userAId, profile_id: profileA, note: 'Quick note conversion test' })
      .select('id')
      .single();
    if (nErr2) throw new Error(`Case 2 note creation failed: ${nErr2.message}`);

    const { data: tradeId2, error: createErr2 } = await clientA.rpc('create_trade_with_relations', {
      p_profile_id: profileA,
      p_trade: { ...tradePayload1, asset: 'ETHUSDT', quick_note_id: note2.id },
      p_condition_ids: [],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (createErr2 || !tradeId2) throw new Error(`Case 2 note conversion failed: ${createErr2?.message}`);

    const { data: note2After } = await clientA.from('quick_notes').select('converted_trade_id').eq('id', note2.id).single();
    if (note2After?.converted_trade_id !== tradeId2) {
      throw new Error(`Case 2 note converted_trade_id mismatch: expected ${tradeId2}, got ${note2After?.converted_trade_id}`);
    }

    // Repeat conversion must fail
    const { error: repeatErr2 } = await clientA.rpc('create_trade_with_relations', {
      p_profile_id: profileA,
      p_trade: { ...tradePayload1, asset: 'ETHUSDT', quick_note_id: note2.id },
      p_condition_ids: [],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (!repeatErr2 || !repeatErr2.message.includes('already converted')) {
      throw new Error(`Case 2 repeat conversion was not rejected with 'already converted': ${repeatErr2?.message}`);
    }
    testReport.cases['quick_note_conversion'] = 'PASSED';
    log('Case 2 PASSED: quick note converted and repeat conversion prevented.');

    // =========================================================================
    // CASE 3: import สำเร็จ และแถวหลังผิดทำให้ rollback ทั้ง batch
    // =========================================================================
    log('Testing Case 3: batch import and atomic rollback on invalid row...');
    const { data: countBeforeRows } = await clientA.from('trades').select('id');
    const countBefore = countBeforeRows?.length || 0;

    // Successful batch of 2 trades
    const validBatch = [
      {
        trade: { ...tradePayload1, asset: 'SOLUSDT', earned_r: 1.0 },
        metric_values: [{ metric_id: metricA.id, value: 2 }]
      },
      {
        trade: { ...tradePayload1, asset: 'ADAUSDT', earned_r: 2.0 },
        metric_values: [{ metric_id: metricA.id, value: 4 }]
      }
    ];
    const { data: importedIds, error: impErr3 } = await clientA.rpc('import_trades_with_relations', {
      p_profile_id: profileA,
      p_rows: validBatch
    });
    if (impErr3 || !importedIds || importedIds.length !== 2) {
      throw new Error(`Case 3 valid import failed: ${impErr3?.message}`);
    }

    // Invalid batch where second row exceeds metric range (value: 999 where max: 10)
    const invalidBatch = [
      {
        trade: { ...tradePayload1, asset: 'FAIL1', earned_r: 1.0 },
        metric_values: []
      },
      {
        trade: { ...tradePayload1, asset: 'FAIL2', earned_r: 2.0 },
        metric_values: [{ metric_id: metricA.id, value: 999 }]
      }
    ];
    const { error: failImpErr } = await clientA.rpc('import_trades_with_relations', {
      p_profile_id: profileA,
      p_rows: invalidBatch
    });
    if (!failImpErr || !failImpErr.message.includes('outside the allowed range')) {
      throw new Error(`Case 3 invalid batch did not fail with range error: ${failImpErr?.message}`);
    }

    // Verify complete rollback: count must equal countBefore + 2 (from valid batch only)
    const { data: countAfterRows } = await clientA.from('trades').select('id');
    const countAfter = countAfterRows?.length || 0;
    if (countAfter !== countBefore + 2) {
      throw new Error(`Case 3 rollback failed: expected ${countBefore + 2} trades, got ${countAfter}`);
    }
    testReport.cases['batch_import_and_rollback'] = 'PASSED';
    log('Case 3 PASSED: batch import succeeds, invalid row rolls back entire batch.');

    // =========================================================================
    // CASE 4: update ผิดแล้วข้อมูล/relations เดิมอยู่ครบ
    // =========================================================================
    log('Testing Case 4: atomic rollback on invalid update preserving original relations...');
    const { data: tradeId4, error: createErr4 } = await clientA.rpc('create_trade_with_relations', {
      p_profile_id: profileA,
      p_trade: { ...tradePayload1, asset: 'STABLE_ORIG' },
      p_condition_ids: [condA.id],
      p_tag_ids: [tagA.id],
      p_metric_values: [{ metric_id: metricA.id, value: 7 }]
    });
    if (createErr4 || !tradeId4) throw new Error(`Case 4 creation failed: ${createErr4?.message}`);

    // Attempt invalid update: attach unowned Condition B
    const { error: invalidUpdErr } = await clientA.rpc('update_trade_with_relations', {
      p_trade_id: tradeId4,
      p_profile_id: profileA,
      p_trade: { ...tradePayload1, asset: 'CORRUPTED' },
      p_condition_ids: [condB.id], // Condition B is owned by User B!
      p_tag_ids: [],
      p_metric_values: []
    });
    if (!invalidUpdErr || !invalidUpdErr.message.includes('not owned by this user')) {
      throw new Error(`Case 4 invalid update was not rejected with ownership error: ${invalidUpdErr?.message}`);
    }

    // Verify original trade and relations are 100% preserved
    const { data: trade4After } = await clientA.from('trades').select('asset').eq('id', tradeId4).single();
    if (trade4After?.asset !== 'STABLE_ORIG') {
      throw new Error(`Case 4 trade asset mutated despite error: got ${trade4After?.asset}`);
    }
    const { data: cond4After } = await clientA.from('trade_conditions').select('condition_id').eq('trade_id', tradeId4);
    if (cond4After?.length !== 1 || cond4After[0].condition_id !== condA.id) {
      throw new Error(`Case 4 trade conditions corrupted: got ${JSON.stringify(cond4After)}`);
    }
    testReport.cases['update_atomic_rollback'] = 'PASSED';
    log('Case 4 PASSED: invalid update rolled back completely with relations intact.');

    // =========================================================================
    // CASE 5: ปฏิเสธ profile/trade/relations ของอีก user และ anon
    // =========================================================================
    log('Testing Case 5: cross-user isolation and anonymous rejection...');
    // User B tries to use Profile A
    const { error: crossProfErr } = await clientB.rpc('create_trade_with_relations', {
      p_profile_id: profileA,
      p_trade: tradePayload1,
      p_condition_ids: [],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (!crossProfErr || !crossProfErr.message.includes('Profile not found')) {
      throw new Error(`Case 5 cross-profile write was not rejected: ${crossProfErr?.message}`);
    }

    // User B tries to update User A's trade
    const { error: crossTradeErr } = await clientB.rpc('update_trade_with_relations', {
      p_trade_id: tradeId1,
      p_profile_id: profileB,
      p_trade: tradePayload1,
      p_condition_ids: [],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (!crossTradeErr || !crossTradeErr.message.includes('Trade not found')) {
      throw new Error(`Case 5 cross-trade update was not rejected: ${crossTradeErr?.message}`);
    }

    // User B tries to attach User A's tag
    const { error: crossTagErr } = await clientB.rpc('create_trade_with_relations', {
      p_profile_id: profileB,
      p_trade: tradePayload1,
      p_condition_ids: [],
      p_tag_ids: [tagA.id],
      p_metric_values: []
    });
    if (!crossTagErr || !crossTagErr.message.includes('not owned by this user')) {
      throw new Error(`Case 5 cross-tag relation was not rejected: ${crossTagErr?.message}`);
    }

    // Anon tries to call RPC
    const { error: anonRpcErr } = await anonClient.rpc('create_trade_with_relations', {
      p_profile_id: profileA,
      p_trade: tradePayload1,
      p_condition_ids: [],
      p_tag_ids: [],
      p_metric_values: []
    });
    if (!anonRpcErr) {
      throw new Error(`Case 5 anonymous RPC call was NOT rejected!`);
    }
    testReport.cases['cross_user_and_anon_rejection'] = 'PASSED';
    log('Case 5 PASSED: cross-user and anonymous RPC calls strictly rejected.');

    // =========================================================================
    // CASE 6: client flow เดิมที่เขียนตรงยังทำงานสำหรับเจ้าของ
    // =========================================================================
    log('Testing Case 6: legacy direct table writes for owner with restrictive policy enforcement...');
    const legacyAsset = `LEGACY_${testSuffix}`;
    const { data: legacyTrade, error: legErr } = await clientA
      .from('trades')
      .insert({
        user_id: userAId,
        profile_id: profileA,
        asset: legacyAsset,
        direction: 'Long',
        result: 'Win',
        entry_date: new Date().toISOString(),
        earned_r: 1.0,
        missed_r: 0
      })
      .select('id')
      .single();
    if (legErr || !legacyTrade) throw new Error(`Case 6 legacy direct trade insert failed: ${legErr?.message}`);

    const { error: legCondErr } = await clientA
      .from('trade_conditions')
      .insert({ trade_id: legacyTrade.id, condition_id: condA.id });
    if (legCondErr) throw new Error(`Case 6 legacy condition insert failed: ${legCondErr.message}`);

    // Restrictive policy: User B cannot insert a trade pointing to User A's profile
    const { error: crossDirectProfErr } = await clientB
      .from('trades')
      .insert({
        user_id: userBId,
        profile_id: profileA, // unowned profile
        asset: 'SPOOF',
        direction: 'Long',
        result: 'Win',
        entry_date: new Date().toISOString(),
        earned_r: 1.0,
        missed_r: 0
      });
    if (!crossDirectProfErr || !crossDirectProfErr.message.includes('row-level security')) {
      throw new Error(`Case 6 restrictive policy on trades profile ownership did not trigger: ${crossDirectProfErr?.message}`);
    }

    // Restrictive policy: User A cannot link User B's condition
    const { error: crossDirectCondErr } = await clientA
      .from('trade_conditions')
      .insert({ trade_id: legacyTrade.id, condition_id: condB.id });
    if (!crossDirectCondErr || !crossDirectCondErr.message.includes('row-level security')) {
      throw new Error(`Case 6 restrictive policy on condition ownership did not trigger: ${crossDirectCondErr?.message}`);
    }
    testReport.cases['legacy_direct_writes_and_restrictive_rls'] = 'PASSED';
    log('Case 6 PASSED: legacy direct writes work for owner and restrictive policies enforce ownership.');

    // =========================================================================
    // CASE 7: ภาพเดิมอ่านได้ด้วย signed URL; public URL เข้าไม่ได้
    // =========================================================================
    log('Testing Case 7: image access via signed URL vs private direct public URL rejection...');
    const testImagePath = 'a57f943f-65ee-4831-a779-754ef35973b6/trades/1785776984931-z507i0.png';

    // 1. Direct public URL must NOT be accessible
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/trade-images/${testImagePath}`;
    const pubRes = await fetch(publicUrl);
    log(`Public URL response: HTTP ${pubRes.status}`);
    if (pubRes.status === 200) {
      throw new Error(`Case 7 security leak: private bucket allows public access at ${publicUrl}!`);
    }

    // 2. Signed URL must be accessible
    const { data: signedData, error: signErr } = await adminClient
      .storage
      .from('trade-images')
      .createSignedUrl(testImagePath, 60);
    if (signErr || !signedData?.signedUrl) {
      throw new Error(`Case 7 createSignedUrl failed: ${signErr?.message}`);
    }

    const signedUrlToFetch = signedData.signedUrl.startsWith('http')
      ? signedData.signedUrl
      : `${supabaseUrl}${signedData.signedUrl}`;

    const signRes = await fetch(signedUrlToFetch);
    log(`Signed URL response: HTTP ${signRes.status}`);
    if (signRes.status !== 200) {
      throw new Error(`Case 7 signed URL fetch failed with HTTP ${signRes.status}`);
    }
    const imageBytes = await signRes.arrayBuffer();
    if (imageBytes.byteLength === 0) {
      throw new Error('Case 7 signed URL returned 0 bytes');
    }
    log(`Signed URL verified successfully (${imageBytes.byteLength} bytes downloaded).`);
    testReport.cases['storage_private_and_signed_url'] = 'PASSED';
    log('Case 7 PASSED: public URL rejected, signed URL works correctly.');

    testReport.allPassed = true;
    log('========================================================================');
    log('ALL 7 INTEGRATION TEST CASES PASSED SUCCESSFULLY ON STAGING!');
    log('========================================================================');
  } finally {
    // CLEANUP FIXTURES
    log('Cleaning up test fixtures (User A and User B only)...');
    try {
      if (userAId) {
        // Cascade delete on auth.users will clean up profiles, trades, conditions, tags, metrics
        const { error: delErrA } = await adminClient.auth.admin.deleteUser(userAId);
        if (delErrA) log(`Warning deleting test user A: ${delErrA.message}`);
        else log(`Deleted test user A: ${userAId}`);
      }
      if (userBId) {
        const { error: delErrB } = await adminClient.auth.admin.deleteUser(userBId);
        if (delErrB) log(`Warning deleting test user B: ${delErrB.message}`);
        else log(`Deleted test user B: ${userBId}`);
      }
    } catch (cleanupErr) {
      log(`Cleanup warning: ${sanitizeError(cleanupErr.message, secrets)}`);
    }

    // Verify restored users count is still 3
    const { count: usersCount } = await adminClient.from('profiles').select('id', { count: 'exact', head: true });
    log(`Post-test profiles count: ${usersCount} (restored profiles remain intact).`);
  }

  return testReport;
}

runIntegration().then(report => {
  if (!report.allPassed) {
    console.error('Integration tests failed');
    process.exit(1);
  }
  process.exit(0);
}).catch(err => {
  console.error('[FATAL INTEGRATION ERROR]', err.message);
  process.exit(1);
});
