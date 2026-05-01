import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const pluginArg = process.argv[2];
const sourceArg = process.argv[3];
const outputArg = process.argv[4];

if (!pluginArg || !sourceArg || !outputArg) {
  console.error('Usage: node scripts/build-plugin-payload.mjs <plugin-dir> <source-subdir> <output-subdir>');
  process.exit(1);
}

const pluginDir = path.resolve(pluginArg);
const sourceDir = path.join(pluginDir, sourceArg);
const outputDir = path.join(pluginDir, outputArg);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });

console.log(`Copied ${sourceDir} -> ${outputDir}`);