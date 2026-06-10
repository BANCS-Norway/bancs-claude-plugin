#!/usr/bin/env node
// bcp PreToolUse / PostToolUse hook — serialize MEMORY.md writes across concurrent
// clone sessions so two saves can't clobber each other mid read-modify-write.
//
// Mode (argv[2]):
//   acquire  — PreToolUse:  take the lock before a Write/Edit to a MEMORY.md
//   release  — PostToolUse: drop the lock after the write
//
// The lock scope follows the write path: whichever MEMORY.md the tool targets is
// the one we guard. A global install protects global memory; a project-scoped
// install only ever sees that project's memory. No install-mode awareness needed.
//
// Acquisition is atomic via `mkdir` (atomic on POSIX and Windows; `flock` is not,
// see #9). Contention waits a bounded time; on timeout we hand the call to the
// human (the stale-lock gate) rather than guess whether the holder crashed or is
// merely slow. Real holds are sub-second, so a timeout almost always means a
// crashed or permission-denied holder, but only the human can be sure.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readPayload, shouldRun, toolPath } from './lib/hook.mjs';

// Only MEMORY.md writes are guarded; everything else passes straight through.
// Coverage is the file-editing tools wired in hooks.json (Write/Edit/MultiEdit).
// A memory write made some other way, e.g. a raw `echo >> MEMORY.md` from the Bash
// tool, never reaches this hook and would need its own guard. The memory protocol
// uses the Write tool, so that boundary is fine today; flag it here so a future
// switch to append-via-shell doesn't silently lose protection.
const payload = readPayload();
if (!shouldRun(payload, { path: /(^|\/)MEMORY\.md$/ })) process.exit(0);

const mode = process.argv[2];
const lock = join(dirname(toolPath(payload)), 'MEMORY.md.lock');

if (mode === 'release') {
  // Intentionally identity-blind: clear whatever lock sits at this path, without
  // checking that this invocation created it. With a single live holder that's a
  // plain release. It is also what makes the human-approved break-in below work:
  // the breaking write's release clears the stale holder's lock. (Recursive,
  // because the holder facts live inside the dir.)
  try {
    rmSync(lock, { recursive: true, force: true });
  } catch {
    // never fail the session
  }
  process.exit(0);
}

if (mode !== 'acquire') process.exit(0);

const timeoutSeconds = Number(process.env.BCP_MEMORY_LOCK_TIMEOUT);
const timeoutMs = (Number.isFinite(timeoutSeconds) && timeoutSeconds >= 0 ? timeoutSeconds : 10) * 1000; // real holds are sub-second
const deadline = Date.now() + timeoutMs;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function tryLock() {
  try {
    mkdirSync(lock);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err; // unexpected (missing directory, permissions): handled below
  }
}

try {
  for (;;) {
    if (tryLock()) {
      // Won the lock. Record holder facts for the stale-lock gate.
      try {
        const facts = [
          `clone=${process.env.BCP_CLONE ?? 'unknown'}`,
          `session=${typeof payload.session_id === 'string' ? payload.session_id : ''}`,
          `pid=${process.pid}`,
          `since=${new Date().toISOString()}`,
        ];
        writeFileSync(join(lock, 'holder'), facts.join('\n') + '\n');
      } catch {
        // holder facts are advisory
      }
      process.exit(0);
    }
    // Contended: wait for the holder to release, up to the deadline.
    if (Date.now() >= deadline) break;
    sleep(200);
  }
} catch {
  process.exit(0); // cannot create the lock at all: do not block the write
}

// Timed out. Hand the decision to the human instead of breaking the lock blindly.
let holder = 'unknown';
try {
  holder = readFileSync(join(lock, 'holder'), 'utf8').trim().replaceAll('\n', ' ') || 'unknown';
} catch {
  // no holder facts
}
const reason =
  `MEMORY.md is locked (${lock}), held by [${holder}]. A normal write releases in well under a second, ` +
  'so the holder most likely crashed or had its write denied. Approve to break the stale lock and proceed; ' +
  'reject to leave it for the live holder.';
console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  }),
);
