#!/usr/bin/env node
// bcp PreToolUse hook — deny every `git -C` (#87).
//
// `git -C <dir> <subcommand>` gets past permission rules and hook filters written for plain
// `git <subcommand>` (the commit guard cannot recognise `git -C <dir> commit`, for one). The skills
// already say never to use it; this enforces it. A refusal is the documented JSON
// `permissionDecision: "deny"`, whose reason Claude sees and passes on with the way out: `cd` and run
// plain `git`. Does nothing outside a repo whose origin is on GitHub, like the rest of bcp.
// Never fails the session (docs/hook-conventions.md, rule 4): anything unexpected exits 0 silently.
//
// It guides a session and is not airtight. These forms pass:
// - `bash -c "git -C y log"`, `sh -c`, `eval`: quoted text is blanked by design (rule 6)
// - backticks: only `$(...)` is read as a command substitution
// - `sudo -u root git -C`, `env -i git -C`, `xargs -n1 git -C`: a wrapper's own options are not read
// - `timeout 5 git -C`, `nice git -C`, `stdbuf`: not in the list of wrappers (shell-command.mjs)
// - `\git -C`, `"git" -C`, `git "-C"`: an escaped or quoted word is not recognised
import { readPayload, shouldRun } from './lib/hook.mjs';
import { REASON, usesGitC } from './lib/git-c-guard.mjs';
import { repoOf } from './lib/repo.mjs';

const payload = readPayload();
if (!shouldRun(payload, { event: 'PreToolUse', command: /\bgit\b[\s\S]*-C/ })) process.exit(0);
try {
  if (!usesGitC(payload.tool_input.command)) process.exit(0);
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  if (!repoOf(cwd).onGitHub) process.exit(0);
} catch {
  process.exit(0); // a command that cannot be read is not judged (docs/hook-conventions.md, rule 4)
}
console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON } }));
