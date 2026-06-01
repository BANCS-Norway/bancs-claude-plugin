#!/usr/bin/env node
// Sync a release version into the plugin manifest.
// Invoked by semantic-release's @semantic-release/exec prepare step:
//   node scripts/set-version.mjs <version>
import { readFile, writeFile } from 'node:fs/promises';

const version = process.argv[2];
if (!version) {
  console.error('Usage: set-version.mjs <version>');
  process.exit(1);
}

const manifestPath = new URL('../.claude-plugin/plugin.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.version = version;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Set plugin.json version to ${version}`);
