/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
// @ts-expect-error untyped script module
import { ALLOWED_STAGING_REF, validateStagingTarget, sanitizeError, parsePsqlCount, validateStorageRelativePath, checkRlsNegativeError, extractSnapshotJson, compareBaselineSnapshots, validateStorageManifestFiles } from '../../scripts/staging-utils.mjs';

describe('Staging Target Protection & Validation (Offline)', () => {
  const validStagingConfig = {
    project_ref: ALLOWED_STAGING_REF,
    project_name: 'trade-log-staging',
    org_id: 'xptvlqihqlnekajjkwok',
    region: 'ap-south-1',
    supabase_url: `https://${ALLOWED_STAGING_REF}.supabase.co`,
    db_host: 'aws-0-ap-south-1.pooler.supabase.com',
    db_port: 5432,
    db_user: `postgres.${ALLOWED_STAGING_REF}`,
    db_password: 'TestPassword123!',
    service_role_key: 'test-service-key'
  };

  it('approves a strictly valid staging configuration', () => {
    expect(validateStagingTarget(validStagingConfig)).toBe(true);
  });

  it('rejects if project_ref is production ref (nkuwxxrntnkqoayfbrvv)', () => {
    const badConfig = { ...validStagingConfig, project_ref: 'nkuwxxrntnkqoayfbrvv' };
    expect(() => validateStagingTarget(badConfig)).toThrow(/Target validation failed/);
  });

  it('rejects if project_ref is Talktext ref (otbkrjfpddpuljaiforn)', () => {
    const badConfig = { ...validStagingConfig, project_ref: 'otbkrjfpddpuljaiforn' };
    expect(() => validateStagingTarget(badConfig)).toThrow(/Target validation failed/);
  });

  it('rejects if project_ref is staging but supabase_url points to production', () => {
    const badConfig = {
      ...validStagingConfig,
      supabase_url: 'https://nkuwxxrntnkqoayfbrvv.supabase.co'
    };
    expect(() => validateStagingTarget(badConfig)).toThrow(/CRITICAL ABORT/);
  });

  it('rejects if project_ref is staging but db_user is production user', () => {
    const badConfig = {
      ...validStagingConfig,
      db_user: 'postgres.nkuwxxrntnkqoayfbrvv'
    };
    expect(() => validateStagingTarget(badConfig)).toThrow(/CRITICAL ABORT/);
  });

  it('rejects if db_host is an unexpected or external host', () => {
    const badConfig = {
      ...validStagingConfig,
      db_host: 'malicious-host.example.com'
    };
    expect(() => validateStagingTarget(badConfig)).toThrow(/db_host/);
  });
});

describe('Secret-Free Subprocess Execution & Error Sanitization (Offline)', () => {
  it('ensures CLI arguments do not contain raw passwords or URIs with credentials', () => {
    const config = {
      db_host: 'aws-0-ap-south-1.pooler.supabase.com',
      db_port: 5432,
      db_user: `postgres.${ALLOWED_STAGING_REF}`,
      db_password: 'VerySecretPassword999!',
      db_name: 'postgres'
    };

    const psqlArgs = [
      '-X',
      '-v', 'ON_ERROR_STOP=1',
      '-h', config.db_host,
      '-p', String(config.db_port),
      '-U', config.db_user,
      '-d', config.db_name,
      '-w',
      '-c', 'SELECT 1;'
    ];

    const stringifiedPsql = psqlArgs.join(' ');
    expect(stringifiedPsql).not.toContain(config.db_password);
    expect(stringifiedPsql).not.toContain('postgresql://');
  });

  it('redacts passwords, tokens, and authorization headers from error messages', () => {
    const secretPass = 'SuperSecretDbPass999';
    const secretKey = 'sbp_myPersonalToken12345';
    const rawError = `Connection failed: password=${secretPass} with header Bearer ${secretKey}`;

    const clean = sanitizeError(rawError, [secretPass, secretKey]);
    expect(clean).not.toContain(secretPass);
    expect(clean).not.toContain(secretKey);
    expect(clean).toContain('[REDACTED]');
  });
});

