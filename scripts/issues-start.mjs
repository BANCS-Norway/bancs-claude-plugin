#!/usr/bin/env node
// bcp SessionStart hook — point a new session at the `issues` skill (#47, IS8).
//
// A hook cannot run a skill (docs/native-overlap.md, IS8). It can add context, so when a session
// starts with no active issue work log, the context says so and names the skill that lists what to
// work on next. The text states facts and gives no command. Silent on resume and compact, outside a
// repo whose origin is on GitHub, and whenever a work log exists in the project's memory folder.
// Any work log counts, so a stale one (an abandoned issue) silences the pointer until
// `work-log.mjs remove N` clears it.
// Never fails the session (docs/hook-conventions.md, rule 4): anything missing exits 0 silently.
import { readPayload, shouldRun } from './lib/hook.mjs';
import { repoOf } from './lib/repo.mjs';
import { memoryFolder, activeLogs } from './lib/work-log.mjs';

const payload = readPayload();
if (!shouldRun(payload, { event: 'SessionStart' })) process.exit(0);
if (payload.source && !['startup', 'clear'].includes(payload.source)) process.exit(0); // resume, compact: not new

try {
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  if (!repoOf(cwd).onGitHub) process.exit(0); // the issues skill reads GitHub issues through gh
  const memory = memoryFolder(cwd);
  if (!memory || activeLogs(memory).length) process.exit(0);
} catch {
  process.exit(0);
}

const additionalContext =
  'bcp: this session starts with no active issue work log for this project. ' +
  'The `issues` skill syncs the open GitHub issues and lists what to work on next.';
console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));
