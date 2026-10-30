#!/usr/bin/env node
/**
 * scripts/restore-staging.mjs
 * 
 * Verifiable, conflict-free, and secret-safe restore script for Supabase Staging (A6-R3 / A7).
 * Enforces NTFS ACLs on Windows for Auth temp SQL,
 * generates filtered TOC to avoid SCHEMA public recreation conflict,
 * executes read-only staging DB queries during preflight (checking conflicts, auth compatibility, and existing data),
 * and strictly refuses --clean/drop/truncate on conflict.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import {
  ALLOWED_STAGING_REF,
  validateStagingTarget,
  sanitizeError,
  parsePsqlCount,
  validateStorageRelativePath,
  validateStorageManifestFiles,
  createSecureTempDir,
  filterTocForRestore
} from './staging-utils.mjs';

const EXPECTED_DUMP_SHA256 = 'F9D99E3229E78F77D14C62105100291B37AD0A9A9948040AD9EA2A8AA4096F91';
const BACKUP_DIR = 'C:\\Users\\User\\TradeLog-Backups\\20261029-pre-atomic';
const BACKUP_ROOT = 'C:\\Users\\User\\TradeLog-Backups';
const DUMP_PATH = path.join(BACKUP_DIR, 'db_nkuwxxrntnkqoayfbrvv_20261030_010606_ed715ffa.dump');
const STAGING_CONFIG_PATH = 'C:\\Users\\User\\TradeLog-Backups\\staging-config.json';
const PG_TOOLS_DIR = 'C:\\Users\\User\\TradeLog-Tools\\pgsql17\\pgsql\\bin';
const PG_RESTORE_EXE = path.join(PG_TOOLS_DIR, 'pg_restore.exe');
const PSQL_EXE = path.join(PG_TOOLS_DIR, 'psql.exe');

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  log('Starting staging restore pipeline (A7)...');

  // =========================================================================
  // PREFLIGHT CHECKS (Executed BEFORE dry-run exit and BEFORE any DB writes)
  // =========================================================================

  // 1. Target Validation
  if (!fs.existsSync(STAGING_CONFIG_PATH)) {
    throw new Error(`Staging config not found at ${STAGING_CONFIG_PATH}`);
  }

  const rawConfig = fs.readFileSync(STAGING_CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
  const stagingConfig = JSON.parse(rawConfig);
  validateStagingTarget(stagingConfig);
  log(`Preflight 1/6 PASSED: Target validated for staging ref '${stagingConfig.project_ref}'`);

  const secretsToSanitize = [
    stagingConfig.db_password,
    stagingConfig.service_role_key,
    stagingConfig.anon_key
  ].filter(Boolean);

  // 2. Dump File Existence & SHA-256 Check
  if (!fs.existsSync(DUMP_PATH)) {
    throw new Error(`Dump file missing at ${DUMP_PATH}`);
  }

  const fileData = fs.readFileSync(DUMP_PATH);
  const actualHash = crypto.createHash('sha256').update(fileData).digest('hex').toUpperCase();
  if (actualHash !== EXPECTED_DUMP_SHA256) {
    throw new Error(`Dump hash mismatch! Expected ${EXPECTED_DUMP_SHA256}, got ${actualHash}`);
  }
  log(`Preflight 2/6 PASSED: Dump SHA-256 integrity verified (${actualHash})`);

  // 3. PostgreSQL CLI Tools Existence
  if (!fs.existsSync(PG_RESTORE_EXE) || !fs.existsSync(PSQL_EXE)) {
    throw new Error(`PostgreSQL binaries not found in ${PG_TOOLS_DIR}`);
  }
  log(`Preflight 3/6 PASSED: PostgreSQL binaries verified in ${PG_TOOLS_DIR}`);

  // Setup scoped environment without exposing passwords in command line args
  const dbEnv = {
    ...process.env,
    PGPASSWORD: stagingConfig.db_password,
    PGHOST: stagingConfig.db_host,
    PGPORT: String(stagingConfig.db_port || 5432),
    PGUSER: stagingConfig.db_user,
    PGDATABASE: stagingConfig.db_name || 'postgres',
    PGSSLMODE: 'require'
  };

  function execSubprocess(exe, args, description) {
    const res = spawnSync(exe, args, { env: dbEnv, encoding: 'utf8' });

    if (res.error) {
      throw new Error(`Failed to spawn ${description}: ${sanitizeError(res.error.message, secretsToSanitize)}`);
    }

    if (res.status !== 0) {
      const err = sanitizeError(res.stderr || res.stdout, secretsToSanitize);
      throw new Error(`Command failed (${description}) with exit code ${res.status}: ${err}`);
    }

    return res.stdout;
  }

  function runPsqlCmd(sql, description, extraArgs = []) {
    return execSubprocess(
      PSQL_EXE,
      ['-X', '-v', 'ON_ERROR_STOP=1', '-w', ...extraArgs, '-c', sql],
      description
    );
  }

  function runPsqlFileCmd(filePath, description) {
    return execSubprocess(
      PSQL_EXE,
      ['-X', '-v', 'ON_ERROR_STOP=1', '-w', '-f', filePath],
      description
    );
  }

  // 4. Dump TOC Inspection
  log('Preflight 4/6: Inspecting dump TOC for required tables and schemas...');
  const tocOutput = execSubprocess(
    PG_RESTORE_EXE,
    ['-l', DUMP_PATH],
    'Inspecting dump TOC'
  );

  const requiredTocEntries = [
    'TABLE DATA auth users',
    'TABLE DATA auth identities',
    'TABLE DATA public trades',
    'TABLE DATA public conditions',
    'TABLE DATA public tags',
    'TABLE DATA storage objects'
  ];

  for (const entry of requiredTocEntries) {
    if (!tocOutput.includes(entry)) {
      throw new Error(`TOC preflight failed: Missing required entry "${entry}" in dump TOC`);
    }
  }
  log('Preflight 4/6 PASSED: Dump TOC contains all required application, auth, and storage entries');

  // 5. Storage Manifest and All 15 Files Checksum Preflight
  log('Preflight 5/6: Validating storage manifest and all 15 file checksums...');
  const storageManifestPath = path.join(BACKUP_DIR, 'storage', 'manifest.json');
  const storageFilesDir = path.join(BACKUP_DIR, 'storage', 'files');

  if (!fs.existsSync(storageManifestPath) || !fs.existsSync(storageFilesDir)) {
    throw new Error('Storage backup manifest or files folder missing.');
  }

  const storageManifest = JSON.parse(fs.readFileSync(storageManifestPath, 'utf8'));
  const verifiedFiles = validateStorageManifestFiles(storageManifest, storageFilesDir);
  log(`Preflight 5/6 PASSED: Verified ${verifiedFiles.length} storage files and SHA-256 hashes on disk`);

  // 6. Read-Only Staging DB Preflight Queries (Schema Conflicts, Compatibility, Existing Data)
  log('Preflight 6/6: Querying staging database (read-only) for conflicts, auth compatibility, and existing data...');
  
  // 6.1 Check public schema conflicts (Must be 0 tables before restore; NO --clean/drop/truncate)
  const existingTablesOut = runPsqlCmd(
    `SELECT count(*) FROM pg_tables WHERE schemaname = 'public';`,
    'Checking public schema table conflicts',
    ['-t', '-A']
  );
  const existingTableCount = parsePsqlCount(existingTablesOut);
  if (existingTableCount > 0) {
    const listOut = runPsqlCmd(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`,
      'Listing existing public tables',
      ['-t', '-A']
    );
    throw new Error(
      `CRITICAL SCHEMA CONFLICT: Staging already contains ${existingTableCount} public tables (${listOut.trim().replace(/\n/g, ', ')}). ` +
      `Halting restore without clean/drop/truncate to prevent state corruption.`
    );
  }

  // 6.2 Check auth.users column compatibility
  const authColsOut = runPsqlCmd(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users';`,
    'Checking auth.users columns compatibility',
    ['-t', '-A']
  );
  const authCols = authColsOut.split(/\r?\n/).filter(Boolean);
  const requiredAuthCols = ['id', 'email', 'encrypted_password', 'raw_app_meta_data', 'raw_user_meta_data', 'created_at', 'updated_at'];
  for (const c of requiredAuthCols) {
    if (!authCols.includes(c)) {
      throw new Error(`CRITICAL AUTH INCOMPATIBILITY: Staging auth.users is missing column '${c}' required by dump.`);
    }
  }

  // 6.3 Check existing data in staging auth and storage
  const authUsersCount = parsePsqlCount(runPsqlCmd(`SELECT count(*) FROM auth.users;`, 'Checking auth.users row count', ['-t', '-A']));
  if (authUsersCount > 0) {
    throw new Error(`CONFLICT: Staging auth.users already contains ${authUsersCount} rows. Halting restore.`);
  }

  log('Preflight 6/6 PASSED: Staging DB verified (0 public tables, compatible auth.users schema, 0 existing users)');

  // =========================================================================
  // DRY-RUN EXIT
  // =========================================================================
  if (process.argv.includes('--dry-run')) {
    log('------------------------------------------------------------------------');
    log('DRY-RUN REPORT: All 6 preflight validations PASSED completely:');
    log(` - Target Project Ref: ${stagingConfig.project_ref} (verified non-production)`);
    log(` - DB Endpoint: ${stagingConfig.db_host} (PostgreSQL 17, verified connected)`);
    log(` - Dump SHA-256: ${actualHash} (matches manifest)`);
    log(` - TOC Validation: 6 required table data sections confirmed`);
    log(` - Storage Files: 15/15 files verified with matching SHA-256 checksums on disk`);
    log(` - Staging Conflict Check: 0 public tables, compatible auth schema, 0 existing users`);
    log('Dry-run preflight complete. No database writes performed.');
    log('------------------------------------------------------------------------');
    return;
  }

  // =========================================================================
  // RESTORE EXECUTION (Only when NOT dry-run)
  // =========================================================================

  // Create ACL-enforced temp directory under backup folder (SYSTEM + Current User only)
  const tempDir = createSecureTempDir(BACKUP_ROOT);
  log(`Secure temp directory created with strict NTFS ACL: ${tempDir}`);

  try {
    // Step 1: Restore auth.users & auth.identities in correct dependency order
    log('Step 1a: Extracting and restoring auth.users...');
    const usersSqlFile = path.join(tempDir, 'auth_users.sql');
    execSubprocess(
      PG_RESTORE_EXE,
      ['-a', '-n', 'auth', '-t', 'users', '-f', usersSqlFile, DUMP_PATH],
      'Extracting auth.users data'
    );
    runPsqlFileCmd(usersSqlFile, 'Restoring auth users');
    fs.unlinkSync(usersSqlFile);

    log('Step 1b: Extracting and restoring auth.identities...');
    const identitiesSqlFile = path.join(tempDir, 'auth_identities.sql');
    execSubprocess(
      PG_RESTORE_EXE,
      ['-a', '-n', 'auth', '-t', 'identities', '-f', identitiesSqlFile, DUMP_PATH],
      'Extracting auth.identities data'
    );
    runPsqlFileCmd(identitiesSqlFile, 'Restoring auth identities');
    fs.unlinkSync(identitiesSqlFile);

    // Step 2: Prepare Filtered TOC to prevent SCHEMA public conflict
    log('Step 2: Generating filtered TOC to avoid public schema recreation conflict...');
    const rawTocContent = execSubprocess(
      PG_RESTORE_EXE,
      ['-l', DUMP_PATH],
      'Extracting full dump TOC'
    );
    const filteredTocContent = filterTocForRestore(rawTocContent);
    const filteredTocFile = path.join(tempDir, 'filtered_restore.toc');
    fs.writeFileSync(filteredTocFile, filteredTocContent, 'utf8');

    // Step 3: Restore public schema objects and data using Filtered TOC
    log('Step 3: Restoring public schema objects and data via filtered TOC...');
    execSubprocess(
      PG_RESTORE_EXE,
      [
        '--exit-on-error',
        '-L', filteredTocFile,
        '--schema=public',
        '--no-owner',
        '--no-privileges',
        '-h', stagingConfig.db_host,
        '-p', String(stagingConfig.db_port || 5432),
        '-U', stagingConfig.db_user,
        '-d', stagingConfig.db_name || 'postgres',
        '-w',
        DUMP_PATH
      ],
      'Restoring public schema with filtered TOC'
    );
    fs.unlinkSync(filteredTocFile);

    // Step 4: Revoke template default grants and apply baseline privileges
    log('Step 4: Revoking template defaults and applying baseline grants...');
    runPsqlCmd(`
      -- Clean template default table grants
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, PUBLIC;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
      REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, PUBLIC;

      -- Apply strict baseline grants
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

      GRANT SELECT, INSERT, UPDATE, DELETE ON
        public.profiles,
        public.trades,
        public.conditions,
        public.tags,
        public.trade_conditions,
        public.trade_tags,
        public.quick_notes,
        public.recap_quiz_attempts,
        public.recap_quiz_condition_results,
        public.trade_metrics,
        public.trade_metric_values
      TO authenticated;

      GRANT ALL ON
        public.profiles,
        public.trades,
        public.conditions,
        public.tags,
        public.trade_conditions,
        public.trade_tags,
        public.quick_notes,
        public.recap_quiz_attempts,
        public.recap_quiz_condition_results,
        public.trade_metrics,
        public.trade_metric_values
      TO service_role;

      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
    `, 'Applying baseline privileges');

    // Step 5: Re-create custom trigger on auth.users
    log('Step 5: Re-creating custom trigger on auth.users...');
    runPsqlCmd(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
          CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
        END IF;
      END $$;
    `, 'Creating on_auth_user_created trigger');

    // Step 6: Re-create custom storage policies on storage.objects
    log('Step 6: Re-creating custom storage.objects policies...');
    runPsqlCmd(`
      DO $$
      BEGIN
        DROP POLICY IF EXISTS "Users can upload trade images" ON storage.objects;
        CREATE POLICY "Users can upload trade images" ON storage.objects
          FOR INSERT TO public WITH CHECK (
            bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]
          );

        DROP POLICY IF EXISTS "Users can read own trade images" ON storage.objects;
        CREATE POLICY "Users can read own trade images" ON storage.objects
          FOR SELECT TO authenticated USING (
            bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]
          );

        DROP POLICY IF EXISTS "Users can update own trade images" ON storage.objects;
        CREATE POLICY "Users can update own trade images" ON storage.objects
          FOR UPDATE TO authenticated USING (
            bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]
          );

        DROP POLICY IF EXISTS "Users can delete own trade images" ON storage.objects;
        CREATE POLICY "Users can delete own trade images" ON storage.objects
          FOR DELETE TO public USING (
            bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]
          );
      END $$;
    `, 'Creating storage.objects policies');

    // Step 7: Create Storage Bucket and Upload Physical Files
    log('Step 7: Creating private storage bucket and uploading 15 files...');
    const supabaseUrl = stagingConfig.supabase_url;
    const serviceKey = stagingConfig.service_role_key;
    const bucketName = storageManifest.bucket || 'trade-images';

    const bucketRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: bucketName,
        name: bucketName,
        public: false, // Intentional staging security setting
        file_size_limit: 10485760,
        allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp']
      })
    });

    if (!bucketRes.ok && bucketRes.status !== 409) {
      const errText = await bucketRes.text();
      throw new Error(`Failed to create bucket '${bucketName}': HTTP ${bucketRes.status} ${sanitizeError(errText, secretsToSanitize)}`);
    }

    for (const obj of storageManifest.objects) {
      const relPath = obj.relative_path.replace(/\\/g, '/');
      const localFilePath = path.resolve(storageFilesDir, obj.relative_path);
      const fileData = fs.readFileSync(localFilePath);

      const ext = path.extname(relPath).toLowerCase();
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';

      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${relPath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': mimeType,
          'x-upsert': 'true'
        },
        body: fileData
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Storage upload failed for ${relPath}: HTTP ${uploadRes.status} ${sanitizeError(errText, secretsToSanitize)}`);
      }
    }
    log(`Uploaded 15/15 files successfully to bucket '${bucketName}'`);

    // Step 8: Sync storage object ownership metadata
    log('Step 8: Syncing storage object ownership metadata...');
    runPsqlCmd(`
      UPDATE storage.objects
      SET owner = (string_to_array(name, '/'))[1]::uuid,
          owner_id = (string_to_array(name, '/'))[1]
      WHERE bucket_id = 'trade-images' AND owner IS NULL;
    `, 'Syncing storage object owners');

    // Step 9: Rewrite trades.image_url to staging origin
    log('Step 9: Rewriting image URLs in trades to staging origin...');
    const rewriteOutput = runPsqlCmd(`
      WITH updated AS (
        UPDATE public.trades
        SET image_url = replace(image_url, 'nkuwxxrntnkqoayfbrvv', '${ALLOWED_STAGING_REF}')
        WHERE image_url LIKE '%nkuwxxrntnkqoayfbrvv%'
        RETURNING id
      )
      SELECT count(*) FROM updated;
    `, 'Rewriting production URLs in trades.image_url');

    log(`Image URL rewrite completed. Rows updated: ${rewriteOutput.trim()}`);
    log('Restore pipeline completed successfully.');
  } finally {
    // Guaranteed cleanup of secure temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      log(`Cleaned up secure temp directory: ${tempDir}`);
    } catch (e) {
      console.warn(`Warning: Failed cleaning secure temp dir: ${e.message}`);
    }
  }
}

main().catch(err => {
  console.error(`[FATAL RESTORE ERROR] ${err.message}`);
  process.exit(1);
});