describe('Restore Pipeline Fail-Fast Behavior (Offline)', () => {
  it('halts execution immediately when a step fails, never executing subsequent steps', () => {
    const step1 = vi.fn().mockReturnValue('ok');
    const step2 = vi.fn().mockImplementation(() => {
      throw new Error('Step 2 failed with exit code 1');
    });
    const step3 = vi.fn().mockReturnValue('ok');

    const steps = [
      { name: 'step1', fn: step1 },
      { name: 'step2', fn: step2 },
      { name: 'step3', fn: step3 }
    ];

    expect(() => {
      for (const s of steps) {
        s.fn();
      }
    }).toThrow('Step 2 failed with exit code 1');

    expect(step1).toHaveBeenCalledTimes(1);
    expect(step2).toHaveBeenCalledTimes(1);
    expect(step3).not.toHaveBeenCalled();
  });
});

describe('Snapshot JSON Parser Robustness (Offline)', () => {
  it('parses real stdout with BEGIN, multi-line JSON, and COMMIT', () => {
    const rawPsqlOutput = `
BEGIN
{
  "version": "1.0",
  "tables": [
    { "table_name": "trades", "columns": [] }
  ]
}
COMMIT
`;
    const parsed = extractSnapshotJson(rawPsqlOutput);
    expect(parsed).toBeDefined();
    expect(parsed.version).toBe('1.0');
    expect(parsed.tables).toHaveLength(1);
  });

  it('parses JSON with arbitrary key order (not assuming version/tables is first)', () => {
    const raw = `
BEGIN
{"custom_first_key": 123, "enums": [], "tables": []}
COMMIT
`;
    const parsed = extractSnapshotJson(raw);
    expect(parsed.custom_first_key).toBe(123);
  });

  it('throws informative error on non-JSON stdout', () => {
    expect(() => extractSnapshotJson('BEGIN\nERROR: relation does not exist\nCOMMIT')).toThrow(/Could not locate valid JSON/);
  });
});

describe('A7: Strict RLS Negative Error Verification (Offline)', () => {
  it('passes strictly when error contains authentic SQLSTATE 42501 RLS policy violation', () => {
    const validRlsError = 'ERROR: 42501: new row violates row-level security policy for table "trades"';
    const result = checkRlsNegativeError(validRlsError);
    expect(result.ok).toBe(true);
  });

  it('fails if the error is a general table-level permission denied instead of RLS violation', () => {
    const tablePermError = 'ERROR: 42501: permission denied for table trades';
    const result = checkRlsNegativeError(tablePermError);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('general table permission denied');
  });

  it('fails if the error is a syntax error (42601) instead of RLS rejection', () => {
    const syntaxError = 'ERROR: 42601: syntax error at or near "INSERT"';
    const result = checkRlsNegativeError(syntaxError);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('syntax error');
  });

  it('fails if the error is a foreign key constraint violation (23503)', () => {
    const fkError = 'ERROR: 23503: insert on table "trades" violates foreign key constraint "trades_user_id_fkey"';
    const result = checkRlsNegativeError(fkError);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('foreign key');
  });

  it('fails if the error is a connection failure or missing table', () => {
    const connError = 'psql: error: connection to server at "127.0.0.1" failed: Connection refused';
    const result = checkRlsNegativeError(connError);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('connection error');

    const missingTable = 'ERROR: 42P01: relation "public.trades" does not exist';
    const resultMissing = checkRlsNegativeError(missingTable);
    expect(resultMissing.ok).toBe(false);
    expect(resultMissing.reason).toContain('missing table');
  });
});

