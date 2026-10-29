// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const db = new PGlite();
const user = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
let profile: string;
let condition: string;
let tag: string;
let metric: string;
const trade = { asset: 'XAUUSD', direction: 'Long', result: 'Win', earned_r: 2, missed_r: 0, entry_date: '2026-10-29T00:00:00Z' };
const count = async () => (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM trades')).rows[0].count;

beforeAll(async () => {
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
    -- Regression guard: Simulate Supabase default privileges granting EXECUTE to anon on newly created functions
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
  `);
  const directory = resolve('supabase/migrations');
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(resolve(directory, file), 'utf8'));
  }
  await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2),($3,$4)', [user, 'one@example.test', other, 'two@example.test']);
  profile = (await db.query<{ id: string }>('SELECT id FROM profiles WHERE user_id=$1', [user])).rows[0].id;
  condition = (await db.query<{ id: string }>('INSERT INTO conditions(user_id,name) VALUES ($1, $2) RETURNING id', [user, 'condition'])).rows[0].id;
  tag = (await db.query<{ id: string }>('INSERT INTO tags(user_id,name) VALUES ($1, $2) RETURNING id', [user, 'tag'])).rows[0].id;
  metric = (await db.query<{ id: string }>('INSERT INTO trade_metrics(user_id,profile_id,name,min_value,max_value) VALUES ($1,$2,$3,0,10) RETURNING id', [user, profile, 'metric'])).rows[0].id;
  await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; SET ROLE authenticated;');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
}, 60000);

afterAll(() => db.close());

describe('atomic trade RPCs with actual migrations and RLS', () => {
  it('makes the image bucket private and denies anonymous RPC execution on all 4 functions', async () => {
    await db.exec('RESET ROLE');
    try {
      expect((await db.query<{ public: boolean }>("SELECT public FROM storage.buckets WHERE id='trade-images'")).rows[0].public).toBe(false);
      const funcs = [
        'public.create_trade_with_relations(uuid,jsonb,uuid[],uuid[],jsonb)',
        'public.update_trade_with_relations(uuid,uuid,jsonb,uuid[],uuid[],jsonb)',
        'public.save_trade_with_relations(uuid,uuid,jsonb,uuid[],uuid[],jsonb)',
        'public.import_trades_with_relations(uuid,jsonb)'
      ];
      for (const fn of funcs) {
        expect((await db.query<{ allowed: boolean }>(`SELECT has_function_privilege('anon', '${fn}', 'EXECUTE') AS allowed`)).rows[0].allowed).toBe(false);
        expect((await db.query<{ allowed: boolean }>(`SELECT has_function_privilege('authenticated', '${fn}', 'EXECUTE') AS allowed`)).rows[0].allowed).toBe(true);
      }
    } finally { await db.exec('SET ROLE authenticated'); }
  });
  it('creates all relations and replaces them in one update', async () => {
    const { rows } = await db.query<{ id: string }>('SELECT create_trade_with_relations($1,$2,$3,$4,$5) AS id', [profile, trade, [condition], [tag], [{ metric_id: metric, value: 3 }]]);
    const id = rows[0].id;
    expect((await db.query('SELECT * FROM trade_metric_values WHERE trade_id=$1', [id])).rows).toHaveLength(1);
    await db.query('SELECT update_trade_with_relations($1,$2,$3,$4,$5,$6)', [id, profile, { ...trade, earned_r: 4 }, [], [], []]);
    expect((await db.query('SELECT * FROM trade_conditions WHERE trade_id=$1', [id])).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM trade_tags WHERE trade_id=$1', [id])).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM trade_metric_values WHERE trade_id=$1', [id])).rows).toHaveLength(0);
  });

  it('rolls back the entire import when a later row fails', async () => {
    const before = await count();
    await expect(db.query('SELECT import_trades_with_relations($1,$2)', [profile, [
      { trade, metric_values: [] },
      { trade, metric_values: [{ metric_id: metric, value: 100 }] },
    ]])).rejects.toThrow('Metric value');
    expect(await count()).toBe(before);
  });

  it('imports multiple rows and their metrics', async () => {
    const before = await count();
    const result = await db.query<{ ids: string[] }>('SELECT import_trades_with_relations($1,$2) AS ids', [profile, [
      { trade, metric_values: [{ metric_id: metric, value: 1 }] },
      { trade, metric_values: [{ metric_id: metric, value: 2 }] },
    ]]);
    expect(result.rows[0].ids).toHaveLength(2);
    expect(await count()).toBe(before + 2);
  });

  it('rejects another user profile and hides existing rows through RLS', async () => {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [other]);
    try {
      expect(await count()).toBe(0);
      await expect(db.query('SELECT create_trade_with_relations($1,$2)', [profile, trade])).rejects.toThrow('Profile not found');
    } finally {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
    }
  });

  it('rolls back an update when relation validation fails and rejects unauthenticated callers', async () => {
    const created = await db.query<{ id: string }>('SELECT create_trade_with_relations($1,$2,$3) AS id', [profile, trade, [condition]]);
    const id = created.rows[0].id;
    await expect(db.query('SELECT update_trade_with_relations($1,$2,$3,$4)', [id, profile, { ...trade, asset: 'CHANGED' }, [other]])).rejects.toThrow();
    expect((await db.query<{ asset: string }>('SELECT asset FROM trades WHERE id=$1', [id])).rows[0].asset).toBe('XAUUSD');
    expect((await db.query('SELECT * FROM trade_conditions WHERE trade_id=$1', [id])).rows).toHaveLength(1);
    await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
    try {
      await expect(db.query('SELECT create_trade_with_relations($1,$2)', [profile, trade])).rejects.toThrow('Authentication');
    } finally { await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]); }
  });

  it('enforces profile ownership for legacy direct table writes', async () => {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [other]);
    try {
      await expect(db.query("INSERT INTO trades(user_id,profile_id,asset,direction,result) VALUES ($1,$2,'XAUUSD','Long','Win')", [other, profile])).rejects.toThrow('row-level security');
    } finally { await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]); }
  });

  it('converts a quick note atomically and rejects repeat conversion', async () => {
    const note = (await db.query<{ id: string }>('INSERT INTO quick_notes(user_id,profile_id,note) VALUES ($1,$2,$3) RETURNING id', [user, profile, 'note'])).rows[0].id;
    const converted = await db.query<{ id: string }>('SELECT create_trade_with_relations($1,$2) AS id', [profile, { ...trade, quick_note_id: note }]);
    expect((await db.query<{ converted_trade_id: string }>('SELECT converted_trade_id FROM quick_notes WHERE id=$1', [note])).rows[0].converted_trade_id).toBe(converted.rows[0].id);
    await expect(db.query('SELECT create_trade_with_relations($1,$2)', [profile, { ...trade, quick_note_id: note }])).rejects.toThrow('already converted');
  });
});
