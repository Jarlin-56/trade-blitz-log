-- READ-ONLY Schema Preflight Snapshot
-- Inspects database schema metadata for public tables, enums, constraints,
-- indexes, RLS status, policies, functions, triggers, grants, storage bucket metadata,
-- storage.objects policy metadata, and migration ledger status.
-- Wrapped in a read-only transaction: no data modifications, no DDL, no user PII.

BEGIN TRANSACTION READ ONLY;

WITH
tables_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table_name', t.table_name,
          'columns', COALESCE(cols.columns_list, '[]'::jsonb)
        )
        ORDER BY t.table_name
      ),
      '[]'::jsonb
    ) AS tables
  FROM information_schema.tables t
  LEFT JOIN (
    SELECT
      c.table_name,
      jsonb_agg(
        jsonb_build_object(
          'column_name', c.column_name,
          'ordinal_position', c.ordinal_position,
          'data_type', c.data_type,
          'udt_name', c.udt_name,
          'is_nullable', c.is_nullable,
          'column_default', c.column_default
        )
        ORDER BY c.ordinal_position
      ) AS columns_list
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    GROUP BY c.table_name
  ) cols ON cols.table_name = t.table_name
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
),

enums_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'enum_name', e_types.enum_name,
          'enum_values', e_types.enum_values
        )
        ORDER BY e_types.enum_name
      ),
      '[]'::jsonb
    ) AS enums
  FROM (
    SELECT
      t.typname AS enum_name,
      jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
  ) e_types
),

constraints_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'constraint_name', con.conname,
          'table_name', rel.relname,
          'constraint_type', CASE con.contype
            WHEN 'p' THEN 'PRIMARY KEY'
            WHEN 'u' THEN 'UNIQUE'
            WHEN 'f' THEN 'FOREIGN KEY'
            WHEN 'c' THEN 'CHECK'
            WHEN 'x' THEN 'EXCLUSION'
            ELSE con.contype::text
          END,
          'definition', pg_get_constraintdef(con.oid, true),
          'foreign_table', frel.relname
        )
        ORDER BY rel.relname, con.conname
      ),
      '[]'::jsonb
    ) AS constraints
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  LEFT JOIN pg_class frel ON frel.oid = con.confrelid
  WHERE n.nspname = 'public'
    AND rel.relkind = 'r'
),

indexes_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table_name', t.relname,
          'index_name', i.relname,
          'is_unique', idx.indisunique,
          'is_primary', idx.indisprimary,
          'definition', pg_get_indexdef(i.oid)
        )
        ORDER BY t.relname, i.relname
      ),
      '[]'::jsonb
    ) AS indexes
  FROM pg_index idx
  JOIN pg_class i ON i.oid = idx.indexrelid
  JOIN pg_class t ON t.oid = idx.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relkind = 'r'
),

rls_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table_name', c.relname,
          'rls_enabled', c.relrowsecurity,
          'rls_forced', c.relforcerowsecurity
        )
        ORDER BY c.relname
      ),
      '[]'::jsonb
    ) AS tables_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
),

policies_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table_name', tablename,
          'policy_name', policyname,
          'permissive', permissive,
          'roles', roles,
          'cmd', cmd,
          'qual', qual,
          'with_check', with_check
        )
        ORDER BY tablename, policyname
      ),
      '[]'::jsonb
    ) AS policies
  FROM pg_policies
  WHERE schemaname = 'public'
),

storage_policies_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table_name', tablename,
          'policy_name', policyname,
          'permissive', permissive,
          'roles', roles,
          'cmd', cmd,
          'qual', qual,
          'with_check', with_check
        )
        ORDER BY policyname
      ),
      '[]'::jsonb
    ) AS storage_policies
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
),

