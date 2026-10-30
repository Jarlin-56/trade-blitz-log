# Stabilize & Secure release

The user confirmed `nkuwxxrntnkqoayfbrvv` is the current production project;
`evhgtzdhmwoeyivsbmfg` is the old project. Local app configuration now uses the
confirmed project URL and its matching anon/publishable key. The confirmed project
has existing application tables but an empty migration ledger; a dry-run would replay
every historical migration. Reconcile its schema and create a verified backup before
repairing the ledger or pushing the new migration.

Deploy the database migration **before** distributing the updated desktop/web client.
The new client requires the RPCs; it intentionally does not fall back to partial writes.
Existing clients can continue using the original tables and columns.

## Preflight Verification & Schema Reconciliation

Before modifying migration ledgers or applying new migrations:

1. **Execute Read-Only Preflight Snapshot**:
   Run `supabase/preflight/schema-snapshot.sql` against the remote production database
   (e.g., via the Supabase Dashboard SQL Editor).
   The script executes within a read-only transaction (`BEGIN TRANSACTION READ ONLY;`)
   and inspects catalog metadata without accessing user records, modifying state, or executing DDL.
   It outputs a structured JSON snapshot containing:
   - Public tables, columns, data types, nullability, and defaults.
   - Enums and allowed values (`trade_direction`, `trade_result`).
   - Constraints and foreign key definitions.
   - Indexes and uniqueness flags.
   - Table RLS status and security policies (permissive and restrictive).
   - Storage policies metadata for `storage.objects` from `pg_policies` (no object rows).
   - Public function signatures, security invoker flags, `search_path` settings, and an MD5
     definition fingerprint (`pg_get_functiondef` hash for detecting implementation drift).
   - Triggers and enabled states.
   - Table and routine grants with complete identity signatures (distinguishing overloaded functions).
   - `trade-images` bucket metadata (without reading object contents).
   - `supabase_migrations.schema_migrations` ledger existence (without failing if missing).

   > [!WARNING]
   > **Role Catalog Visibility**: Catalog visibility in PostgreSQL depends directly on the database
   > role executing the snapshot. Always run the preflight script using the database owner/administrative
   > role (`postgres`) or a verified inspection role granted necessary metadata privileges (such as
   > executing queries in the Supabase Dashboard SQL Editor as `postgres`). Note that `service_role`
   > is an API/JWT role bypassing RLS for PostgREST, not an administrative database role guaranteeing
   > complete `information_schema` visibility; explicitly do not use API service keys or JWT tokens
   > as database connection credentials for catalog inspection. Running under a restricted role will
   > produce incomplete catalog metadata.

   > [!CAUTION]
   > **Sensitive Schema Artifacts Outside Git**: Generated snapshot JSON outputs contain sensitive
   > operational details (full table architectures, RLS expressions, and permission grants).
   > **Never commit captured snapshot JSON files into this git repository.** Store preflight snapshots
   > only in temporary, secure local storage outside version control.

2. **Generate Local Baseline & Compare**:
   Generate a local preflight snapshot baseline from the repository's historical migrations
   (migrations 1 through 13, prior to `20261027090000_atomic_trade_writes.sql`).
   Compare the remote preflight snapshot against this pre-new-migration baseline:
   - **Ignore `captured_at` in Diffs**: The `captured_at` field records the query execution timestamp;
     it must be ignored or stripped when computing structural diffs between snapshots.
   - **Distinguish Factual Drift**: Factual drift refers to unexpected differences in historical
     tables, columns, indexes, foreign keys, or existing permissive policies compared to
     migrations 1–13 (for example, manual schema adjustments made in the dashboard).
     If unexpected factual drift is detected, **stop the rollout immediately** and investigate.
   - **Distinguish Intentional Post-Migration Changes**: Post-migration expected changes are
     **not** baseline drift. Expected differences introduced solely by
     `20261027090000_atomic_trade_writes.sql` include:
     - New RPC functions (`save_trade_with_relations`, `create_trade_with_relations`,
       `update_trade_with_relations`, `import_trades_with_relations`).
     - New restrictive policies on `trades`, `trade_metrics`, `trade_conditions`,
       `trade_tags`, and `trade_metric_values`.
     - Additional performance indexes (`idx_trades_user_profile_entry_date`,
       `idx_trade_conditions_condition_trade`, `idx_trade_tags_tag_trade`).
     - Updating `storage.buckets` so that `trade-images` has `public = false`.
     These intentional additions must NOT be present in the pre-migration remote snapshot,
     and their absence confirms that the database has not yet been partially updated.

3. **Mandatory Backup & Verified Restore**:
   Do not assume a backup exists or that production matches repository migrations.
   Before repairing the migration ledger or running any DDL:
   - Create a full database export/backup (schema and data) from `nkuwxxrntnkqoayfbrvv`.
   - Back up all objects in the `trade-images` storage bucket.
   - Store all backups outside this repository.
   - **Perform a verified restore test** of the database backup into an isolated test database
     or separate staging project to guarantee data recoverability before making any changes.

