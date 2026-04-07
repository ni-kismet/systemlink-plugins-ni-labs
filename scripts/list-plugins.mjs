import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const pluginsRoot = path.join(repoRoot, 'plugins');
const inputFilter = (process.env.INPUT_PLUGIN || '').trim();
const tagFilter = (process.env.TAG_NAME || '').trim();

const entries = await readdir(pluginsRoot, { withFileTypes: true });
const plugins = [];

for (const entry of entries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const pluginDir = path.join(pluginsRoot, entry.name);
  const configPath = path.join(pluginDir, 'nipkg.config.json');
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const tag = `${config.package}-v${config.version}`;
    plugins.push({
      name: entry.name,
      path: `plugins/${entry.name}`,
      package: config.package,
      version: config.version,
      displayName: config.displayName,
      tag
    });
  } catch {
    // Ignore directories that are not plugin definitions.
  }
}

const filtered = plugins.filter((plugin) => {
  if (inputFilter) {
    return plugin.name === inputFilter || plugin.package === inputFilter;
  }
  if (tagFilter) {
    return plugin.tag === tagFilter;
  }
  return true;
});

process.stdout.write(JSON.stringify(filtered));