functions_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'function_name', p.proname,
          'identity_arguments', pg_get_function_identity_arguments(p.oid),
          'signature', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
          'return_type', pg_get_function_result(p.oid),
          'is_security_definer', p.prosecdef,
          'volatility', CASE p.provolatile
            WHEN 'i' THEN 'IMMUTABLE'
            WHEN 's' THEN 'STABLE'
            WHEN 'v' THEN 'VOLATILE'
            ELSE p.provolatile::text
          END,
          'search_path', (
            SELECT setting
            FROM unnest(COALESCE(p.proconfig, '{}'::text[])) AS cfg,
                 LATERAL (SELECT split_part(cfg, '=', 1) AS key, split_part(cfg, '=', 2) AS setting) s
            WHERE s.key = 'search_path'
            LIMIT 1
          ),
          'definition_md5', md5(pg_get_functiondef(p.oid)),
          'language', l.lanname
        )
        ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
      ),
      '[]'::jsonb
    ) AS functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.prokind <> 'a'
),

triggers_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table_name', rel.relname,
          'trigger_name', trig.tgname,
          'definition', pg_get_triggerdef(trig.oid, true),
          'is_enabled', trig.tgenabled <> 'D',
          'status', trig.tgenabled::text
        )
        ORDER BY rel.relname, trig.tgname
      ),
      '[]'::jsonb
    ) AS triggers
  FROM pg_trigger trig
  JOIN pg_class rel ON rel.oid = trig.tgrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND NOT trig.tgisinternal
),

table_grants_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table_name', table_name,
          'grantee', grantee,
          'privilege_type', privilege_type,
          'is_grantable', is_grantable
        )
        ORDER BY table_name, grantee, privilege_type
      ),
      '[]'::jsonb
    ) AS table_grants
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
),

function_grants_meta AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'function_name', p.proname,
          'signature', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
          'grantee', rp.grantee,
          'privilege_type', rp.privilege_type,
          'is_grantable', rp.is_grantable
        )
        ORDER BY p.proname, pg_get_function_identity_arguments(p.oid), rp.grantee, rp.privilege_type
      ),
      '[]'::jsonb
    ) AS function_grants
  FROM information_schema.routine_privileges rp
  JOIN pg_namespace n ON n.nspname = rp.specific_schema
  JOIN pg_proc p ON p.pronamespace = n.oid AND (p.proname || '_' || p.oid::text) = rp.specific_name
  WHERE rp.routine_schema = 'public'
    AND rp.grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
),

bucket_meta AS (
  SELECT
    COALESCE(
      (
        SELECT jsonb_build_object(
          'bucket_exists', true,
          'id', b.id,
          'name', b.name,
          'public', b.public
        )
        FROM storage.buckets b
        WHERE b.id = 'trade-images'
      ),
      jsonb_build_object(
        'bucket_exists', false,
        'id', 'trade-images',
        'name', null,
        'public', null
      )
    ) AS bucket
),

migration_ledger_meta AS (
  SELECT jsonb_build_object(
    'ledger_exists', EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'supabase_migrations'
        AND c.relname = 'schema_migrations'
    ),
    'schema_name', 'supabase_migrations',
    'table_name', 'schema_migrations'
  ) AS ledger
)

SELECT jsonb_build_object(
  'version', '1.0',
  'captured_at', timezone('utc', now()),
  'tables', tables_meta.tables,
  'enums', enums_meta.enums,
  'constraints', constraints_meta.constraints,
  'indexes', indexes_meta.indexes,
  'tables_rls', rls_meta.tables_rls,
  'policies', policies_meta.policies,
  'storage_policies', storage_policies_meta.storage_policies,
  'functions', functions_meta.functions,
  'triggers', triggers_meta.triggers,
  'grants', jsonb_build_object(
    'tables', table_grants_meta.table_grants,
    'functions', function_grants_meta.function_grants
  ),
  'storage_bucket', bucket_meta.bucket,
  'migration_ledger', migration_ledger_meta.ledger
) AS snapshot
FROM tables_meta,
     enums_meta,
     constraints_meta,
     indexes_meta,
     rls_meta,
     policies_meta,
     storage_policies_meta,
     functions_meta,
     triggers_meta,
     table_grants_meta,
     function_grants_meta,
     bucket_meta,
     migration_ledger_meta;

COMMIT;
