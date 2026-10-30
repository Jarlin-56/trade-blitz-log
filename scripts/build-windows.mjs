import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const target = process.argv[2] || 'staging';
if (target !== 'staging' && target !== 'prod') {
  console.error('Usage: node scripts/build-windows.mjs [staging|prod]');
  process.exit(1);
}

let supabaseUrl = '';
let publishableKey = '';
let projectId = '';
let outputDir = '';

if (target === 'staging') {
  outputDir = 'release-staging';
  const cfgPath = 'C:\\Users\\User\\TradeLog-Backups\\staging-config.json';
  const raw = fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, '');
  const cfg = JSON.parse(raw);
  supabaseUrl = cfg.supabase_url;
  publishableKey = cfg.anon_key;
  projectId = cfg.project_ref;
} else {
  outputDir = 'release-prod';
  projectId = 'nkuwxxrntnkqoayfbrvv';
  supabaseUrl = `https://${projectId}.supabase.co`;
  const keysOutput = execFileSync('npx', [
    'supabase', 'projects', 'api-keys',
    '--project-ref', projectId,
    '--output', 'json'
  ], { encoding: 'utf8', shell: true });
  const parsed = JSON.parse(keysOutput);
  const keys = Array.isArray(parsed) ? parsed : (parsed.keys || []);
  publishableKey = keys.find(k => k.id === 'anon')?.api_key;
}

if (!supabaseUrl || !publishableKey) {
  throw new Error(`Failed to configure build credentials for target: ${target}`);
}

console.log(`[BUILD] Target: ${target}`);
console.log(`[BUILD] Project ID: ${projectId}`);
console.log(`[BUILD] Supabase URL: ${supabaseUrl}`);
console.log(`[BUILD] Output Directory: ${outputDir}`);

// 1. Build web & electron assets with Vite
console.log('[BUILD] Running vite build...');
const buildEnv = {
  ...process.env,
  VITE_SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  VITE_SUPABASE_PROJECT_ID: projectId
};

execFileSync('npm', ['run', 'build'], {
  env: buildEnv,
  stdio: 'inherit',
  shell: true
});

// 2. Package with electron-builder --win --publish never
console.log(`[BUILD] Running electron-builder to ${outputDir}...`);
execFileSync('npx', [
  'electron-builder',
  '--win',
  '--publish', 'never',
  `-c.directories.output=${outputDir}`
], {
  env: buildEnv,
  stdio: 'inherit',
  shell: true
});

// 3. Inspect generated artifacts
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

console.log('========================================================================');
console.log(`BUILD COMPLETED SUCCESSFULLY FOR TARGET: ${target.toUpperCase()}`);
console.log(`App Version: ${version}`);
console.log(`Commit SHA: ${commitSha}`);
console.log('========================================================================');

const targetDir = path.resolve(outputDir);
const files = fs.readdirSync(targetDir);
for (const f of files) {
  const fullPath = path.join(targetDir, f);
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex').toUpperCase();
    console.log(`File: ${f}`);
    console.log(`  Path: ${fullPath}`);
    console.log(`  Size: ${stat.size} bytes`);
    console.log(`  SHA-256: ${hash}`);
  }
}

