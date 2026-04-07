import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const pluginArg = process.argv[2];
if (!pluginArg) {
  console.error('Usage: node scripts/build-static-plugin.mjs <plugin-dir>');
  process.exit(1);
}

const pluginDir = path.resolve(pluginArg);
const sourceDir = path.join(pluginDir, 'app');
const outputDir = path.join(pluginDir, 'dist', 'webapp', 'browser');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });

console.log(`Copied ${sourceDir} -> ${outputDir}`);