4. **Baseline Migration Ledger (Repair without Replay)**:
   Once backup restoration is verified and schema reconciliation confirms no unexpected drift:
   - Repair the migration ledger for historical migrations 1 through 13
     (up to `20260809112531_21335311-b33b-48c5-a59c-f396ecef9917`) using:
     `supabase migration repair --status applied <version>`
   - Do NOT replay historical migration SQL against existing tables.

5. **Dry-Run Validation**:
   Link the Supabase CLI to `nkuwxxrntnkqoayfbrvv` and run:
   `supabase db push --dry-run`
   The **only** pending migration must be `20261027090000_atomic_trade_writes.sql`.
   If any earlier migrations appear pending, halt and resolve the ledger mismatch.

6. **Deploy Database Migration**:
   Run `supabase db push` to apply `20261027090000_atomic_trade_writes.sql`.
   After deployment, re-run `supabase/preflight/schema-snapshot.sql` to verify:
   - `pg_indexes` contains the 3 new performance indexes.
   - `pg_proc` has the 4 new atomic functions granted to `authenticated` with invoker security.
   - `storage.buckets.public` is `false` for `trade-images`.
   - The 5 restrictive policies are active on their respective tables.

## Verification Checklist

1. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
   Integration tests execute repository migrations with real Postgres semantics via
   PGlite, with simulated Supabase auth/storage schemas. They validate script logic but
   do not prove remote state.
2. With two separate test accounts on production, verify create/edit with conditions, tags,
   metrics, quick-note conversion, successful CSV import, and import rollback on an invalid
   later row. Verify account B cannot select/update account A's trades, use its profile,
   attach its conditions/tags/metrics, or execute the RPC without authentication.
3. Confirm existing chart images display through signed URLs, and unauthenticated HTTP
   requests to their legacy direct public URLs are denied.
4. Run the packaged Electron smoke test on Windows: login, crop/cancel/paste, widget
   hide/pin, settings/shortcut conflicts, update download/install. Build and publish
   only after this passes. Verify the build has the correct `VITE_SUPABASE_URL`.
5. Make GitHub `Quality / verify` a required status check in branch protection/rulesets.
   A workflow file alone does not enforce merge blocking. Require the Windows
   `Quality / electron` check as well.

## Staging Verification Evidence (A8)

On 2026-10-30, atomic trade writes migration testing was executed on Supabase Staging (`zhsxxgzjhnzonznmhhzv`, ap-south-1) with the following verified outcomes:

