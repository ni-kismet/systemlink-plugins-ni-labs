import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

function parseArgs(argv) {
  const result = { pluginDir: null, sourceRepo: process.env.GITHUB_REPOSITORY || '' };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!result.pluginDir && !arg.startsWith('--')) {
      result.pluginDir = arg;
      continue;
    }
    if (arg === '--source-repo') {
      result.sourceRepo = argv[index + 1] || '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.pluginDir) {
    throw new Error('Usage: node scripts/create-submission-manifest.mjs <plugin-dir> [--source-repo owner/name]');
  }
  return result;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function gitHead(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

const args = parseArgs(process.argv);
const pluginDir = path.resolve(args.pluginDir);
const repoRoot = path.resolve(pluginDir, '..', '..');
const configPath = path.join(pluginDir, 'nipkg.config.json');
const outputDir = path.join(pluginDir, 'dist', 'nipkg');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const files = await readdir(outputDir);
const nipkgName = files.find((file) => file.endsWith('.nipkg'));

if (!nipkgName) {
  throw new Error(`No .nipkg found in ${outputDir}. Run the package step first.`);
}

if (!args.sourceRepo) {
  throw new Error('source repository is required; pass --source-repo or set GITHUB_REPOSITORY');
}

const nipkgPath = path.join(outputDir, nipkgName);
const nipkgBuffer = await readFile(nipkgPath);
const manifest = {
  schemaVersion: 2,
  nipkgFile: nipkgName,
  sha256: sha256(nipkgBuffer),
  sourceRepo: args.sourceRepo,
  releaseTag: `${config.package}-v${config.version}`,
  sourceCommit: gitHead(repoRoot)
};

const manifestPath = path.join(pluginDir, 'submission-manifest.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(manifestPath);
