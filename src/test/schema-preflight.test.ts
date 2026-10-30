// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ColumnMeta {
  column_name: string;
  ordinal_position: number;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

export interface TableMeta {
  table_name: string;
  columns: ColumnMeta[];
}

export interface EnumMeta {
  enum_name: string;
  enum_values: string[];
}

export interface ConstraintMeta {
  constraint_name: string;
  table_name: string;
  constraint_type: string;
  definition: string;
  foreign_table: string | null;
}

export interface IndexMeta {
  table_name: string;
  index_name: string;
  is_unique: boolean;
  is_primary: boolean;
  definition: string;
}

export interface TableRlsMeta {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
}

export interface PolicyMeta {
  table_name: string;
  policy_name: string;
  permissive: 'PERMISSIVE' | 'RESTRICTIVE';
  roles: string[];
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

export interface FunctionMeta {
  function_name: string;
  identity_arguments: string;
  signature: string;
  return_type: string;
  is_security_definer: boolean;
  volatility: string;
  search_path: string | null;
  definition_md5: string;
  language: string;
}

export interface TriggerMeta {
  table_name: string;
  trigger_name: string;
  definition: string;
  is_enabled: boolean;
  status: string;
}

export interface TableGrantMeta {
  table_name: string;
  grantee: string;
  privilege_type: string;
  is_grantable: string;
}

export interface FunctionGrantMeta {
  function_name: string;
  signature: string;
  grantee: string;
  privilege_type: string;
  is_grantable: string;
}

export interface GrantsMeta {
  tables: TableGrantMeta[];
  functions: FunctionGrantMeta[];
}

export interface StorageBucketMeta {
  bucket_exists: boolean;
  id: string;
  name: string | null;
  public: boolean | null;
}

export interface MigrationLedgerMeta {
  ledger_exists: boolean;
  schema_name: string;
  table_name: string;
}

export interface Snapshot {
  version: string;
  captured_at: string;
  tables: TableMeta[];
  enums: EnumMeta[];
  constraints: ConstraintMeta[];
  indexes: IndexMeta[];
  tables_rls: TableRlsMeta[];
  policies: PolicyMeta[];
  storage_policies: PolicyMeta[];
  functions: FunctionMeta[];
  triggers: TriggerMeta[];
  grants: GrantsMeta;
  storage_bucket: StorageBucketMeta;
  migration_ledger: MigrationLedgerMeta;
}

function isSnapshot(val: unknown): val is Snapshot {
  if (typeof val !== 'object' || val === null) return false;
  const s = val as Record<string, unknown>;
  return (
    typeof s.version === 'string' &&
    typeof s.captured_at === 'string' &&
    Array.isArray(s.tables) &&
    Array.isArray(s.enums) &&
    Array.isArray(s.constraints) &&
    Array.isArray(s.indexes) &&
    Array.isArray(s.tables_rls) &&
    Array.isArray(s.policies) &&
    Array.isArray(s.storage_policies) &&
    Array.isArray(s.functions) &&
    Array.isArray(s.triggers) &&
    typeof s.grants === 'object' &&
    s.grants !== null &&
    typeof s.storage_bucket === 'object' &&
    s.storage_bucket !== null &&
    typeof s.migration_ledger === 'object' &&
    s.migration_ledger !== null
  );
}

async function executeSnapshot(db: PGlite): Promise<Snapshot> {
  const sql = readFileSync(resolve('supabase/preflight/schema-snapshot.sql'), 'utf8');
  const results = await db.exec(sql);
  for (const r of results) {
    if (r.rows && r.rows.length > 0) {
      const firstRow: unknown = r.rows[0];
      if (typeof firstRow === 'object' && firstRow !== null && 'snapshot' in firstRow) {
        const raw = (firstRow as Record<string, unknown>).snapshot;
        const candidate: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (isSnapshot(candidate)) {
          return candidate;
        }
      }
    }
  }
  throw new Error('Snapshot SQL did not return a valid Snapshot object');
}

async function setupSupabaseMocks(db: PGlite): Promise<void> {
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1, '/') $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Mock trade images read access" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]);
  `);
}

describe('schema-snapshot preflight SQL', () => {
  it('parses, runs, and captures full metadata with all 14 migrations applied', async () => {
    const db = new PGlite();
    try {
      await setupSupabaseMocks(db);
      await db.exec(`
        CREATE SCHEMA supabase_migrations;
        CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
      `);

      const directory = resolve('supabase/migrations');
      const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
      for (const file of files) {
        await db.exec(readFileSync(resolve(directory, file), 'utf8'));
        await db.query('INSERT INTO supabase_migrations.schema_migrations(version) VALUES ($1)', [file.replace(/\.sql$/, '')]);
      }

      const snapshot = await executeSnapshot(db);

      // Metadata envelope
      expect(snapshot.version).toBe('1.0');
      expect(typeof snapshot.captured_at).toBe('string');

      // Tables & Columns
      const tableNames = snapshot.tables.map(t => t.table_name);
      expect(tableNames).toEqual(expect.arrayContaining([
        'trades', 'profiles', 'conditions', 'tags', 'trade_conditions',
        'trade_tags', 'trade_metrics', 'trade_metric_values', 'quick_notes'
      ]));

      const tradesTable = snapshot.tables.find(t => t.table_name === 'trades');
      expect(tradesTable).toBeDefined();
      const tradeCols = tradesTable?.columns.map(c => c.column_name);
      expect(tradeCols).toEqual(expect.arrayContaining([
        'id', 'user_id', 'profile_id', 'asset', 'direction',
        'entry_date', 'result', 'earned_r', 'missed_r', 'duration_minutes', 'recap_text', 'image_url'
      ]));

      // Enums
      const enums = snapshot.enums;
      const dirEnum = enums.find(e => e.enum_name === 'trade_direction');
      const resEnum = enums.find(e => e.enum_name === 'trade_result');
      expect(dirEnum?.enum_values).toEqual(['Long', 'Short']);
      expect(resEnum?.enum_values).toEqual(['Win', 'Loss', 'Break-even', 'Missed', 'Canceled']);

      // Constraints
      const constraintNames = snapshot.constraints.map(c => c.constraint_name);
      expect(constraintNames).toEqual(expect.arrayContaining([
        'trades_pkey', 'trade_conditions_pkey', 'trade_tags_pkey', 'trade_metrics_pkey'
      ]));

      // Indexes
      const indexNames = snapshot.indexes.map(i => i.index_name);
      expect(indexNames).toEqual(expect.arrayContaining([
        'idx_trades_user_profile_entry_date',
        'idx_trade_conditions_condition_trade',
        'idx_trade_tags_tag_trade'
      ]));

      // RLS status
      const tradesRls = snapshot.tables_rls.find(r => r.table_name === 'trades');
      expect(tradesRls?.rls_enabled).toBe(true);

      // Restrictive Policies from migration 14
      const policies = snapshot.policies;
      const restrictivePolicies = policies.filter(p => p.permissive === 'RESTRICTIVE');
      const restrictiveNames = restrictivePolicies.map(p => p.policy_name);
      expect(restrictiveNames).toEqual(expect.arrayContaining([
        'Validate trade profile ownership',
        'Validate metric profile ownership',
        'Validate condition ownership',
        'Validate tag ownership',
        'Validate metric value ownership'
      ]));

      // Storage Policies metadata
      const storagePolicies = snapshot.storage_policies;
      expect(storagePolicies.length).toBeGreaterThan(0);
      expect(storagePolicies.map(p => p.table_name)).toContain('objects');
      expect(storagePolicies.map(p => p.policy_name)).toContain('Users can read own trade images');
      expect(storagePolicies.map(p => p.policy_name)).toContain('Mock trade images read access');

      // Functions (signatures, search_path, security invoker, MD5 fingerprint)
      const functions = snapshot.functions;
      const saveFn = functions.find(f => f.function_name === 'save_trade_with_relations');
      const createFn = functions.find(f => f.function_name === 'create_trade_with_relations');
      const updateFn = functions.find(f => f.function_name === 'update_trade_with_relations');
      const importFn = functions.find(f => f.function_name === 'import_trades_with_relations');

      expect(saveFn).toBeDefined();
      expect(saveFn?.is_security_definer).toBe(false);
      expect(saveFn?.search_path).toBe('public');
      expect(typeof saveFn?.definition_md5).toBe('string');
      expect(saveFn?.definition_md5).toHaveLength(32);

      expect(createFn).toBeDefined();
      expect(createFn?.is_security_definer).toBe(false);
      expect(createFn?.search_path).toBe('public');
      expect(typeof createFn?.definition_md5).toBe('string');
      expect(createFn?.definition_md5).toHaveLength(32);

      expect(updateFn).toBeDefined();
      expect(updateFn?.is_security_definer).toBe(false);
      expect(updateFn?.search_path).toBe('public');
      expect(typeof updateFn?.definition_md5).toBe('string');
      expect(updateFn?.definition_md5).toHaveLength(32);

      expect(importFn).toBeDefined();
      expect(importFn?.is_security_definer).toBe(false);
      expect(importFn?.search_path).toBe('public');
      expect(typeof importFn?.definition_md5).toBe('string');
      expect(importFn?.definition_md5).toHaveLength(32);

      // Triggers
      const triggers = snapshot.triggers;
      const triggerNames = triggers.map(t => t.trigger_name);
      expect(triggerNames).toContain('update_trades_updated_at');

      // Function Grants with signatures
      const rpcGrants = snapshot.grants.functions.filter(g =>
        g.function_name === 'create_trade_with_relations' ||
        g.function_name === 'save_trade_with_relations' ||
        g.function_name === 'update_trade_with_relations' ||
        g.function_name === 'import_trades_with_relations'
      );
      expect(rpcGrants.length).toBeGreaterThan(0);
      expect(rpcGrants.every(g => g.signature.includes('(') && g.signature.includes(')'))).toBe(true);

      // Storage Bucket
      expect(snapshot.storage_bucket).toEqual({
        bucket_exists: true,
        id: 'trade-images',
        name: 'trade-images',
        public: false
      });

      // Migration Ledger
      expect(snapshot.migration_ledger).toEqual({
        ledger_exists: true,
        schema_name: 'supabase_migrations',
        table_name: 'schema_migrations'
      });
    } finally {
      await db.close();
    }
  }, 60000);

  it('runs successfully when migration ledger is absent and before new migration', async () => {
    const db = new PGlite();
    try {
      await setupSupabaseMocks(db);
      // Notice: supabase_migrations schema and table are deliberately NOT created.

      // Run only historical migrations 1 through 13 (before atomic writes)
      const directory = resolve('supabase/migrations');
      const files = readdirSync(directory)
        .filter(name => name.endsWith('.sql') && !name.includes('atomic_trade_writes'))
        .sort();

      for (const file of files) {
        await db.exec(readFileSync(resolve(directory, file), 'utf8'));
      }

      const snapshot = await executeSnapshot(db);

      // Ledger absent must be reported without query failure
      expect(snapshot.migration_ledger).toEqual({
        ledger_exists: false,
        schema_name: 'supabase_migrations',
        table_name: 'schema_migrations'
      });

      // Storage bucket is still public in migration 1 (before migration 14 makes it private)
      expect(snapshot.storage_bucket).toEqual({
        bucket_exists: true,
        id: 'trade-images',
        name: 'trade-images',
        public: true
      });

      // Atomic write functions do NOT exist yet
      const fnNames = snapshot.functions.map(f => f.function_name);
      expect(fnNames).not.toContain('save_trade_with_relations');
      expect(fnNames).not.toContain('create_trade_with_relations');

      // Restrictive policies do NOT exist yet
      const policies = snapshot.policies;
      const restrictive = policies.filter(p => p.permissive === 'RESTRICTIVE');
      expect(restrictive).toHaveLength(0);
    } finally {
      await db.close();
    }
  }, 60000);

  it('runs successfully when trade-images bucket is absent in storage', async () => {
    const db = new PGlite();
    try {
      await setupSupabaseMocks(db);
      // Remove any bucket entries if any
      await db.exec("DELETE FROM storage.buckets WHERE id = 'trade-images';");

      const snapshot = await executeSnapshot(db);

      expect(snapshot.storage_bucket).toEqual({
        bucket_exists: false,
        id: 'trade-images',
        name: null,
        public: null
      });
      expect(snapshot.migration_ledger.ledger_exists).toBe(false);
    } finally {
      await db.close();
    }
  }, 60000);

  it('detects function-body changes via definition_md5 even when signatures are identical', async () => {
    const db = new PGlite();
    try {
      await setupSupabaseMocks(db);
      await db.exec(`
        CREATE FUNCTION public.test_fingerprint(x integer) RETURNS integer LANGUAGE sql AS $$ SELECT x + 1; $$;
      `);

      const snapshotV1 = await executeSnapshot(db);
      const fnV1 = snapshotV1.functions.find(f => f.function_name === 'test_fingerprint');
      expect(fnV1).toBeDefined();
      expect(fnV1?.signature).toBe('test_fingerprint(x integer)');
      expect(typeof fnV1?.definition_md5).toBe('string');
      expect(fnV1?.definition_md5).toHaveLength(32);

      // Modify function body without changing signature
      await db.exec(`
        CREATE OR REPLACE FUNCTION public.test_fingerprint(x integer) RETURNS integer LANGUAGE sql AS $$ SELECT x + 999; $$;
      `);

      const snapshotV2 = await executeSnapshot(db);
      const fnV2 = snapshotV2.functions.find(f => f.function_name === 'test_fingerprint');
      expect(fnV2).toBeDefined();
      expect(fnV2?.signature).toBe('test_fingerprint(x integer)');
      expect(fnV2?.definition_md5).not.toBe(fnV1?.definition_md5);
    } finally {
      await db.close();
    }
  }, 60000);

  it('distinguishes overloaded function grants with distinct identity signatures without numeric OIDs', async () => {
    const db = new PGlite();
    try {
      await setupSupabaseMocks(db);
      await db.exec(`
        CREATE FUNCTION public.test_overload(a text) RETURNS text LANGUAGE sql AS $$ SELECT a; $$;
        CREATE FUNCTION public.test_overload(a text, b integer) RETURNS text LANGUAGE sql AS $$ SELECT a || b::text; $$;
        REVOKE ALL ON FUNCTION public.test_overload(text) FROM PUBLIC;
        REVOKE ALL ON FUNCTION public.test_overload(text, integer) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.test_overload(text) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.test_overload(text, integer) TO authenticated;
      `);

      const snapshot = await executeSnapshot(db);
      const overloadGrants = snapshot.grants.functions.filter(g => g.function_name === 'test_overload');

      expect(overloadGrants).toHaveLength(2);
      const signatures = overloadGrants.map(g => g.signature);
      expect(signatures).toContain('test_overload(a text)');
      expect(signatures).toContain('test_overload(a text, b integer)');
      expect(overloadGrants.every(g => g.grantee === 'authenticated')).toBe(true);
      expect(overloadGrants.every(g => g.privilege_type === 'EXECUTE')).toBe(true);
      // Ensure no numeric OIDs are present in the signatures
      expect(signatures.every(s => !/\b\d{4,}\b/.test(s))).toBe(true);
    } finally {
      await db.close();
    }
  }, 60000);

  it('rejects an attempted write inserted before COMMIT inside the read-only transaction', async () => {
    const db = new PGlite();
    try {
      await setupSupabaseMocks(db);
      await db.exec(`
        CREATE TABLE public.test_target (id serial PRIMARY KEY, note text);
      `);

      const baseSql = readFileSync(resolve('supabase/preflight/schema-snapshot.sql'), 'utf8');
      const writeAttemptSql = baseSql.replace(
        'COMMIT;',
        "INSERT INTO public.test_target (note) VALUES ('attempted write'); COMMIT;"
      );

      await expect(db.exec(writeAttemptSql)).rejects.toThrow(/read-only transaction/i);
    } finally {
      await db.close();
    }
  }, 60000);
});
