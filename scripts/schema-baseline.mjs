// Standalone local schema baseline generator
// Runs historical migrations 1 through 13 on local in-memory PGlite
// Executes supabase/preflight/schema-snapshot.sql to produce pre-atomic-writes baseline JSON.
// Never connects to production. Can be re-run safely at any time.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

async function generateBaseline(outputPath) {
  const db = new PGlite();
  try {
    // 1. Setup core Supabase catalog mocks
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
    `);

    // 2. Run historical migrations 1 through 13 (exclude atomic writes)
    const migrationsDir = resolve('supabase/migrations');
    const files = readdirSync(migrationsDir)
      .filter(name => name.endsWith('.sql') && !name.includes('atomic_trade_writes'))
      .sort();

    for (const file of files) {
      try {
        const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
        await db.exec(sql);
      } catch (err) {
        console.error(`Error in migration ${file}:`, err.message);
        throw err;
      }
    }

    // 3. Execute read-only schema snapshot
    const snapshotSql = readFileSync(resolve('supabase/preflight/schema-snapshot.sql'), 'utf8');
    const results = await db.exec(snapshotSql);

    let snapshot = null;
    for (const r of results) {
      if (r.rows && r.rows.length > 0 && r.rows[0]?.snapshot !== undefined) {
        const raw = r.rows[0].snapshot;
        snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw;
        break;
      }
    }

    if (!snapshot) {
      throw new Error('Snapshot query did not return a snapshot payload');
    }

    // 4. Output baseline
    if (outputPath) {
      const resolvedOut = resolve(outputPath);
      mkdirSync(dirname(resolvedOut), { recursive: true });
      writeFileSync(resolvedOut, JSON.stringify(snapshot, null, 2), 'utf8');
      console.log(`Baseline written to: ${resolvedOut}`);
    } else {
      console.log(JSON.stringify(snapshot, null, 2));
    }

    return snapshot;
  } finally {
    await db.close();
  }
}

// Allow CLI invocation: node scripts/schema-baseline.mjs [outputPath]
const targetOut = process.argv[2];
generateBaseline(targetOut).catch(err => {
  console.error('Failed to generate baseline:', err);
  process.exit(1);
});
