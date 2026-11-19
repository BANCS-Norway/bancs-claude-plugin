#!/usr/bin/env node
// bcp PreToolUse hook — keep `gh pr create` behind the push (#85).
//
// Refuses `gh pr create` unless the branch has an upstream and no commits the upstream lacks, in a repo
// whose `worktree_guard` fact is on. The human pushes; the reason says to wait for "pushed". A refusal is
// the documented JSON `permissionDecision: "deny"`, whose reason Claude sees and passes on with the way out.
// Never fails the session (docs/hook-conventions.md, rule 4): anything unexpected exits 0 silently.
import { readPayload, shouldRun } from './lib/hook.mjs';
import { checkPr, isPrCreate } from './lib/worktree-guard.mjs';

const payload = readPayload();
if (!shouldRun(payload, { event: 'PreToolUse', command: /\bgh\s+pr\s+create\b/ })) process.exit(0);

let reason = null;
try {
  const command = payload.tool_input.command;
  if (!isPrCreate(command)) process.exit(0);
  reason = checkPr(command, typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd());
} catch {
  process.exit(0); // a command that cannot be read is not judged (docs/hook-conventions.md, rule 4)
}
if (reason) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `bcp worktree guard:\n\n${reason}` } }));
}
