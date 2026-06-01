#!/usr/bin/env node
// CI-safe plugin validation: parse the manifests and check required fields and
// referenced paths exist. Does not require the `claude` CLI to be installed.
import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

async function readJson(rel) {
  try {
    return JSON.parse(await readFile(resolve(root, rel), 'utf8'));
  } catch (err) {
    errors.push(`${rel}: ${err.message}`);
    return null;
  }
}

async function exists(rel) {
  try {
    await access(resolve(root, rel));
    return true;
  } catch {
    return false;
  }
}

const manifest = await readJson('.claude-plugin/plugin.json');
if (manifest) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.name ?? '')) {
    errors.push(`plugin.json: "name" must be kebab-case (got ${JSON.stringify(manifest.name)})`);
  }
  const pathFields = []
    .concat(manifest.commands ?? [])
    .concat(manifest.skills ?? [])
    .concat(manifest.hooks ?? []);
  for (const p of pathFields) {
    if (!(await exists(p))) errors.push(`plugin.json: referenced path does not exist: ${p}`);
  }
}

const marketplace = await readJson('.claude-plugin/marketplace.json');
if (marketplace && !Array.isArray(marketplace.plugins)) {
  errors.push('marketplace.json: "plugins" must be an array');
}

// --- workforces ---
const KEBAB = /^[a-z0-9][a-z0-9-]*$/;

function checkWorkforce(rel, wf) {
  if (!wf) return;
  if (!KEBAB.test(wf.id ?? '')) errors.push(`${rel}: "id" must be kebab-case`);
  if (!wf.name) errors.push(`${rel}: missing "name"`);
  if (!Array.isArray(wf.members) || wf.members.length === 0) {
    errors.push(`${rel}: "members" must be a non-empty array`);
    return;
  }
  const seen = new Set();
  for (const m of wf.members) {
    if (!KEBAB.test(m.id ?? '')) errors.push(`${rel}: member "id" must be kebab-case (got ${JSON.stringify(m.id)})`);
    if (seen.has(m.id)) errors.push(`${rel}: duplicate member id "${m.id}"`);
    seen.add(m.id);
    for (const field of ['label', 'bestFor', 'style']) {
      if (!m[field]) errors.push(`${rel}: member "${m.id}" missing "${field}"`);
    }
  }
}

const index = await readJson('workforces/index.json');
if (index) {
  if (!Array.isArray(index.workforces) || index.workforces.length === 0) {
    errors.push('workforces/index.json: "workforces" must be a non-empty array');
  } else {
    const ids = new Set();
    for (const entry of index.workforces) {
      ids.add(entry.id);
      if (!entry.file) { errors.push(`workforces/index.json: entry "${entry.id}" missing "file"`); continue; }
      const rel = `workforces/${entry.file}`;
      if (!(await exists(rel))) { errors.push(`workforces/index.json: file does not exist: ${rel}`); continue; }
      checkWorkforce(rel, await readJson(rel));
    }
    if (index.default && !ids.has(index.default)) {
      errors.push(`workforces/index.json: "default" (${index.default}) is not a listed workforce`);
    }
  }
}

if (errors.length) {
  console.error('Plugin validation failed:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('Plugin validation passed.');
