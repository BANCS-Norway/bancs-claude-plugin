#!/usr/bin/env node
// bcp PreToolUse hook — keep edits out of the main checkout (#85).
//
// Refuses Write, Edit and NotebookEdit on a file in the main checkout, in a repo whose `worktree_guard`
// fact is on; `.worktrees/` and `.claude/` stay open. A refusal is the documented JSON
// `permissionDecision: "deny"`, whose reason Claude sees and passes on with the way out.
// Never fails the session (docs/hook-conventions.md, rule 4): anything unexpected exits 0 silently.
import { readPayload, shouldRun, toolPath } from './lib/hook.mjs';
import { checkEdit } from './lib/worktree-guard.mjs';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

const payload = readPayload();
if (!shouldRun(payload, { event: 'PreToolUse', path: /./ })) process.exit(0);
if (payload.tool_name && !EDIT_TOOLS.has(payload.tool_name)) process.exit(0);

let reason = null;
try {
  reason = checkEdit(toolPath(payload), typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd());
} catch {
  process.exit(0);
}
if (reason) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `bcp worktree guard:\n\n${reason}` } }));
}
