#!/usr/bin/env node
// bcp Stop hook — record the process steps a finished batch skipped.
//
// When the turn that just ended made a `git commit`, check the work since the previous commit
// for the steps docs/process-steps.md lists. Each commit that skipped any is appended to
// ~/.claude/bcp/skipped-steps.jsonl with the repo and issue number, and shown as a one-line
// notice. With BCP_COMMENT_SKIPPED=1 each newly recorded commit is also posted as a comment on
// its issue (#32). Never blocks the session (docs/hook-conventions.md, rule 4).
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

// `repo` is `owner/name` from the origin remote (any host), else the folder name. `onGitHub` is true
// only when that remote is on github.com: `gh` talks to github.com, so a GitLab or self-hosted
// `acme/app` must never be handed to it, or the comment would land on an unrelated GitHub repo.
function repoOf(cwd) {
  if (!cwd) return { repo: null, onGitHub: false };
  const remote = git(cwd, 'remote', 'get-url', 'origin');
  const m = remote && /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (m) return { repo: m[1], onGitHub: /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?github\.com[:/]/i.test(remote) };
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  return { repo: top ? basename(top) : null, onGitHub: false };
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
const records = [];
const onGitHub = new Map(); // commitId -> may be commented on through gh
const notes = [];
for (const f of findings) {
  if (seen.has(f.commitId)) continue; // this commit was recorded already
  const { repo, onGitHub: github } = repoOf(f.cwd);
  onGitHub.set(f.commitId, github);
  records.push({ ts, session: payload.session_id ?? null, repo, issue: f.issue, branch: f.branch, commitId: f.commitId, skipped: f.skipped });
  notes.push(`${f.issue ? `#${f.issue}` : 'no issue'}: ${f.skipped.join(', ')}`);
}
if (!records.length) process.exit(0);
const lines = records.map((r) => JSON.stringify(r));

try {
  mkdirSync(dir, { recursive: true });
  appendFileSync(log, lines.join('\n') + '\n');
} catch (err) {
  console.error(`bcp: cannot write ${log}: ${err.message}`);
  process.exit(0);
}

// Opt-in: post each newly recorded commit on its issue, once. A comment is public to everyone who
// can read the repo, so it is off unless BCP_COMMENT_SKIPPED=1. Entries with no issue number, or a
// repo that is not on github.com (a folder name, or another host), have nowhere to go and are skipped. A failed
// post is not retried: the commit is already recorded, so the next run would not see it as new.
let posted = 0;
const failed = [];
if (process.env.BCP_COMMENT_SKIPPED === '1') {
  for (const r of records) {
    if (!r.issue || !onGitHub.get(r.commitId) || !/^[\w.-]+\/[\w.-]+$/.test(r.repo ?? '')) continue;
    const body = `bcp: a batch on \`${r.branch}\` was committed without ${r.skipped.join(', ')}.\n\nRecorded by the bcp Stop hook (see docs/process-steps.md).`;
    try {
      execFileSync('gh', ['issue', 'comment', String(r.issue), '--repo', r.repo, '--body', body], { stdio: 'ignore', timeout: 15000 });
      posted++;
    } catch {
      failed.push(`#${r.issue}`);
    }
  }
}
const extra = [posted ? `commented on ${posted} issue${posted > 1 ? 's' : ''}` : '', failed.length ? `could not comment on ${failed.join(', ')}` : ''].filter(Boolean).join('; ');
console.log(JSON.stringify({ systemMessage: `bcp: batch committed without ${notes.join('; ')} (recorded in ${log})${extra ? `; ${extra}` : ''}` }));
