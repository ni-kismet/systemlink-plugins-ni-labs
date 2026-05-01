import { gunzipSync } from 'node:zlib';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

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
    const name = buffer.toString('ascii', offset, offset + 16).trim().replace(/\/$/, '');
    const size = Number.parseInt(buffer.toString('ascii', offset + 48, offset + 58).trim(), 10);
    if (!Number.isFinite(size)) {
      throw new Error(`Invalid member size for archive member starting at byte ${offset}`);
    }

    offset += 60;
    members.push({
      name,
      data: buffer.subarray(offset, offset + size)
    });
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

function parseTarEntries(buffer) {
  const entries = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    const empty = header.every((byte) => byte === 0);
    if (empty) {
      break;
    }

    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const sizeOctal = header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim();
    const size = sizeOctal === '' ? 0 : Number.parseInt(sizeOctal, 8);

    if (!Number.isFinite(size)) {
      throw new Error(`Invalid tar entry size for ${name || '<unnamed>'}`);
    }

    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) {
      throw new Error(`Tar entry exceeds archive bounds for ${name || '<unnamed>'}`);
    }
    entries.push({
      name,
      data: buffer.subarray(dataStart, dataEnd)
    });

    offset = dataStart + Math.ceil(size / 512) * 512;
    if (offset > buffer.length) {
      throw new Error(`Tar archive is truncated after ${name || '<unnamed>'}`);
    }
  }

  return entries;
}

function getRequiredMember(members, name) {
  const member = members.find((candidate) => candidate.name === name);
  if (!member) {
    const names = members.map((candidate) => candidate.name).join(', ');
    throw new Error(`Missing ${name} in archive. Found: ${names}`);
  }
  return member;
}

function getRequiredTarEntry(entries, names) {
  const entry = entries.find((candidate) => names.includes(candidate.name));
  if (!entry) {
    throw new Error(`Missing tar entry. Expected one of: ${names.join(', ')}`);
  }
  return entry;
}

const pluginArg = process.argv[2];
if (!pluginArg) {
  console.error('Usage: node scripts/verify-plugin-package.mjs <plugin-dir>');
  process.exit(1);
}

const pluginDir = path.resolve(pluginArg);
const config = JSON.parse(await readFile(path.join(pluginDir, 'nipkg.config.json'), 'utf8'));
const nipkgDir = path.join(pluginDir, 'dist', 'nipkg');
const nipkgName = (await readdir(nipkgDir)).find((file) => file.endsWith('.nipkg'));

if (!nipkgName) {
  throw new Error(`No .nipkg found in ${nipkgDir}`);
}

const members = parseAr(await readFile(path.join(nipkgDir, nipkgName)));
getRequiredMember(members, 'debian-binary');
const controlMember = getRequiredMember(members, 'control.tar.gz');
const dataMember = getRequiredMember(members, 'data.tar.gz');

const controlEntries = parseTarEntries(gunzipSync(controlMember.data));
const controlEntry = getRequiredTarEntry(controlEntries, ['./control', 'control']);
const controlContent = controlEntry.data.toString('utf8');

const expectedPlugin = config.xbPlugin ?? 'webapp';
if (!controlContent.includes(`XB-Plugin: ${expectedPlugin}`)) {
  throw new Error(`Control file does not contain XB-Plugin: ${expectedPlugin}`);
}

if (config.displayName && !controlContent.includes(`XB-DisplayName: ${config.displayName}`)) {
  throw new Error(`Control file does not contain XB-DisplayName: ${config.displayName}`);
}

const dataEntries = parseTarEntries(gunzipSync(dataMember.data));
if (expectedPlugin === 'notebook' && !dataEntries.some((entry) => entry.name.endsWith('.ipynb'))) {
  throw new Error('Notebook package payload does not contain an .ipynb file');
}

if (expectedPlugin === 'webapp' && !dataEntries.some((entry) => entry.name.endsWith('index.html'))) {
  throw new Error('Webapp package payload does not contain index.html');
}

console.log(`Verified ${nipkgName}`);
console.log(`Plugin type: ${expectedPlugin}`);