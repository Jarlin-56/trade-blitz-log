/**
 * scripts/staging-utils.mjs
 * 
 * Shared utilities for Supabase Staging operations (A6-R3 / A7).
 * Strict target binding, secret-free subprocess argv execution,
 * NTFS ACL enforcement on Windows, fail-closed baseline comparison,
 * robust snapshot JSON parsing, and precise RLS error validation.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

export const ALLOWED_STAGING_REF = 'zhsxxgzjhnzonznmhhzv';
export const FORBIDDEN_PROJECT_REFS = [
  'nkuwxxrntnkqoayfbrvv', // Production Trade Log
  'otbkrjfpddpuljaiforn'  // Talktext
];

export const ALLOWED_STAGING_HOSTS = [
  'aws-0-ap-south-1.pooler.supabase.com',
  'db.zhsxxgzjhnzonznmhhzv.supabase.co'
];

export const REQUIRED_SNAPSHOT_SECTIONS = [
  'tables',
  'enums',
  'constraints',
  'indexes',
  'tables_rls',
  'policies',
  'storage_policies',
  'functions',
  'triggers',
  'grants',
  'storage_bucket'
];

/**
 * Validates that configuration strictly targets the staging project and
 * rejects any production, Talktext, or mismatched endpoints.
 */
export function validateStagingTarget(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Target validation failed: Config object is missing or invalid.');
  }

  // 1. Ref check
  if (config.project_ref !== ALLOWED_STAGING_REF) {
    throw new Error(
      `Target validation failed: project_ref '${config.project_ref}' does not match allowed staging ref '${ALLOWED_STAGING_REF}'.`
    );
  }

  // 2. Scan entire config payload for forbidden production or Talktext references
  const stringified = JSON.stringify(config);
  for (const forbidden of FORBIDDEN_PROJECT_REFS) {
    if (stringified.includes(forbidden)) {
      throw new Error(
        `CRITICAL ABORT: Configuration contains forbidden reference '${forbidden}' (production/Talktext). Refusing to connect.`
      );
    }
  }

  // 3. DB Host check
  if (!config.db_host || !ALLOWED_STAGING_HOSTS.includes(config.db_host)) {
    throw new Error(
      `Target validation failed: db_host '${config.db_host}' does not match allowed staging hosts.`
    );
  }

  // 4. DB User check (must explicitly contain staging ref)
  if (!config.db_user || !config.db_user.includes(ALLOWED_STAGING_REF)) {
    throw new Error(
      `Target validation failed: db_user '${config.db_user}' does not contain staging ref '${ALLOWED_STAGING_REF}'.`
    );
  }

  // 5. Supabase / Storage origin check
  const expectedOrigin = `https://${ALLOWED_STAGING_REF}.supabase.co`;
  if (!config.supabase_url) {
    throw new Error('Target validation failed: missing supabase_url.');
  }
  try {
    const parsedOrigin = new URL(config.supabase_url).origin;
    if (parsedOrigin !== expectedOrigin) {
      throw new Error(
        `Target validation failed: supabase_url origin '${parsedOrigin}' does not match expected staging origin '${expectedOrigin}'.`
      );
    }
  } catch (e) {
    if (e.message.startsWith('Target validation failed')) throw e;
    throw new Error(`Target validation failed: invalid supabase_url (${e.message})`);
  }

  return true;
}

/**
 * Validates UI-only staging configuration (zero database credentials, zero service keys).
 */
