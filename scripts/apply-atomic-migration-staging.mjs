import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  validateStagingTarget,
  sanitizeError
} from './staging-utils.mjs';

const CONFIG_PATH = 'C:\\Users\\User\\TradeLog-Backups\\staging-config.json';
const PG_TOOLS_DIR = 'C:\\Users\\User\\TradeLog-Tools\\pgsql17\\pgsql\\bin';
const PSQL_EXE = path.join(PG_TOOLS_DIR, 'psql.exe');
const MIGRATION_FILE = path.resolve('supabase/migrations/20261027090000_atomic_trade_writes.sql');

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  log('Starting atomic trade writes migration application on Staging...');

  // 1. Target Validation
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Staging config not found at ${CONFIG_PATH}`);
  }
  const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
  const config = JSON.parse(rawConfig);
  validateStagingTarget(config);
  log(`Preflight: Target validated for staging ref '${config.project_ref}'`);

  if (!fs.existsSync(PSQL_EXE)) {
    throw new Error(`psql.exe not found at ${PSQL_EXE}`);
  }
  if (!fs.existsSync(MIGRATION_FILE)) {
    throw new Error(`Migration file not found at ${MIGRATION_FILE}`);
  }

  // 2. Read migration SQL and wrap in transaction
  const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const transactionalSql = `
BEGIN;
${migrationSql}
COMMIT;
`;

  const dbEnv = {
    ...process.env,
    PGPASSWORD: config.db_password,
    PGHOST: config.db_host,
    PGPORT: String(config.db_port || 5432),
    PGUSER: config.db_user,
    PGDATABASE: config.db_name || 'postgres',
    PGSSLMODE: 'require'
  };

  const secrets = [config.db_password, config.anon_key, config.service_role_key].filter(Boolean);

  log('Applying migration in a single transaction with ON_ERROR_STOP...');
  const res = spawnSync(
    PSQL_EXE,
    ['-X', '-v', 'ON_ERROR_STOP=1', '-w', '-c', transactionalSql],
    { env: dbEnv, encoding: 'utf8' }
  );

  if (res.error) {
    throw new Error(`Failed to spawn psql: ${sanitizeError(res.error.message, secrets)}`);
  }

  if (res.status !== 0) {
    const sanitizedErr = sanitizeError(res.stderr || res.stdout, secrets);
    throw new Error(`Migration failed with exit code ${res.status}: ${sanitizedErr}`);
  }

  log('Migration applied successfully (Exit code 0).');
  log(res.stdout.trim());
}

main().catch(err => {
  console.error('[FATAL MIGRATION ERROR]', err.message);
  process.exit(1);
});
