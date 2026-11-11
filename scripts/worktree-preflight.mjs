#!/usr/bin/env node
// Checks run by worktree-create before it creates anything (#42, from #1).
//
// The arguments arrive on stdin as one line:  <issue-number> <branch> <worktree-path>
//   e.g.  42 feat/42_skills-read-repo-conventions .worktrees/feat-42-skills-read-repo-conventions
//
// Prints `base: <ref>` (what to start the branch from) when it is known, then one line per check:
// `ok:`, `warn:` or `FAIL:`, then `preflight: passed` or `preflight: failed`. Exit 1 on a failed
// check or bad arguments, 0 otherwise. A warning does not fail the run.
import { readFileSync } from 'node:fs';
import { preflight } from './lib/preflight.mjs';

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
  console.error('worktree-preflight: expected <issue-number> <branch> <worktree-path>');
  process.exit(1);
}

const { base, results, ok } = preflight({ cwd: process.cwd(), issue: Number(issueText), branch, path });
if (base) console.log(`base: ${base}`);
for (const { level, msg } of results) console.log(`${level}: ${msg}`);
console.log(`preflight: ${ok ? 'passed' : 'failed'}`);
process.exit(ok ? 0 : 1);