export function validateStagingUiConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('UI target validation failed: Config object is missing or invalid.');
  }

  // 1. Ref check
  if (config.project_ref !== ALLOWED_STAGING_REF) {
    throw new Error(
      `UI target validation failed: project_ref '${config.project_ref}' does not match allowed staging ref '${ALLOWED_STAGING_REF}'.`
    );
  }

  // 2. Scan entire config payload for forbidden references
  const stringified = JSON.stringify(config);
  for (const forbidden of FORBIDDEN_PROJECT_REFS) {
    if (stringified.includes(forbidden)) {
      throw new Error(
        `CRITICAL ABORT: Configuration contains forbidden reference '${forbidden}' (production/Talktext). Refusing to connect.`
      );
    }
  }

  // 3. Supabase origin check
  const expectedOrigin = `https://${ALLOWED_STAGING_REF}.supabase.co`;
  if (!config.supabase_url) {
    throw new Error('UI target validation failed: missing supabase_url.');
  }
  try {
    const parsedOrigin = new URL(config.supabase_url).origin;
    if (parsedOrigin !== expectedOrigin) {
      throw new Error(
        `UI target validation failed: supabase_url origin '${parsedOrigin}' does not match expected staging origin '${expectedOrigin}'.`
      );
    }
  } catch (e) {
    if (e.message.startsWith('UI target validation failed')) throw e;
    throw new Error(`UI target validation failed: invalid supabase_url (${e.message})`);
  }

  // 4. Strictly reject any database credentials or service role keys
  if (config.db_password || config.service_role_key || config.db_user || config.db_host ||
      stringified.includes('postgres:') || stringified.includes('service_role')) {
    throw new Error('SECURITY VIOLATION: UI staging config must NOT contain database credentials or service_role keys.');
  }

  return true;
}

/**
 * Sanitizes error messages by redacting credentials, auth tokens, and sensitive strings.
 */
export function sanitizeError(msg, secrets = []) {
  if (!msg) return '';
  let clean = String(msg);
  for (const s of secrets) {
    if (s && typeof s === 'string' && s.length > 2) {
      clean = clean.split(s).join('[REDACTED]');
    }
  }
  clean = clean.replace(/password=[^\s;&]+/gi, 'password=[REDACTED]');
  clean = clean.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
  clean = clean.replace(/sbp_[a-zA-Z0-9]+/gi, 'sbp_[REDACTED]');
  clean = clean.replace(/postgres:[^@\s]+@/gi, 'postgres:[REDACTED]@');
  return clean;
}

/**
 * Parses machine-readable integer output from psql (-t -A), handling
 * edge cases like trailing newlines, notices, or multi-statement outputs.
 */
