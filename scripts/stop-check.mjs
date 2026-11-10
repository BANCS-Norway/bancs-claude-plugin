#!/usr/bin/env node
// bcp Stop hook — record the process steps a finished batch skipped.
//
// When the turn that just ended made a `git commit`, check the work since the previous commit
// for the steps docs/process-steps.md lists. Each commit that skipped any is appended to
// ~/.claude/bcp/skipped-steps.jsonl with the repo and issue number, and shown as a one-line
// notice. Records only; never blocks the session (docs/hook-conventions.md, rule 4).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { readPayload, shouldRun } from './lib/hook.mjs';
import { checkLastTurn, parseTranscript, toEvents } from './lib/process-steps.mjs';

const payload = readPayload();
if (!shouldRun(payload, { event: 'Stop' })) process.exit(0);

const transcript = payload.transcript_path;
if (typeof transcript !== 'string' || !existsSync(transcript)) process.exit(0);

const git = (cwd, ...args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
};

function repoOf(cwd) {
  if (!cwd) return null;
  const remote = git(cwd, 'remote', 'get-url', 'origin');
  const m = remote && /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (m) return m[1];
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  return top ? basename(top) : null;
}

let findings;
try {
  const events = toEvents(parseTranscript(readFileSync(transcript, 'utf8')));
  findings = checkLastTurn(events, { branchOf: (cwd) => (cwd ? git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') : undefined) });
} catch (err) {
  console.error(`bcp: cannot check ${transcript}: ${err.message}`);
  process.exit(0);
}
if (!findings.length) process.exit(0);

const dir = join(homedir(), '.claude', 'bcp');
const log = join(dir, 'skipped-steps.jsonl');
const seen = new Set();
try {
  for (const line of readFileSync(log, 'utf8').split('\n')) {
    try {
      seen.add(JSON.parse(line).commitId);
    } catch {
      // blank or torn line
    }
  }
} catch {
  // first record: no log yet
}

const ts = new Date().toISOString();
const lines = [];
const notes = [];
for (const f of findings) {
  if (seen.has(f.commitId)) continue; // this commit was recorded already
  const repo = repoOf(f.cwd);
  lines.push(JSON.stringify({ ts, session: payload.session_id ?? null, repo, issue: f.issue, branch: f.branch, commitId: f.commitId, skipped: f.skipped }));
  notes.push(`${f.issue ? `#${f.issue}` : 'no issue'}: ${f.skipped.join(', ')}`);
}
if (!lines.length) process.exit(0);

try {
  mkdirSync(dir, { recursive: true });
  appendFileSync(log, lines.join('\n') + '\n');
} catch (err) {
  console.error(`bcp: cannot write ${log}: ${err.message}`);
  process.exit(0);
}
console.log(JSON.stringify({ systemMessage: `bcp: batch committed without ${notes.join('; ')} (recorded in ${log})` }));
