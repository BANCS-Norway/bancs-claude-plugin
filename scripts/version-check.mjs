#!/usr/bin/env node
// bcp SessionStart hook — notice when Claude Code has changed version since the last session.
//
// Claude Code passes no version to hooks (docs/native-overlap.md, HK3), so ask the running
// binary: `$CLAUDE_CODE_EXECPATH --version`, else `claude --version`. The last version seen
// lives in ~/.claude/bcp/claude-version.json. The first run records it silently; a change is
// shown to the user once and the new version is stored straight away. Reviewing the shims is
// #36's job (it updates their `checked` dates); this file only records what ran.
//
// Never fails the session: any missing piece exits 0 silently.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { readPayload, shouldRun } from './lib/hook.mjs';

const payload = readPayload();
if (!shouldRun(payload, { event: 'SessionStart' })) process.exit(0);
// The version can only change when a new process starts; clear and compact reuse the old one.
if (payload.source && !['startup', 'resume'].includes(payload.source)) process.exit(0);

const current = runningVersion();
if (!current) process.exit(0);

const file = join(homedir(), '.claude', 'bcp', 'claude-version.json');
const seen = lastSeen(file);
if (seen === current) process.exit(0);

try {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ seen: current, at: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
} catch (err) {
  console.error(`bcp: cannot write ${file}: ${err.message}`);
  process.exit(0);
}

if (seen) {
  console.log(JSON.stringify({ systemMessage: `bcp: Claude Code updated ${seen} → ${current}` }));
}

/** The running Claude Code version, or undefined. */
function runningVersion() {
  const bin = process.env.CLAUDE_CODE_EXECPATH || 'claude';
  const out = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 });
  return out.status === 0 ? /^\s*(\d+\.\d+\.\d+[^\s]*)/.exec(out.stdout)?.[1] : undefined;
}

/** The stored version, or undefined when the file is missing or unreadable (first run). */
function lastSeen(path) {
  try {
    const v = JSON.parse(readFileSync(path, 'utf8')).seen;
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}