1. **Pre-Migration Checkpoint**:
   - Baseline pre-migration snapshot captured and stored outside Git at `C:\Users\User\TradeLog-Backups\checkpoint-a7\`.
   - Production vs Staging differences documented (private bucket `storage_bucket.public: false`, `anon` table privileges restricted).

2. **Migration Fix & Idempotency**:
   - **Supabase Default Privileges Fix**: In Supabase, `pg_default_acl` automatically grants `EXECUTE` on functions to role `anon`. Running `REVOKE ALL ... FROM PUBLIC` left `anon` with execute privileges. The migration was updated to `REVOKE ALL ON FUNCTION ... FROM anon, PUBLIC;` ensuring strict denial for unauthenticated callers (`has_function_privilege('anon', ...) = false`).
   - **Idempotent Policies**: Added `DROP POLICY IF EXISTS` before `CREATE POLICY ... AS RESTRICTIVE` ensuring safe re-execution.
   - **Execution**: Applied in a single transaction with `ON_ERROR_STOP` via explicit staging configuration (Exit code 0).

3. **Remote Schema Verification**:
   - 4 atomic functions verified in `public`: `save_trade_with_relations`, `create_trade_with_relations`, `update_trade_with_relations`, `import_trades_with_relations`.
   - Effective privileges verified: `authenticated = true`, `anon = false`, `PUBLIC = false`.
   - 3 performance indexes verified: `idx_trades_user_profile_entry_date`, `idx_trade_conditions_condition_trade`, `idx_trade_tags_tag_trade`.
   - 5 restrictive policies verified active on respective tables.
   - Bucket `trade-images` verified `public = false`.

4. **Live API Integration Test Results (7/7 Passed)**:
   - `create_update_relations`: Created and updated trade with conditions, tags, metrics atomically.
   - `quick_note_conversion`: Successfully linked quick note and prevented double-conversion.
   - `batch_import_and_rollback`: Multi-row import succeeded; invalid 2nd row triggered complete transaction rollback (0 orphan trades).
   - `update_atomic_rollback`: Invalid update failed and preserved original trade and relations unchanged.
   - `cross_user_and_anon_rejection`: Cross-user profile/trade/relation access and anonymous RPC execution were strictly denied.
   - `legacy_direct_writes_and_restrictive_rls`: Owner direct writes succeeded; restrictive policies blocked unowned profiles/conditions.
   - `storage_private_and_signed_url`: Legacy public URL rejected (HTTP 400); signed URL returned HTTP 200 (71,560 bytes verified).
   - Test fixtures cleaned up; restored database records (20 trades, 3 profiles) remained completely untouched.

5. **Operational Limits**:
   - The CSV import RPC accepts between 1 and 1000 rows per transaction.
   - Apply migration to production before releasing the updated desktop client.
   - Stopped before migration repair / production deployment.

## Production Rollout Evidence (A9)

On 2026-10-30, the production database rollout was executed against `nkuwxxrntnkqoayfbrvv` (AWS `ap-south-1`) under strict operational safeguards:

1. **Target Isolation & Preflight Verification**:
   - Target strictly isolated to production `nkuwxxrntnkqoayfbrvv`. Talktext project (`otbkrjfpddpuljaiforn`) was strictly untouched.
   - Migration file: `supabase/migrations/20261027090000_atomic_trade_writes.sql` (SHA-256: `565863F7E019B3070A6ED2318A3F359938C067B9097A543B42B8EF9B5B210330`).
   - Verified zero data drift against pre-atomic backup `db_nkuwxxrntnkqoayfbrvv_20261030_010606_ed715ffa.dump` (SHA-256: `F9D99E3229E78F77D14C62105100291B37AD0A9A9948040AD9EA2A8AA4096F91`).
   - Production table statistics verified across all 11 tables: 20 trades, 3 profiles, 21 master conditions (with 71 trade_conditions join rows), 6 master tags (with 41 trade_tags join rows), 3 master trade_metrics (with 6 trade_metric_values join rows), 0 quick_notes, 0 recap_quiz_attempts, 0 recap_quiz_condition_results matching backup exactly.
   - Storage verification: 15/15 objects in `trade-images` matched backup SHA-256 byte-for-byte.

2. **Ledger Repair & Dry-Run**:
   - Migration ledger repaired for historical migrations 1 through 13 using `npx supabase migration repair --status applied --linked <versions>` (Exit code 0).
   - Dry-run validation executed: `npx supabase db push --dry-run --linked` confirmed exactly one pending migration: `20261027090000_atomic_trade_writes.sql`.

3. **Migration Deployment**:
   - Executed `npx supabase db push --linked` applying `20261027090000_atomic_trade_writes.sql` (Exit code 0).
   - Verification via `npx supabase db push --dry-run --linked` confirmed schema up to date (`{"upToDate":true}`).

4. **Remote Schema & Storage Verification**:
   - 3 performance indexes active: `idx_trades_user_profile_entry_date`, `idx_trade_conditions_condition_trade`, `idx_trade_tags_tag_trade`.
   - 4 atomic RPC functions deployed with security invoker.
   - 5 restrictive policies active on `trades`, `trade_metrics`, `trade_conditions`, `trade_tags`, `trade_metric_values`.
   - `storage.buckets.public = false` active on `trade-images`. Public image access denied (HTTP 400).

5. **Production Smoke Test Results (`scripts/smoke-test-production.mjs` - Exit Code 0)**:
   - Scenario 1 (`create_edit_rpc`): Created and updated trade with relations via atomic RPCs — PASSED.
   - Scenario 2 (`import_rollback`): Atomic rollback on invalid batch import row verified — PASSED.
   - Scenario 3 (`security_isolation`): Cross-user profile/trade access and anonymous RPC execution denied — PASSED.
   - Scenario 4 (`legacy_direct_writes`): Owner direct writes succeeded; restrictive policies blocked cross-user linkage — PASSED.
   - Scenario 5 (`signed_url_storage`): Legacy public URL rejected (HTTP 400); signed URL retrieved 71,560 bytes successfully — PASSED.
   - Cleanup: Ephemeral smoke test users (`smoke_prod_a_*`, `smoke_prod_b_*`) automatically deleted; production counts remained exactly at 20 trades and 3 profiles.

6. **Current Status & Pending Scope**:
   - Production database rollout and smoke testing are complete.
   - Electron desktop release has NOT been published. CI status check enforcement on GitHub remains to be configured in the next phase.

## Rollback & Storage Handling

If validation fails, stop client rollout and distribute the previous client. Leave the
additive functions/indexes installed while investigating; do not remove schema used by
deployed clients. Do not restore a production backup over newer user data.

Storage deletion runs after database commit. Cleanup failures are logged with paths;
review retained objects against trade/note references before deleting anything. On an
ambiguous network error during save, retain uploaded images because the database may
have committed. Reconcile server state before retrying or deleting those objects.

The CSV RPC accepts at most 1000 trades per transaction. An import error commits zero
rows. Concurrent retries after a lost response still require checking for duplicates;
these RPCs do not introduce an idempotency key.