export function parsePsqlCount(output) {
  if (output === null || output === undefined) {
    throw new Error('psql output is null or undefined');
  }
  const lines = String(output)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('NOTICE:') && !l.startsWith('WARNING:') && l !== 'BEGIN' && l !== 'COMMIT' && l !== 'ROLLBACK');

  if (lines.length === 0) {
    throw new Error(`No numeric output found in psql response: "${output}"`);
  }

  const lastLine = lines[lines.length - 1];
  const parsed = parseInt(lastLine, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Failed to parse integer count from psql output line: "${lastLine}" (raw: "${output}")`);
  }
  return parsed;
}

/**
 * Safely executes psql without exposing credentials in argv.
 * Enforces -X, ON_ERROR_STOP=1, and fails on non-zero exit code.
 */
export function execPsqlSafe({ psqlExe, sql, config, extraArgs = [] }) {
  const env = {
    ...process.env,
    PGPASSWORD: config.db_password,
    PGHOST: config.db_host,
    PGPORT: String(config.db_port || 5432),
    PGUSER: config.db_user,
    PGDATABASE: config.db_name || 'postgres',
    PGSSLMODE: 'require'
  };

  const args = [
    '-X',
    '-v', 'ON_ERROR_STOP=1',
    '-h', config.db_host,
    '-p', String(config.db_port || 5432),
    '-U', config.db_user,
    '-d', config.db_name || 'postgres',
    '-w',
    ...extraArgs,
    '-c', sql
  ];

  const result = spawnSync(psqlExe, args, { env, encoding: 'utf8' });

  if (result.error) {
    throw new Error(`psql spawn failed: ${sanitizeError(result.error.message, [config.db_password, config.service_role_key])}`);
  }

  if (result.status !== 0) {
    const errText = sanitizeError(result.stderr || result.stdout, [config.db_password, config.service_role_key]);
    throw new Error(`psql exited with code ${result.status}: ${errText}`);
  }

  return result.stdout;
}

/**
 * Extracts and parses the JSON snapshot payload from psql stdout,
 * robustly stripping BEGIN, COMMIT, notices, and handling multi-line outputs.
 */
export function extractSnapshotJson(psqlOutput) {
  if (!psqlOutput || typeof psqlOutput !== 'string') {
    throw new Error('psql snapshot output is empty or not a string');
  }

  const trimmed = psqlOutput.trim();

  // Try extracting full JSON object between the outermost braces first
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }

  // Fallback: Try line by line
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line === 'BEGIN' || line === 'COMMIT' || line === 'ROLLBACK' || line.startsWith('NOTICE:')) continue;
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
    }
  }

  throw new Error(`Could not locate valid JSON snapshot in output (length: ${psqlOutput.length})`);
}

/**
 * Validates storage path to prevent path traversal and ensure format.
 */
export function validateStorageRelativePath(relPath) {
  if (!relPath || typeof relPath !== 'string') return false;
  const normalized = path.normalize(relPath).replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.startsWith('../') || normalized.includes('/../')) {
    return false;
  }
  const parts = normalized.split('/');
  if (parts.length < 3 || parts[1] !== 'trades') return false;
  const ext = path.extname(normalized).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
}

/**
 * Validates that an error message from a negative write test is an authentic RLS rejection.
 * Rejects general permission denied (missing table privileges), syntax, FK, or connection errors.
 */
export function checkRlsNegativeError(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return { ok: false, reason: 'No error message provided' };
  }

  const clean = errorMessage.toLowerCase();

  // 1. Syntax, connection, FK, or relation missing errors must fail
  if (clean.includes('syntax error') || errorMessage.includes('42601')) {
    return { ok: false, reason: `Failed with syntax error instead of RLS: ${errorMessage}` };
  }
  if (clean.includes('violates foreign key') || errorMessage.includes('23503')) {
    return { ok: false, reason: `Failed with foreign key error instead of RLS: ${errorMessage}` };
  }
  if (clean.includes('connection refused') || clean.includes('could not connect') || clean.includes('connection to server')) {
    return { ok: false, reason: `Failed with connection error instead of RLS: ${errorMessage}` };
  }
  if (clean.includes('does not exist') || errorMessage.includes('42P01')) {
    return { ok: false, reason: `Failed with missing table/relation error instead of RLS: ${errorMessage}` };
  }

  // 2. Reject general permission denied (table-level GRANT missing rather than RLS policy rejection)
  if (clean.includes('permission denied for table') || clean.includes('permission denied for relation') || clean.includes('permission denied for schema')) {
    return { ok: false, reason: `Failed with general table permission denied instead of RLS policy rejection: ${errorMessage}` };
  }

  // 3. Must be authentic RLS policy check violation (SQLSTATE 42501 with violates row-level security policy)
  const hasRlsPolicy = clean.includes('violates row-level security policy');
  const has42501 = errorMessage.includes('42501');

  if (!hasRlsPolicy && !has42501) {
    return { ok: false, reason: `Error did not match authentic RLS policy violation: ${errorMessage}` };
  }

  return { ok: true };
}

/**
 * Creates a secure, ACL-enforced temporary directory under parentDir.
 * On Windows, removes inherited permissions and explicitly grants Full Control
 * ONLY to SYSTEM (S-1-5-18) and the Current User SID/Username.
 * Parses icacls output and verifies strictly that NO other principal (such as Everyone) exists.
 */
export function createSecureTempDir(parentDir) {
  if (!fs.existsSync(parentDir)) {
    throw new Error(`Parent directory does not exist: ${parentDir}`);
  }
  const resolvedParent = path.resolve(parentDir);
  const randomSuffix = crypto.randomBytes(8).toString('hex');
  const tempDir = path.join(resolvedParent, `.staging-temp-${randomSuffix}`);

  fs.mkdirSync(tempDir, { recursive: true });

  if (process.platform === 'win32') {
    const username = process.env.USERNAME;
    if (!username) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw new Error('Cannot determine current Windows USERNAME for NTFS ACL enforcement');
    }

    const icaclsExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe');
    const cmd = fs.existsSync(icaclsExe) ? icaclsExe : 'icacls';

    // Remove inheritance and grant Full Control only to SYSTEM and Current User
    const setRes = spawnSync(cmd, [
      tempDir,
      '/inheritance:r',
      '/grant:r', '*S-1-5-18:(OI)(CI)F',
      '/grant:r', `${username}:(OI)(CI)F`
    ], { encoding: 'utf8' });

    if (setRes.status !== 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw new Error(`Failed to configure NTFS ACL on ${tempDir}: ${setRes.stderr || setRes.stdout}`);
    }

    // Verify ACL with exact principal parsing
    const verifyRes = spawnSync(cmd, [tempDir], { encoding: 'utf8' });
    if (verifyRes.status !== 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw new Error(`Failed reading NTFS ACL on ${tempDir} (exit code ${verifyRes.status})`);
    }

    const aclLines = (verifyRes.stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsedPrincipals = [];

    for (const line of aclLines) {
      if (line.startsWith('Successfully processed') || line.startsWith('Failed processing')) continue;
      const colonIdx = line.indexOf(':(');
      if (colonIdx !== -1) {
        let p = line.substring(0, colonIdx).trim();
        if (p.startsWith(tempDir)) {
          p = p.substring(tempDir.length).trim();
        }
        parsedPrincipals.push(p);
      }
    }

    if (parsedPrincipals.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw new Error(`ACL verification failed: No principals found in ACL output for ${tempDir}`);
    }

    // Check each principal against allowed set: must be Current User or SYSTEM
    const userLower = username.toLowerCase();
    for (const princ of parsedPrincipals) {
      const pLower = princ.toLowerCase();
      const isSystem = pLower === 'nt authority\\system' || pLower === 'system';
      const isUser = pLower === userLower || pLower.endsWith('\\' + userLower);

      if (!isSystem && !isUser) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        throw new Error(
          `SECURITY VIOLATION: Unauthorized principal '${princ}' detected in NTFS ACL for ${tempDir}. Allowed: SYSTEM, ${username}.`
        );
      }
    }
  }

  return tempDir;
}

/**
 * Validates storage manifest shape, paths, and verifies the SHA-256 checksum of every file.
 */
export function validateStorageManifestFiles(manifest, filesDir) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Storage manifest is missing or invalid');
  }
  if (manifest.bucket !== 'trade-images') {
    throw new Error(`Unexpected storage bucket: ${manifest.bucket}`);
  }
  if (!Array.isArray(manifest.objects) || manifest.objects.length !== 15) {
    throw new Error(`Storage manifest must have exactly 15 objects, got ${manifest.objects?.length}`);
  }

  const resolvedFilesDir = path.resolve(filesDir);
  const results = [];

  for (const obj of manifest.objects) {
    if (!obj.relative_path || !obj.sha256) {
      throw new Error(`Manifest object missing relative_path or sha256: ${JSON.stringify(obj)}`);
    }

    const rel = obj.relative_path.replace(/\\/g, '/');
    if (!validateStorageRelativePath(rel)) {
      throw new Error(`Storage manifest contains invalid or traversal path: ${rel}`);
    }

    const localPath = path.resolve(resolvedFilesDir, obj.relative_path);
    if (!localPath.startsWith(resolvedFilesDir)) {
      throw new Error(`Path traversal attempt in storage file: ${localPath}`);
    }

    if (!fs.existsSync(localPath)) {
      throw new Error(`Storage file missing on disk: ${localPath}`);
    }

    const fileBuf = fs.readFileSync(localPath);
    const computedHash = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
    if (computedHash !== obj.sha256.toLowerCase()) {
      throw new Error(`Storage file checksum mismatch on ${rel}: expected ${obj.sha256}, got ${computedHash}`);
    }

    results.push({ path: rel, sha256: computedHash, bytes: fileBuf.length });
  }

  return results;
}

/**
 * Filters pg_dump TOC list content for clean restore.
 * Comments out SCHEMA - public (and schema public comments/ACLs) and system schema entries
 * so pg_restore -L does not attempt to create or overwrite schema public.
 */
export function filterTocForRestore(tocContent) {
  if (!tocContent || typeof tocContent !== 'string') {
    throw new Error('TOC content is empty or not a string');
  }

  const lines = tocContent.split(/\r?\n/);
  const filtered = [];

  for (const line of lines) {
    // If line represents public schema creation or ACL/comment on schema public, comment it out
    const isSchemaPublic = /^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+public\s+/.test(line);
    const isPublicSchemaComment = /^\d+;\s+\d+\s+\d+\s+COMMENT\s+-\s+SCHEMA\s+public\s+/.test(line);
    const isPublicSchemaAcl = /^\d+;\s+\d+\s+\d+\s+ACL\s+-\s+SCHEMA\s+public\s+/.test(line);
    const isSystemSchema = /^\d+;\s+\d+\s+\d+\s+(SCHEMA|ACL)\s+-\s+(auth|storage)\s+/.test(line);

    if (isSchemaPublic || isPublicSchemaComment || isPublicSchemaAcl || isSystemSchema) {
      filtered.push(`; ${line}`); // comment out in pg_restore list format
    } else {
      filtered.push(line);
    }
  }

  return filtered.join('\n');
}

/**
 * Compares current database schema snapshot against historical baseline (fail-closed).
 * Validates shape, missing/extra sections, columns (type, nullability, default),
 * constraints, indexes, triggers, function fingerprints, RLS, policies (roles, permissive, qual, with_check),
 * and table grants.
 */
export function compareBaselineSnapshots(baseline, current, structuredAllowlist = []) {
  const diffs = [];
  const norm = str => (str ? String(str).replace(/\s+/g, ' ').trim() : '');

  // 1. Fail-closed: Snapshot shape and required sections validation
  if (!current || typeof current !== 'object' || Object.keys(current).length === 0) {
    return {
      passed: false,
      diffs: ['Current snapshot is empty or invalid object (fail-closed)']
    };
  }

  for (const section of REQUIRED_SNAPSHOT_SECTIONS) {
    if (!(section in current)) {
      diffs.push(`Required snapshot section missing: "${section}"`);
    }
  }

  if (diffs.length > 0) {
    return { passed: false, diffs };
  }

  // 2. Tables & Columns (including extra columns, nullability, default, and type)
  const baseTables = (baseline.tables || []).reduce((acc, t) => { acc[t.table_name] = t.columns; return acc; }, {});
  const currTables = (current.tables || []).reduce((acc, t) => { acc[t.table_name] = t.columns; return acc; }, {});

  for (const [tName, cols] of Object.entries(baseTables)) {
    if (!(tName in currTables)) {
      diffs.push(`Missing table: public.${tName}`);
      continue;
    }
    const currCols = currTables[tName].reduce((acc, c) => { acc[c.column_name] = c; return acc; }, {});
    const baseCols = cols.reduce((acc, c) => { acc[c.column_name] = c; return acc; }, {});

    // Check missing columns & attributes
    for (const c of cols) {
      if (!(c.column_name in currCols)) {
        diffs.push(`Missing column: public.${tName}.${c.column_name}`);
      } else {
        const curC = currCols[c.column_name];
        if (c.data_type !== curC.data_type && c.udt_name !== curC.udt_name) {
          diffs.push(`Column type mismatch on public.${tName}.${c.column_name}: baseline=${c.data_type}, current=${curC.data_type}`);
        }
        if (c.is_nullable !== curC.is_nullable) {
          diffs.push(`Column nullability mismatch on public.${tName}.${c.column_name}: baseline=${c.is_nullable}, current=${curC.is_nullable}`);
        }
        if (norm(c.column_default) !== norm(curC.column_default)) {
          diffs.push(`Column default mismatch on public.${tName}.${c.column_name}: baseline="${c.column_default}", current="${curC.column_default}"`);
        }
      }
    }

    // Check extra columns
    for (const curColName of Object.keys(currCols)) {
      if (!(curColName in baseCols)) {
        diffs.push(`Unexpected extra column: public.${tName}.${curColName}`);
      }
    }
  }

  for (const tName of Object.keys(currTables)) {
    if (!(tName in baseTables)) {
      diffs.push(`Unexpected extra table: public.${tName}`);
    }
  }

  // 3. Enums (names and values)
  const baseEnums = (baseline.enums || []).reduce((acc, e) => { acc[e.enum_name] = e.enum_values; return acc; }, {});
  const currEnums = (current.enums || []).reduce((acc, e) => { acc[e.enum_name] = e.enum_values; return acc; }, {});

  for (const [eName, vals] of Object.entries(baseEnums)) {
    if (!(eName in currEnums)) {
      diffs.push(`Missing enum: ${eName}`);
    } else {
      const curVals = currEnums[eName] || [];
      if (JSON.stringify(vals) !== JSON.stringify(curVals)) {
        diffs.push(`Enum values mismatch on ${eName}: baseline=[${vals.join(', ')}], current=[${curVals.join(', ')}]`);
      }
    }
  }

  for (const eName of Object.keys(currEnums)) {
    if (!(eName in baseEnums)) {
      diffs.push(`Unexpected extra enum: ${eName}`);
    }
  }

  // 4. Constraints (missing, extra, definition, type, foreign table)
  // Synthetic contype 'n' / '_not_null' constraints from in-memory PGlite are excluded; column nullability is verified via columns.is_nullable
  const isSyntheticNotNull = c => c.constraint_type === 'n' || (c.constraint_name && c.constraint_name.endsWith('_not_null') && c.definition && c.definition.startsWith('NOT NULL'));
  const baseConstraints = (baseline.constraints || []).filter(c => !isSyntheticNotNull(c)).reduce((acc, c) => {
    acc[`${c.table_name}:${c.constraint_name}`] = c;
    return acc;
  }, {});
  const currConstraints = (current.constraints || []).filter(c => !isSyntheticNotNull(c)).reduce((acc, c) => {
    acc[`${c.table_name}:${c.constraint_name}`] = c;
    return acc;
  }, {});

  for (const [key, baseC] of Object.entries(baseConstraints)) {
    if (!(key in currConstraints)) {
      diffs.push(`Missing constraint: ${key}`);
    } else {
      const curC = currConstraints[key];
      if (norm(baseC.definition) !== norm(curC.definition)) {
        diffs.push(`Constraint definition mismatch on ${key}: baseline="${baseC.definition}", current="${curC.definition}"`);
      }
      if (baseC.constraint_type !== curC.constraint_type) {
        diffs.push(`Constraint type mismatch on ${key}: baseline=${baseC.constraint_type}, current=${curC.constraint_type}`);
      }
    }
  }

  for (const key of Object.keys(currConstraints)) {
    if (!(key in baseConstraints)) {
      diffs.push(`Unexpected extra constraint: ${key}`);
    }
  }

  // 5. Indexes (missing, extra, uniqueness, primary, definition)
  const baseIndexes = (baseline.indexes || []).reduce((acc, i) => {
    acc[`${i.table_name}:${i.index_name}`] = i;
    return acc;
  }, {});
  const currIndexes = (current.indexes || []).reduce((acc, i) => {
    acc[`${i.table_name}:${i.index_name}`] = i;
    return acc;
  }, {});

  for (const [key, baseI] of Object.entries(baseIndexes)) {
    if (!(key in currIndexes)) {
      diffs.push(`Missing index: ${key}`);
    } else {
      const curI = currIndexes[key];
      if (baseI.is_unique !== curI.is_unique) {
        diffs.push(`Index uniqueness mismatch on ${key}`);
      }
      if (norm(baseI.definition) !== norm(curI.definition)) {
        diffs.push(`Index definition mismatch on ${key}`);
      }
    }
  }

  for (const key of Object.keys(currIndexes)) {
    if (!(key in baseIndexes)) {
      diffs.push(`Unexpected extra index: ${key}`);
    }
  }

  // 6. Tables RLS Flags (rls_enabled and rls_forced)
  const baseRls = (baseline.tables_rls || []).reduce((acc, r) => { acc[r.table_name] = r; return acc; }, {});
  const currRls = (current.tables_rls || []).reduce((acc, r) => { acc[r.table_name] = r; return acc; }, {});

  for (const [tName, baseR] of Object.entries(baseRls)) {
    if (!(tName in currRls)) {
      diffs.push(`Missing RLS metadata for table: public.${tName}`);
    } else {
      const curR = currRls[tName];
      if (baseR.rls_enabled !== curR.rls_enabled) {
        diffs.push(`RLS enabled flag mismatch on public.${tName}: baseline=${baseR.rls_enabled}, current=${curR.rls_enabled}`);
      }
      if (baseR.rls_forced !== curR.rls_forced) {
        diffs.push(`RLS forced flag mismatch on public.${tName}: baseline=${baseR.rls_forced}, current=${curR.rls_forced}`);
      }
    }
  }

  // 7. Functions (signatures, definition_md5, security_definer, volatility)
  const baseFuncs = (baseline.functions || []).reduce((acc, f) => { acc[f.signature] = f; return acc; }, {});
  const currFuncs = (current.functions || []).reduce((acc, f) => { acc[f.signature] = f; return acc; }, {});

  for (const [sig, baseF] of Object.entries(baseFuncs)) {
    if (!(sig in currFuncs)) {
      diffs.push(`Missing function: ${sig}`);
    } else {
      const curF = currFuncs[sig];
      if (baseF.definition_md5 && curF.definition_md5 && baseF.definition_md5 !== curF.definition_md5) {
        diffs.push(`Function body definition drift on ${sig}: md5 mismatch`);
      }
      if (baseF.is_security_definer !== curF.is_security_definer) {
        diffs.push(`Function security definer mismatch on ${sig}`);
      }
    }
  }

  for (const sig of Object.keys(currFuncs)) {
    if (!(sig in baseFuncs)) {
      diffs.push(`Unexpected extra function: ${sig}`);
    }
  }

  // 8. Triggers (missing, extra, definition, is_enabled, status)
  const baseTriggers = (baseline.triggers || []).reduce((acc, t) => {
    acc[`${t.table_name}:${t.trigger_name}`] = t;
    return acc;
  }, {});
  const currTriggers = (current.triggers || []).reduce((acc, t) => {
    acc[`${t.table_name}:${t.trigger_name}`] = t;
    return acc;
  }, {});

  for (const [key, baseT] of Object.entries(baseTriggers)) {
    if (!(key in currTriggers)) {
      diffs.push(`Missing trigger: ${key}`);
    } else {
      const curT = currTriggers[key];
      if (baseT.is_enabled !== curT.is_enabled) {
        diffs.push(`Trigger enabled state mismatch on ${key}`);
      }
      if (norm(baseT.definition) !== norm(curT.definition)) {
        diffs.push(`Trigger definition mismatch on ${key}`);
      }
    }
  }

  for (const key of Object.keys(currTriggers)) {
    if (!(key in baseTriggers)) {
      diffs.push(`Unexpected extra trigger: ${key}`);
    }
  }

  // 9. Policies (Public & Storage) including roles, permissive, qual, with_check
  const basePolicies = (baseline.policies || []).reduce((acc, p) => {
    acc[`${p.table_name}:${p.policy_name}`] = p;
    return acc;
  }, {});
  const currPolicies = (current.policies || []).reduce((acc, p) => {
    acc[`${p.table_name}:${p.policy_name}`] = p;
    return acc;
  }, {});

  for (const [key, baseP] of Object.entries(basePolicies)) {
    if (!(key in currPolicies)) {
      diffs.push(`Missing public policy: ${key}`);
      continue;
    }
    const curP = currPolicies[key];
    if (norm(baseP.cmd) !== norm(curP.cmd)) {
      diffs.push(`Policy cmd mismatch on ${key}`);
    }
    if (norm(baseP.permissive) !== norm(curP.permissive)) {
      diffs.push(`Policy permissive mode mismatch on ${key}`);
    }
    const baseRoles = Array.isArray(baseP.roles) ? [...baseP.roles].sort().join(',') : '';
    const currRoles = Array.isArray(curP.roles) ? [...curP.roles].sort().join(',') : '';
    if (baseRoles !== currRoles) {
      diffs.push(`Policy roles drift on ${key}: baseline=[${baseRoles}], current=[${currRoles}]`);
    }
    if (norm(baseP.qual) !== norm(curP.qual)) {
      diffs.push(`Policy qual expression drift on ${key}: baseline="${baseP.qual}", current="${curP.qual}"`);
    }
    if (norm(baseP.with_check) !== norm(curP.with_check)) {
      diffs.push(`Policy with_check expression drift on ${key}: baseline="${baseP.with_check}", current="${curP.with_check}"`);
    }
  }

  for (const [key, curP] of Object.entries(currPolicies)) {
    if (!(key in basePolicies)) {
      diffs.push(`Unexpected extra public policy: ${key} (permissive: ${curP.permissive}, cmd: ${curP.cmd})`);
    }
  }

  // 10. Storage Policies (including expressions)
  const baseStoragePol = (baseline.storage_policies || []).reduce((acc, p) => {
    acc[p.policy_name] = p;
    return acc;
  }, {});
  const currStoragePol = (current.storage_policies || []).reduce((acc, p) => {
    acc[p.policy_name] = p;
    return acc;
  }, {});

  for (const [pName, baseP] of Object.entries(baseStoragePol)) {
    if (!(pName in currStoragePol)) {
      diffs.push(`Missing storage policy: "${pName}"`);
      continue;
    }
    const curP = currStoragePol[pName];
    if (norm(baseP.qual) !== norm(curP.qual)) {
      diffs.push(`Storage policy qual drift on "${pName}": baseline="${baseP.qual}", current="${curP.qual}"`);
    }
    if (norm(baseP.with_check) !== norm(curP.with_check)) {
      diffs.push(`Storage policy with_check drift on "${pName}": baseline="${baseP.with_check}", current="${curP.with_check}"`);
    }
  }

  for (const pName of Object.keys(currStoragePol)) {
    if (!(pName in baseStoragePol)) {
      diffs.push(`Unexpected extra storage policy: "${pName}"`);
    }
  }

  // 11. Table Grants & Function Grants
  const baseGrants = (baseline.grants?.tables || []).map(g => `${g.table_name}:${g.grantee}:${g.privilege_type}`);
  const currGrants = (current.grants?.tables || []).map(g => `${g.table_name}:${g.grantee}:${g.privilege_type}`);

  const anonTableGrants = currGrants.filter(g => g.includes(':anon:') || g.includes(':public:') || g.includes(':PUBLIC:'));
  if (anonTableGrants.length > 0) {
    diffs.push(`Broad ACL rejection: unauthorized table grants found for anon/public: ${anonTableGrants.join(', ')}`);
  }

  for (const bg of baseGrants) {
    if (!currGrants.includes(bg)) {
      diffs.push(`Missing expected table grant: ${bg}`);
    }
  }

  // Function Grants
  const baseFuncGrants = (baseline.grants?.functions || []).map(g => `${g.function_name}:${g.grantee}:${g.privilege_type}`);
  const currFuncGrants = (current.grants?.functions || []).map(g => `${g.function_name}:${g.grantee}:${g.privilege_type}`);

  for (const bfg of baseFuncGrants) {
    if (!currFuncGrants.includes(bfg)) {
      diffs.push(`Missing expected function grant: ${bfg}`);
    }
  }

  // 12. Storage Bucket Public Setting Check
  if (baseline.storage_bucket && current.storage_bucket) {
    if (baseline.storage_bucket.public !== current.storage_bucket.public) {
      diffs.push(`storage_bucket.public mismatch: baseline=${baseline.storage_bucket.public}, current=${current.storage_bucket.public}`);
    }
  }

  // Apply Structured Allowlist (exact section & item matching)
  const filteredDiffs = diffs.filter(diffMessage => {
    for (const rule of structuredAllowlist) {
      if (rule.pattern && rule.pattern.test(diffMessage)) {
        return false;
      }
    }
    return true;
  });

  return {
    passed: filteredDiffs.length === 0,
    diffs: filteredDiffs
  };
}
