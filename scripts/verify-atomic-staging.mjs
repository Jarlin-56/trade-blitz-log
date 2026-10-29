import fs from 'node:fs';
import path from 'node:path';
import { execPsqlSafe, validateStagingTarget, sanitizeError } from './staging-utils.mjs';

const CONFIG_PATH = 'C:\\Users\\User\\TradeLog-Backups\\staging-config.json';

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function verifyMigration() {
  log('Starting Atomic Migration Verification on Staging (A8 Step 3)...');

  const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
  const config = JSON.parse(rawConfig);
  validateStagingTarget(config);

  const secrets = [config.db_password, config.anon_key, config.service_role_key].filter(Boolean);

  const run = (sql, desc) => {
    try {
      return execPsqlSafe({
        psqlExe: 'C:\\Users\\User\\TradeLog-Tools\\pgsql17\\pgsql\\bin\\psql.exe',
        sql,
        config,
        extraArgs: ['-t', '-A']
      }).trim();
    } catch (err) {
      throw new Error(`Failed to execute ${desc}: ${sanitizeError(err.message, secrets)}`);
    }
  };

  const issues = [];

  // 1. Verify 4 functions
  const expectedFunctions = [
    'create_trade_with_relations',
    'import_trades_with_relations',
    'save_trade_with_relations',
    'update_trade_with_relations'
  ];

  const funcsSql = `
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('save_trade_with_relations', 'create_trade_with_relations', 'update_trade_with_relations', 'import_trades_with_relations')
    ORDER BY p.proname;
  `;
  const existingFuncs = run(funcsSql, 'querying atomic functions').split('\n').map(l => l.trim()).filter(Boolean);
  log(`Found ${existingFuncs.length}/4 atomic functions: ${existingFuncs.join(', ')}`);
  for (const fn of expectedFunctions) {
    if (!existingFuncs.includes(fn)) {
      issues.push(`Missing atomic function: public.${fn}`);
    }
  }

  // 2. Verify 3 performance indexes
  const expectedIndexes = [
    'idx_trades_user_profile_entry_date',
    'idx_trade_conditions_condition_trade',
    'idx_trade_tags_tag_trade'
  ];
  const idxSql = `
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('idx_trades_user_profile_entry_date', 'idx_trade_conditions_condition_trade', 'idx_trade_tags_tag_trade')
    ORDER BY indexname;
  `;
  const existingIndexes = run(idxSql, 'querying performance indexes').split('\n').map(l => l.trim()).filter(Boolean);
  log(`Found ${existingIndexes.length}/3 performance indexes: ${existingIndexes.join(', ')}`);
  for (const idx of expectedIndexes) {
    if (!existingIndexes.includes(idx)) {
      issues.push(`Missing performance index: ${idx}`);
    }
  }

  // 3. Verify 5 restrictive policies
  const expectedPolicies = [
    'Validate condition ownership',
    'Validate metric profile ownership',
    'Validate metric value ownership',
    'Validate tag ownership',
    'Validate trade profile ownership'
  ];
  const polSql = `
    SELECT policyname || '|' || permissive
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'Validate %'
    ORDER BY policyname;
  `;
  const polRows = run(polSql, 'querying restrictive policies').split('\n').map(l => l.trim()).filter(Boolean);
  log(`Found ${polRows.length}/5 restrictive policies:`);
  for (const row of polRows) {
    const [name, permissive] = row.split('|');
    log(` - ${name}: permissive=${permissive}`);
    if (permissive !== 'RESTRICTIVE') {
      issues.push(`Policy ${name} is not RESTRICTIVE (got: ${permissive})`);
    }
  }
  for (const exp of expectedPolicies) {
    if (!polRows.some(r => r.startsWith(exp + '|'))) {
      issues.push(`Missing restrictive policy: "${exp}"`);
    }
  }

  // 4. Verify bucket private setting
  const bucketSql = `SELECT public FROM storage.buckets WHERE id = 'trade-images';`;
  const bucketPublic = run(bucketSql, 'querying bucket public setting');
  log(`Bucket trade-images public=${bucketPublic}`);
  if (bucketPublic !== 'f') {
    issues.push(`Bucket trade-images public setting is not false (got: ${bucketPublic})`);
  }

  // 5. Verify effective function privileges
  const routinePrivs = run(`
    SELECT routine_name || '|' || grantee || '|' || privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('save_trade_with_relations', 'create_trade_with_relations', 'update_trade_with_relations', 'import_trades_with_relations')
    ORDER BY routine_name, grantee;
  `, 'querying routine_privileges');
  log(`Detailed routine privileges in information_schema:\n${routinePrivs}`);

  const defaultPrivs = run(`
    SELECT defaclobjtype, defaclrole::regrole, defaclacl
    FROM pg_default_acl;
  `, 'querying default acls');
  log(`Default ACLs:\n${defaultPrivs}`);

  const privSql = `
    SELECT
      'create_trade_with_relations|' ||
      has_function_privilege('authenticated', 'public.create_trade_with_relations(uuid,jsonb,uuid[],uuid[],jsonb)', 'EXECUTE') || '|' ||
      has_function_privilege('anon', 'public.create_trade_with_relations(uuid,jsonb,uuid[],uuid[],jsonb)', 'EXECUTE')
    UNION ALL
    SELECT
      'update_trade_with_relations|' ||
      has_function_privilege('authenticated', 'public.update_trade_with_relations(uuid,uuid,jsonb,uuid[],uuid[],jsonb)', 'EXECUTE') || '|' ||
      has_function_privilege('anon', 'public.update_trade_with_relations(uuid,uuid,jsonb,uuid[],uuid[],jsonb)', 'EXECUTE')
    UNION ALL
    SELECT
      'save_trade_with_relations|' ||
      has_function_privilege('authenticated', 'public.save_trade_with_relations(uuid,uuid,jsonb,uuid[],uuid[],jsonb)', 'EXECUTE') || '|' ||
      has_function_privilege('anon', 'public.save_trade_with_relations(uuid,uuid,jsonb,uuid[],uuid[],jsonb)', 'EXECUTE')
    UNION ALL
    SELECT
      'import_trades_with_relations|' ||
      has_function_privilege('authenticated', 'public.import_trades_with_relations(uuid,jsonb)', 'EXECUTE') || '|' ||
      has_function_privilege('anon', 'public.import_trades_with_relations(uuid,jsonb)', 'EXECUTE');
  `;
  const privRows = run(privSql, 'querying function privileges').split('\n').map(l => l.trim()).filter(Boolean);
  log('Effective function privileges check:');
  for (const row of privRows) {
    const [fn, authOk, anonOk] = row.split('|');
    log(` - ${fn}: authenticated=${authOk}, anon=${anonOk}`);
    if (authOk !== 't' && authOk !== 'true') {
      issues.push(`Function ${fn} is NOT executable by authenticated role (got: ${authOk})`);
    }
    if (anonOk !== 'f' && anonOk !== 'false') {
      issues.push(`Function ${fn} is executable by anon role (must be revoked! got: ${anonOk})`);
    }
  }

  if (issues.length > 0) {
    log(`Verification failed with ${issues.length} issue(s):`);
    for (const issue of issues) log(` * ${issue}`);
    process.exit(1);
  }

  log('All Step 3 post-migration verifications PASSED completely!');
}

verifyMigration().catch(err => {
  console.error('[FATAL VERIFICATION ERROR]', err.message);
  process.exit(1);
});