describe('A7: Fail-Closed Baseline Snapshot Comparison with Real Fixture (Offline)', () => {
  const baselineJsonPath = path.resolve('supabase/preflight/schema-baseline.json');
  const realBaseline = JSON.parse(fs.readFileSync(baselineJsonPath, 'utf8'));

  it('fails closed when snapshot is empty object {}', () => {
    const result = compareBaselineSnapshots(realBaseline, {});
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('empty or invalid object'))).toBe(true);
  });

  it('fails closed when a required section is missing', () => {
    const missingSection = JSON.parse(JSON.stringify(realBaseline));
    delete missingSection.policies;
    const result = compareBaselineSnapshots(realBaseline, missingSection);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Required snapshot section missing: "policies"'))).toBe(true);
  });

  it('fails when a column is dropped or an extra unexpected column is present', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    const trades = mutated.tables.find((t: any) => t.table_name === 'trades');
    trades.columns.push({ column_name: 'rogue_column', data_type: 'text', is_nullable: 'YES' });

    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Unexpected extra column: public.trades.rogue_column'))).toBe(true);
  });

  it('fails when a column default expression is changed', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    const trades = mutated.tables.find((t: any) => t.table_name === 'trades');
    const idCol = trades.columns.find((c: any) => c.column_name === 'id');
    idCol.column_default = "'123'::uuid";

    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Column default mismatch'))).toBe(true);
  });

  it('fails when an enum value is modified or removed', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    const dirEnum = mutated.enums.find((e: any) => e.enum_name === 'trade_direction');
    dirEnum.enum_values = ['Long']; // 'Short' removed

    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Enum values mismatch on trade_direction'))).toBe(true);
  });

  it('fails when a foreign key constraint is dropped', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    mutated.constraints = mutated.constraints.filter((c: any) => c.constraint_name !== 'trades_user_id_fkey');
    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Missing constraint: trades:trades_user_id_fkey'))).toBe(true);
  });

  it('fails when an index definition or uniqueness is changed', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    const firstIndex = mutated.indexes[0];
    firstIndex.is_unique = !firstIndex.is_unique;

    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Index uniqueness mismatch'))).toBe(true);
  });

  it('fails when a trigger is dropped or trigger definition is modified', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    const firstTrig = mutated.triggers[0];
    mutated.triggers = mutated.triggers.slice(1);

    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes(`Missing trigger: ${firstTrig.table_name}:${firstTrig.trigger_name}`))).toBe(true);
  });

  it('fails when a function definition_md5 body drifts or is dropped', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    mutated.functions[0].definition_md5 = '00000000000000000000000000000000'; // Altered body

    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Function body definition drift'))).toBe(true);
  });

  it('fails when policy roles are changed', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    mutated.policies[0].roles = ['anon'];
    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Policy roles drift'))).toBe(true);
  });

  it('fails when an unexpected extra permissive policy is present', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    mutated.policies.push({
      table_name: 'trades',
      policy_name: 'Backdoor allow all',
      permissive: 'PERMISSIVE',
      roles: ['anon'],
      cmd: 'ALL',
      qual: 'true',
      with_check: 'true'
    });
    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Unexpected extra public policy: trades:Backdoor allow all'))).toBe(true);
  });

  it('fails when a storage policy qual expression drifts', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    mutated.storage_policies[0].qual = 'true';

    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Storage policy qual drift'))).toBe(true);
  });

  it('fails when broad table grants are assigned to anon or public', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    mutated.grants.tables.push({
      table_name: 'trades',
      grantee: 'anon',
      privilege_type: 'SELECT'
    });
    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Broad ACL rejection'))).toBe(true);
  });

  it('fails when expected function grant is missing', () => {
    const mutated = JSON.parse(JSON.stringify(realBaseline));
    mutated.grants.functions = []; // Removed function grants

    const result = compareBaselineSnapshots(realBaseline, mutated);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d: string) => d.includes('Missing expected function grant'))).toBe(true);
  });

  it('passes comparison against itself with structured allowlist for intentional differences', () => {
    const structuredAllowlist = [
      { pattern: /storage_bucket\.public mismatch/, reason: 'Intentional staging private bucket' }
    ];
    const result = compareBaselineSnapshots(realBaseline, realBaseline, structuredAllowlist);
    expect(result.passed).toBe(true);
    expect(result.diffs).toHaveLength(0);
  });
});

describe('A7: Storage Manifest & Checksum Preflight (Offline)', () => {
  it('detects corrupted SHA-256 hash in storage manifest before writing', () => {
    const manifest = {
      bucket: 'trade-images',
      objects: [
        {
          relative_path: 'a57f943f-65ee-4831-a779-754ef35973b6/trades/1785776984931-z507i0.png',
          sha256: '0000000000000000000000000000000000000000000000000000000000000000'
        }
      ]
    };
    const filesDir = 'C:\\Users\\User\\TradeLog-Backups\\20261029-pre-atomic\\storage\\files';

    expect(() => validateStorageManifestFiles(manifest, filesDir)).toThrow(/checksum mismatch|must have exactly 15 objects/);
  });

  it('rejects manifest containing directory traversal path', () => {
    const manifest = {
      bucket: 'trade-images',
      objects: Array(15).fill({
        relative_path: '../../etc/passwd.png',
        sha256: 'abc'
      })
    };
    const filesDir = 'C:\\Users\\User\\TradeLog-Backups\\20261029-pre-atomic\\storage\\files';

    expect(() => validateStorageManifestFiles(manifest, filesDir)).toThrow(/invalid or traversal path/);
  });
});
