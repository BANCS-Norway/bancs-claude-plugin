#!/usr/bin/env node
// /nudge — record a manual correction, or report the nudges so far.
//
// The arguments of the command arrive on stdin as one line:
//   (empty)              report: nudges per repo and step, withered ones marked
//   <step> [note...]     record a nudge against <step> in the current repo
//
// Nudges are appended to ~/.claude/bcp/nudges.jsonl, one line each: ts, repo, step, note.
// The repo is the current directory's (owner/name from origin, else the folder name).
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NUDGE_STEPS, WITHER_AT, formatReport, normaliseStep, parseInvocation, parseNudges, tally } from './lib/nudges.mjs';
import { repoOf } from './lib/repo.mjs';

const dir = join(homedir(), '.claude', 'bcp');
const log = join(dir, 'nudges.jsonl');

const fail = (msg) => {
  console.error(`nudge: ${msg}`);
  process.exit(1);
};
const readLog = () => {
  try {
    return parseNudges(readFileSync(log, 'utf8'));
  } catch {
    return []; // no log yet
  }
};

let args = '';
if (!process.stdin.isTTY) {
  try {
    args = readFileSync(0, 'utf8');
  } catch {
    // no stdin: no arguments, so a report
  }
}
const call = parseInvocation(args);

if (call.mode === 'report') {
  console.log(formatReport(tally(readLog())));
} else {
  const step = normaliseStep(call.step);
  if (!step) fail(`unknown step ${JSON.stringify(call.step)}. Steps: ${NUDGE_STEPS.join(', ')}`);
  const { repo } = repoOf(process.cwd());
  if (!repo) fail('not in a git repository, so there is no repo to record the nudge against');
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), repo, step, ...(call.note && { note: call.note }) }) + '\n');
  } catch (err) {
    fail(`cannot write ${log}: ${err.message}`);
  }
  const row = tally(readLog()).find((r) => r.repo === repo && r.step === step);
  console.log(`Nudged ${step} in ${repo} (${row.count} of ${WITHER_AT})${row.withered ? ': WITHERED' : ''}`);
}
