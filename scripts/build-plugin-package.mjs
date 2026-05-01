import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { gunzipSync, gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { Deboa } = require('deboa');

function parseArgs(argv) {
  const pluginArg = argv[2];
  if (!pluginArg) {
    throw new Error('Usage: node scripts/build-plugin-package.mjs <plugin-dir>');
  }

  return {
    pluginDir: path.resolve(pluginArg)
  };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isPlausibleArHeader(buffer, offset) {
  if (offset === buffer.length) {
    return true;
  }
  if (offset + 60 > buffer.length) {
    return false;
  }
  return buffer.toString('ascii', offset + 58, offset + 60) === '`\n';
}

function parseAr(buffer) {
  if (buffer.toString('ascii', 0, 8) !== '!<arch>\n') {
    throw new Error('Not a valid ar archive');
  }

  const members = [];
  let offset = 8;

  while (offset + 60 <= buffer.length) {
    const headerOffset = offset;
    const name = buffer.toString('ascii', offset, offset + 16).trim().replace(/\/$/, '');
    const date = buffer.toString('ascii', offset + 16, offset + 28).trim();
    const uid = buffer.toString('ascii', offset + 28, offset + 34).trim();
    const gid = buffer.toString('ascii', offset + 34, offset + 40).trim();
    const mode = buffer.toString('ascii', offset + 40, offset + 48).trim();
    const size = Number.parseInt(buffer.toString('ascii', offset + 48, offset + 58).trim(), 10);

    if (!Number.isFinite(size)) {
      throw new Error(`Invalid ar member size at offset ${headerOffset}`);
    }

    offset += 60;
    const data = buffer.subarray(offset, offset + size);
    members.push({ name, headerFields: { date, uid, gid, mode }, data });
    offset += size;

    if (size % 2 !== 0) {
      const offsetWithPadding = offset + 1;
      if (isPlausibleArHeader(buffer, offsetWithPadding) && !isPlausibleArHeader(buffer, offset)) {
        offset = offsetWithPadding;
      }
    }
  }

  return members;
}

function buildAr(members) {
  const parts = [Buffer.from('!<arch>\n', 'ascii')];

  for (const member of members) {
    const header = Buffer.alloc(60, 0x20);
    const nameField = `${member.name}/`;
    header.write(nameField.slice(0, 16), 0, 16, 'ascii');
    header.write(member.headerFields.date, 16, member.headerFields.date.length, 'ascii');
    header.write(member.headerFields.uid, 28, member.headerFields.uid.length, 'ascii');
    header.write(member.headerFields.gid, 34, member.headerFields.gid.length, 'ascii');
    header.write(member.headerFields.mode, 40, member.headerFields.mode.length, 'ascii');
    const sizeStr = member.data.length.toString();
    header.write(sizeStr, 48, sizeStr.length, 'ascii');
    header.write('`\n', 58, 2, 'ascii');
    parts.push(header, Buffer.from(member.data));
    if (member.data.length % 2 !== 0) {
      parts.push(Buffer.from('\n'));
    }
  }

  return Buffer.concat(parts);
}

function createTarGzSingleFile(filename, content) {
  const header = Buffer.alloc(512);
  header.write(filename, 0, Math.min(Buffer.byteLength(filename, 'utf8'), 100), 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  const sizeOctal = content.length.toString(8).padStart(11, '0');
  header.write(`${sizeOctal}\0`, 124, 12, 'ascii');
  const mtimeOctal = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
  header.write(`${mtimeOctal}\0`, 136, 12, 'ascii');
  header.write('        ', 148, 8, 'ascii');
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let checksum = 0;
  for (let index = 0; index < 512; index += 1) {
    checksum += header[index];
  }
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');

  const paddedLength = Math.ceil(content.length / 512) * 512;
  const dataBlock = Buffer.alloc(paddedLength);
  content.copy(dataBlock);
  const endBlock = Buffer.alloc(1024);

  return gzipSync(Buffer.concat([header, dataBlock, endBlock]));
}

function encodeFileAsBase64(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeByExtension = new Map([
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg']
  ]);
  const mime = mimeByExtension.get(ext) ?? 'application/octet-stream';
  return `data:${mime};base64,${require('node:fs').readFileSync(filePath).toString('base64')}`;
}

function getTags(config) {
  return config.tags ?? config.slPluginManagerTags ?? config.appStoreTags;
}

function buildControlContent(config, configPath) {
  const lines = [
    `Package: ${config.package}`,
    `Version: ${config.version}`
  ];

  if (config.section) {
    lines.push(`Section: ${config.section}`);
  }

  lines.push('Priority: optional');
  lines.push(`Architecture: ${config.architecture ?? 'all'}`);
  lines.push(`Maintainer: ${config.maintainer}`);

  if (Array.isArray(config.depends) && config.depends.length > 0) {
    lines.push(`Depends: ${config.depends.join(', ')}`);
  }

  if (config.homepage) {
    lines.push(`Homepage: ${config.homepage}`);
  }

  const tags = getTags(config);
  if (tags) {
    lines.push(`Tags: ${tags}`);
  }

  lines.push(`Description: ${config.description ?? ''}`);
  lines.push(`XB-Plugin: ${config.xbPlugin ?? 'webapp'}`);

  if (config.displayName) {
    lines.push(`XB-DisplayName: ${config.displayName}`);
  }

  lines.push(`XB-UserVisible: ${config.userVisible ?? 'yes'}`);
  lines.push(`XB-DisplayVersion: ${config.version}`);

  if (config.iconFile) {
    const resolvedIcon = path.resolve(path.dirname(configPath), config.iconFile);
    lines.push(`XB-SlPluginManagerIcon: ${encodeFileAsBase64(resolvedIcon)}`);
  }

  if (config.license) {
    lines.push(`XB-SlPluginManagerLicense: ${config.license}`);
  }

  if (config.slPluginManagerTags) {
    lines.push(`XB-SlPluginManagerTags: ${config.slPluginManagerTags}`);
  }

  if (config.slPluginManagerMinServerVersion) {
    lines.push(`XB-SlPluginManagerMinServerVersion: ${config.slPluginManagerMinServerVersion}`);
  }

  for (const [key, value] of Object.entries(config.extraControlFields ?? {})) {
    lines.push(`${key}: ${value}`);
  }

  return `${lines.join('\n')}\n`;
}

async function ensureDirectoryExists(directoryPath) {
  try {
    await stat(directoryPath);
  } catch {
    throw new Error(`Directory not found: ${directoryPath}`);
  }
}

const args = parseArgs(process.argv);
const pluginDir = args.pluginDir;
const configPath = path.join(pluginDir, 'nipkg.config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));

if (!config.package || !config.version || !config.maintainer) {
  throw new Error('nipkg.config.json must define package, version, and maintainer');
}

const buildDir = path.resolve(pluginDir, config.buildDir ?? 'dist');
await ensureDirectoryExists(buildDir);

const outputDir = path.join(pluginDir, 'dist', 'nipkg');
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const tempSourceRoot = await mkdtemp(path.join(tmpdir(), 'sl-plugin-package-'));
const sourceDir = path.join(tempSourceRoot, 'source');
const applicationFilesDir = path.join(sourceDir, 'ApplicationFiles_64');
await mkdir(applicationFilesDir, { recursive: true });
await cp(buildDir, applicationFilesDir, { recursive: true });

const architecture = config.architecture ?? 'all';
const packageBaseName = `${config.package}_${config.version}_${architecture}`;
const debPath = path.join(outputDir, `${packageBaseName}.deb`);
const nipkgPath = path.join(outputDir, `${packageBaseName}.nipkg`);

const controlFileOptions = {
  maintainer: config.maintainer,
  packageName: config.package,
  shortDescription: config.description ?? '',
  version: config.version,
  architecture,
  ...(Array.isArray(config.depends) && config.depends.length > 0 ? { depends: config.depends.join(', ') } : {})
};

const deboa = new Deboa({
  controlFileOptions,
  sourceDir,
  targetDir: outputDir,
  targetFileName: packageBaseName
});

await deboa.package();

const members = parseAr(await readFile(debPath));
const controlMember = members.find((member) => member.name === 'control.tar.gz');

if (!controlMember) {
  throw new Error('control.tar.gz not found in generated .deb');
}

controlMember.data = createTarGzSingleFile('./control', Buffer.from(buildControlContent(config, configPath), 'utf8'));
await writeFile(debPath, buildAr(members));
await rename(debPath, nipkgPath);

const artifact = await readFile(nipkgPath);
console.log(`Created ${path.relative(pluginDir, nipkgPath)}`);
console.log(`SHA256 ${sha256(artifact)}`);

await rm(tempSourceRoot, { recursive: true, force: true });