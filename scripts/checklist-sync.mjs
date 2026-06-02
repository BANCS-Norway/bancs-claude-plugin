#!/usr/bin/env node
// Sync a worktree's CHECKLIST.md into a GitHub issue body's checklist block.
//
//   node checklist-sync.mjs <issue-number> [checklist-path]
//
// - Reads the `- [ ]` / `- [x]` items from CHECKLIST.md (default ./CHECKLIST.md).
// - Fetches the issue body via `gh issue view`.
// - SYNC: if the body has <!-- checklist:start -->/<!-- checklist:end --> markers,
//   replace the marked block with the items.
// - SEED: otherwise, wrap the issue body's existing checkbox list in markers.
// - Writes the result back via `gh issue edit --body-file -`.
//
// Robust against prose that merely *mentions* the markers — detection matches the
// exact marker comments, not a substring. Never writes a partial result: on any
// failure it exits non-zero without editing the issue.
//
// Requires: `gh` (authenticated). Pure Node, cross-platform (no shell-isms).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const START = '<!-- checklist:start -->';
const END = '<!-- checklist:end -->';
const BLOCK_RE = /<!-- checklist:start -->[\s\S]*?<!-- checklist:end -->/;
const ITEM_RE = /^- \[[ xX]\] /;

const issue = process.argv[2];
const checklistPath = process.argv[3] || 'CHECKLIST.md';

if (!issue || !/^\d+$/.test(issue)) {
  console.error('Usage: checklist-sync.mjs <issue-number> [checklist-path]');
  process.exit(2);
}

const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input });

// 1. Read the checklist items.
let items;
try {
  items = readFileSync(checklistPath, 'utf8').split('\n').filter((l) => ITEM_RE.test(l));
} catch (e) {
  console.error(`checklist-sync: cannot read ${checklistPath}: ${e.message}`);
  process.exit(1);
}
if (items.length === 0) {
  console.error(`checklist-sync: no "- [ ]" items in ${checklistPath}`);
  process.exit(1);
}

// 2. Fetch the current issue body.
let body;
try {
  body = JSON.parse(gh(['issue', 'view', issue, '--json', 'body'])).body ?? '';
} catch (e) {
  console.error(`checklist-sync: gh issue view ${issue} failed: ${e.message}`);
  process.exit(1);
}

// 3. Decide seed vs sync from the EXACT markers (not a prose mention).
let next;
let mode;
if (BLOCK_RE.test(body)) {
  mode = 'synced';
  next = body.replace(BLOCK_RE, `${START}\n${items.join('\n')}\n${END}`);
} else {
  mode = 'seeded';
  const lines = body.split('\n');
  const idx = lines.flatMap((l, i) => (ITEM_RE.test(l) ? [i] : []));
  if (idx.length === 0) {
    console.error('checklist-sync: no markers and no checkbox list in the issue body to seed');
    process.exit(1);
  }
  lines.splice(idx[idx.length - 1] + 1, 0, END);
  lines.splice(idx[0], 0, START);
  next = lines.join('\n');
}

// 4. Write back (only if something changed).
if (next === body) {
  console.log(`checklist-sync: issue #${issue} already up to date`);
  process.exit(0);
}
try {
  gh(['issue', 'edit', issue, '--body-file', '-'], next);
} catch (e) {
  console.error(`checklist-sync: gh issue edit ${issue} failed: ${e.message}`);
  process.exit(1);
}

const done = items.filter((l) => /^- \[[xX]\]/.test(l)).length;
console.log(`checklist-sync: issue #${issue} ${mode} (${done}/${items.length} done)`);
