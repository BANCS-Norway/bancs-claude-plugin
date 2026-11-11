#!/usr/bin/env node
// Creates the worktree for an issue; run by worktree-create after the names are confirmed (#44).
//
// The arguments arrive on stdin as one line:  <issue-number> <branch> <worktree-path>
//   e.g.  44 refactor/44_split-mixed-skills .worktrees/refactor-44-split-mixed-skills
//
// Runs the preflight again (so it cannot be skipped), then creates the worktree from the base the
// preflight names, links or installs node_modules and runs `direnv allow` where the project uses
// direnv. Prints `base: <ref>`, one `ok:`, `warn:` or `FAIL:` line per check or step, then
// `start: done` or `start: failed`. A failed check creates nothing. Exit 1 on failure or bad arguments.
import { readFileSync } from 'node:fs';
import { startWorktree } from './lib/worktree.mjs';

let args = '';
if (!process.stdin.isTTY) {
  try {
    args = readFileSync(0, 'utf8');
  } catch {
    // no stdin: no arguments
  }
}
const [issueText, branch, path, ...extra] = args.trim().split(/\s+/).filter(Boolean);
if (!/^\d+$/.test(issueText ?? '') || !branch || !path || extra.length) {
  console.error('worktree-start: expected <issue-number> <branch> <worktree-path>');
  process.exit(1);
}

const { base, results, ok } = startWorktree({ cwd: process.cwd(), issue: Number(issueText), branch, path });
if (base) console.log(`base: ${base}`);
for (const { level, msg } of results) console.log(`${level}: ${msg}`);
console.log(`start: ${ok ? 'done' : 'failed'}`);
process.exit(ok ? 0 : 1);
