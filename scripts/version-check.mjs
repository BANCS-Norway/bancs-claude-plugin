#!/usr/bin/env node
// bcp SessionStart hook — notice a new Claude Code version, and list the shims to recheck.
//
// 1. Version (#35). Claude Code passes no version to hooks (docs/native-overlap.md, HK3), so ask
//    the running binary: `$CLAUDE_CODE_EXECPATH --version`, else `claude --version`. The last
//    version seen lives in ~/.claude/bcp/claude-version.json as { seen, at }. The first run
//    records it silently; a change is shown once and stored straight away.
// 2. Stale shims (#36). In a bcp checkout only, list the shims whose `checked` month is before
//    the month of the last version change (`at`). Shown every session there until
//    /bcp:shim-review updates their `checked`; other repos never see it.
//
// Both go out as one systemMessage. Never fails the session: any missing piece exits 0 silently.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { readPayload, shouldRun } from './lib/hook.mjs';
import { bcpCheckout, isStale, loadShims } from './lib/shims.mjs';

const payload = readPayload();
if (!shouldRun(payload, { event: 'SessionStart' })) process.exit(0);
// The version can only change when a new process starts; clear and compact reuse the old one.
if (payload.source && !['startup', 'resume'].includes(payload.source)) process.exit(0);

const messages = [];
const file = join(homedir(), '.claude', 'bcp', 'claude-version.json');
let state = readState(file);

const current = runningVersion();
if (current && state?.seen !== current) {
  const next = { seen: current, at: new Date().toISOString().slice(0, 10) };
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    if (state?.seen) messages.push(`bcp: Claude Code updated ${state.seen} → ${current}`);
    state = next;
  } catch (err) {
    console.error(`bcp: cannot write ${file}: ${err.message}`);
  }
}

const checkout = bcpCheckout(payload.cwd || process.cwd());
const since = /^\d{4}-\d{2}/.exec(state?.at ?? '')?.[0];
if (checkout && since) {
  const stale = loadShims(checkout).filter((s) => isStale(s, since));
  if (stale.length) {
    const n = stale.length === 1 ? '1 shim' : `${stale.length} shims`;
    messages.push(`bcp: ${n} last checked before ${since}: ${stale.map((s) => s.id).join(', ')} — run /bcp:shim-review`);
  }
}

if (messages.length) console.log(JSON.stringify({ systemMessage: messages.join('\n') }));

/** The running Claude Code version, or undefined. */
function runningVersion() {
  const bin = process.env.CLAUDE_CODE_EXECPATH || 'claude';
  const out = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 });
  return out.status === 0 ? /^\s*(\d+\.\d+\.\d+[^\s]*)/.exec(out.stdout)?.[1] : undefined;
}

/** { seen, at } from the state file, or undefined when it is missing or unreadable (first run). */
function readState(path) {
  try {
    const s = JSON.parse(readFileSync(path, 'utf8'));
    return typeof s?.seen === 'string' ? s : undefined;
  } catch {
    return undefined;
  }
}
