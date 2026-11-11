#!/usr/bin/env node
// What worktree-cleanup asks of git, and what it does there (#44).
//
// The arguments arrive on stdin as one line:  <status|remove> <issue-number> <branch> <worktree-path>
//   e.g.  remove 44 refactor/44_split-mixed-skills .worktrees/refactor-44-split-mixed-skills
//
// status   Read-only. Prints `key: value` lines: primary (the primary checkout), worktree and branch
//          (`present` or `gone`; both gone means an interrupted cleanup), dirty, pr. Exit 0.
// remove   Removes the worktree (git refuses a dirty one), then deletes the local branch: `-d`, and
//          `-D` only after a squash merge is confirmed on GitHub with nothing unmerged on the branch.
//          Prints one `ok:` or `FAIL:` line per step, then `finish: done` or `finish: failed`.
//          Exit 1 on a failed step. Run it from anywhere: it works from the primary checkout.
import { readFileSync } from 'node:fs';
import { finishWorktree, worktreeStatus } from './lib/worktree.mjs';

let args = '';
if (!process.stdin.isTTY) {
  try {
    args = readFileSync(0, 'utf8');
  } catch {
    // no stdin: no arguments
  }
}
const [verb, issueText, branch, path, ...extra] = args.trim().split(/\s+/).filter(Boolean);
if (!['status', 'remove'].includes(verb) || !/^\d+$/.test(issueText ?? '') || !branch || !path || extra.length) {
  console.error('worktree-finish: expected <status|remove> <issue-number> <branch> <worktree-path>');
  process.exit(1);
}

if (verb === 'status') {
  const { ok, lines } = worktreeStatus({ cwd: process.cwd(), branch, path });
  console.log(lines.join('\n'));
  process.exit(ok ? 0 : 1);
}
const { results, ok, main } = finishWorktree({ cwd: process.cwd(), branch, path });
for (const { level, msg } of results) console.log(`${level}: ${msg}`);
if (main) console.log(`primary: ${main}`);
console.log(`finish: ${ok ? 'done' : 'failed'}`);
process.exit(ok ? 0 : 1);
