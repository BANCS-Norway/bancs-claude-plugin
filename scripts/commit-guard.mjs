#!/usr/bin/env node
// bcp PreToolUse hook — guard `git commit` (#45).
//
// Refuses a commit on the default branch, and one that stages a secret or a file over 1 MB; warns
// about stray staged files. A refusal is the documented JSON `permissionDecision: "deny"`, whose
// reason Claude sees and passes on with the way out. Commit message format stays with commitlint.
// Only staged content is checked: `git commit -a` and `git commit <path>` commit changes that are not
// staged yet, and `git -C <dir> commit` is not recognised, so those pass unchecked.
// Never fails the session (docs/hook-conventions.md, rule 4): anything unexpected exits 0 silently.
import { readPayload, shouldRun } from './lib/hook.mjs';
import { checkCommit, isCommitCommand } from './lib/commit-guard.mjs';

const payload = readPayload();
if (!shouldRun(payload, { event: 'PreToolUse', command: /\bgit\b[^\n]*\bcommit\b/ })) process.exit(0);
let isCommit = false;
try {
  isCommit = isCommitCommand(payload.tool_input.command);
} catch {
  // a command that cannot be read is not judged: never fail the session (docs/hook-conventions.md, rule 4)
}
if (!isCommit) process.exit(0);

let result;
try {
  result = checkCommit(typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd(), process.env);
} catch {
  process.exit(0);
}
const { blocks, warns } = result;

if (blocks.length) {
  const reason = ['bcp commit guard:', ...blocks, ...warns].join('\n\n');
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
} else if (warns.length) {
  console.log(JSON.stringify({ systemMessage: `bcp commit guard: ${warns.join('\n\n')}` }));
}
