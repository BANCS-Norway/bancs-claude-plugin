#!/usr/bin/env node
// bcp SessionStart hook — seed the active workforce.
//
// On the first session after install, copy the default bundled workforce to
// ~/.claude/bcp/workforce.json so the engine (worktree/mission skills) always has a
// roster to read. Switch or update it any time with /bcp:workforce.
//
// Never fails the session: any missing piece exits 0 silently.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readPayload, shouldRun } from './lib/hook.mjs';

if (!shouldRun(readPayload(), { event: 'SessionStart' })) process.exit(0);

const root = process.env.CLAUDE_PLUGIN_ROOT;
if (!root) process.exit(0); // not running as an installed plugin; nothing to seed

const activeDir = join(homedir(), '.claude', 'bcp');
const active = join(activeDir, 'workforce.json');
const index = join(root, 'workforces', 'index.json');

if (existsSync(active) || !existsSync(index)) process.exit(0);

let id;
try {
  id = JSON.parse(readFileSync(index, 'utf8')).default;
} catch (err) {
  console.error(`bcp: cannot read ${index}: ${err.message}`);
  process.exit(0);
}
if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) process.exit(0);

const src = join(root, 'workforces', `${id}.json`);
if (!existsSync(src)) process.exit(0);

mkdirSync(activeDir, { recursive: true });
copyFileSync(src, active);
console.error(`bcp: seeded default workforce '${id}' → ${active}`);
