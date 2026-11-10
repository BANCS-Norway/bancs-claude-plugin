#!/usr/bin/env node
// /bcp:shim-review — list the stale shims of this bcp checkout, or mark reviewed ones checked.
//
// The arguments of the command arrive on stdin as one line:
//   (empty)            list the stale shims: id, where it lives, checked, retire-when
//   all                list every shim, stale or not
//   mark <id>...       set `checked` to this month on those shims (all ids must exist)
//
// Stale = `checked` before the month of the last Claude Code version change recorded in
// ~/.claude/bcp/claude-version.json (#35), else before this month. Works on the bcp checkout
// the current directory is in, never on the installed plugin.
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  OVERLAP_FILE, bcpCheckout, findShim, isStale, loadShims, setFrontmatterChecked, setOverlapChecked,
} from './lib/shims.mjs';

const fail = (msg) => {
  console.error(`shim-review: ${msg}`);
  process.exit(1);
};

let args = '';
if (!process.stdin.isTTY) {
  try {
    args = readFileSync(0, 'utf8');
  } catch {
    // no stdin: no arguments, so a list
  }
}
const [verb, ...rest] = args.trim().split(/\s+/).filter(Boolean);

const root = bcpCheckout(process.cwd());
if (!root) fail('not in a bcp checkout; run it from the bcp repo, where the shims can be edited');
const shims = loadShims(root);
const month = new Date().toISOString().slice(0, 7);

if (verb === undefined || verb === 'all') {
  const since = sinceMonth() ?? month;
  const shown = verb === 'all' ? shims : shims.filter((s) => isStale(s, since));
  if (!shown.length) {
    console.log(`No shims last checked before ${since}.`);
  } else {
    console.log(verb === 'all' ? `${shown.length} shims:` : `${shown.length} shims last checked before ${since}:`);
    for (const s of shown) {
      console.log(`\n${s.id} (${s.rel}) checked ${s.checked ?? 'never'}\n  retire-when: ${s.retireWhen ?? '(none)'}`);
    }
  }
} else if (verb === 'mark') {
  if (!rest.length) fail('mark needs at least one shim id');
  const picked = rest.map((name) => findShim(shims, name) ?? fail(`unknown shim ${JSON.stringify(name)}. Shims: ${shims.map((s) => s.id).join(', ')}`));
  const unique = [...new Set(picked)];
  const rows = unique.filter((s) => s.rel === OVERLAP_FILE).map((s) => s.id);
  try {
    if (rows.length) edit(OVERLAP_FILE, (text) => setOverlapChecked(text, rows, month));
    for (const s of unique.filter((s) => s.rel !== OVERLAP_FILE)) edit(s.rel, (text) => setFrontmatterChecked(text, month));
  } catch (err) {
    fail(`cannot update: ${err.message}`);
  }
  console.log(`Marked checked ${month}: ${unique.map((s) => s.id).join(', ')}`);
} else {
  fail(`unknown argument ${JSON.stringify(verb)}. Use: (nothing), all, or mark <id>...`);
}

function edit(rel, change) {
  const path = join(root, rel);
  writeFileSync(path, change(readFileSync(path, 'utf8')));
}

function sinceMonth() {
  try {
    return /^\d{4}-\d{2}/.exec(JSON.parse(readFileSync(join(homedir(), '.claude', 'bcp', 'claude-version.json'), 'utf8')).at)?.[0];
  } catch {
    return undefined;
  }
}
