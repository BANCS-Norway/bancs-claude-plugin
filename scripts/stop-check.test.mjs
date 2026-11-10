// Tests for the process-step checks and the Stop hook. Run: npm run test:stop
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLastTurn, parseTranscript, toEvents } from './lib/process-steps.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'bcp-stop-'));

let n = 0;
const prompt = (text = 'go') => ({ type: 'user', message: { role: 'user', content: text } });
const tool = (name, input, extra = {}) => {
  const id = `toolu_${++n}`;
  return [
    { type: 'assistant', cwd: '/r', gitBranch: 'feat/31_x', message: { content: [{ type: 'tool_use', id, name, input }] }, ...extra },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } },
  ];
};
const bash = (command, extra) => tool('Bash', { command }, extra);
const commit = (msg = 'feat(x): y', extra) => bash(`git commit -m "${msg}"`, extra);
const check = (...parts) => checkLastTurn(toEvents(parts.flat(Infinity)));

const GOOD = () => [
  tool('Skill', { skill: 'commit-guide' }),
  bash('npm test'),
  tool('Edit', { file_path: '/m/issue-31.md' }),
  bash('node scripts/checklist-sync.mjs 31'),
];

test('a batch with every step produces no finding', () => {
  assert.deepEqual(check(prompt(), GOOD(), commit()), []);
});

test('a bare commit skips every step except the issue link', () => {
  const [f] = check(prompt(), commit());
  assert.deepEqual(f.skipped, ['tests', 'work-log', 'checklist-sync', 'commit-guide']);
  assert.equal(f.issue, 31);
  assert.equal(f.branch, 'feat/31_x');
});

test('each step is detected on its own', () => {
  const skipped = (...parts) => check(prompt(), parts, commit())[0]?.skipped ?? [];
  assert.ok(!skipped(bash('node --test scripts/x.test.mjs')).includes('tests'));
  assert.ok(!skipped(bash('scripts/test-all.sh')).includes('tests'));
  assert.ok(!skipped(bash('echo "- x" >> ~/.claude/projects/p/memory/issue-31.md')).includes('work-log'));
  assert.ok(!skipped(tool('Write', { file_path: '/m/issues/31/log.md' })).includes('work-log'));
  assert.ok(skipped(bash('cat /m/issue-31.md')).includes('work-log')); // a read is not a write
  assert.ok(!skipped(bash('gh issue edit 31 --body-file -')).includes('checklist-sync'));
  assert.ok(!skipped(tool('Skill', { skill: 'bcp:commit-guide' })).includes('commit-guide'));
});

test('a docs commit needs no test run', () => {
  const [f] = check(prompt(), commit('docs: x'));
  assert.ok(!f.skipped.includes('tests'));
});

test('a commit off an issue branch skips the issue link and has no issue number', () => {
  const [f] = check(prompt(), GOOD(), commit('feat: y', { gitBranch: 'main' }));
  assert.deepEqual(f.skipped, ['issue-link']);
  assert.equal(f.issue, null);
  assert.equal(f.branch, null); // 'main' in the transcript is the start branch, not trusted
});

test('work done before the previous commit does not count for the next batch', () => {
  const [f] = check(prompt(), GOOD(), commit(), commit('fix(x): z'));
  assert.deepEqual(f.skipped, ['tests', 'work-log', 'checklist-sync', 'commit-guide']);
});

test('only commits in the latest turn are judged, and failed or dry-run commits are ignored', () => {
  assert.deepEqual(check(prompt(), commit(), prompt('next'), bash('ls')), []);
  const failed = bash('git commit -m "feat: x"');
  failed[1].message.content[0].is_error = true;
  assert.deepEqual(check(prompt(), failed), []);
  assert.deepEqual(check(prompt(), bash('git commit --dry-run')), []);
});

test('text that merely mentions git commit is not a commit', () => {
  assert.deepEqual(check(prompt(), bash("grep -l 'git commit -m' ~/x.jsonl"), bash('echo "git commit"')), []);
  assert.deepEqual(check(prompt(), bash("cat > t.mjs <<'E'\nbash('cd /r && git commit -m x')\nE")), []);
  assert.equal(check(prompt(), bash('cd /r && git commit -m "feat: x"')).length, 1);
  assert.equal(check(prompt(), bash('git -C /r commit -m "feat: x"')).length, 1);
});

test('the branch comes from git when it can be asked, not from the stale transcript field', () => {
  const events = toEvents([prompt(), commit('feat: y', { gitBranch: 'main' })].flat(Infinity));
  const [f] = checkLastTurn(events, { branchOf: () => 'fix/7_z' });
  assert.equal(f.issue, 7);
});

test('git outranks the transcript field, and a feature-branch field is the fallback', () => {
  const events = toEvents([prompt(), commit('feat: y', { gitBranch: 'feat/5_a' })].flat(Infinity));
  assert.equal(checkLastTurn(events, { branchOf: () => 'fix/7_z' })[0].issue, 7);
  assert.equal(checkLastTurn(events)[0].issue, 5);
});

test('sidechain entries and torn lines are skipped', () => {
  const text = [JSON.stringify({ type: 'user', isSidechain: true }), '{"type":"us', JSON.stringify(prompt())].join('\n');
  assert.equal(parseTranscript(text).length, 1);
});

// --- stop-check.mjs, run as Claude Code runs it ---

function runHook(entries, payload = {}) {
  const home = tmp();
  const transcript = join(tmp(), 't.jsonl');
  writeFileSync(transcript, entries.flat(Infinity).map((e) => JSON.stringify(e)).join('\n'));
  const run = () =>
    spawnSync(process.execPath, [resolve(scripts, 'stop-check.mjs')], {
      input: JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', transcript_path: transcript, ...payload }),
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home },
    });
  return { run, log: join(home, '.claude', 'bcp', 'skipped-steps.jsonl') };
}

test('stop-check records the skipped steps with issue and session, and tells the user', () => {
  const { run, log } = runHook([prompt(), commit()]);
  const r = run();
  assert.equal(r.status, 0);
  const rec = JSON.parse(readFileSync(log, 'utf8').trim());
  assert.equal(rec.issue, 31);
  assert.equal(rec.session, 's1');
  assert.deepEqual(rec.skipped, ['tests', 'work-log', 'checklist-sync', 'commit-guide']);
  assert.match(JSON.parse(r.stdout).systemMessage, /#31: tests, work-log/);
});

test('stop-check records a commit once, even when the hook runs twice', () => {
  const { run, log } = runHook([prompt(), commit()]);
  run();
  run();
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1);
});

test('stop-check stays silent for a complete batch, another event, and unreadable input', () => {
  const ok = runHook([prompt(), GOOD(), commit()]);
  assert.equal(ok.run().status, 0);
  assert.equal(existsSync(ok.log), false);
  const other = runHook([prompt(), commit()], { hook_event_name: 'SessionStart' });
  assert.equal(other.run().status, 0);
  assert.equal(existsSync(other.log), false);
  const missing = runHook([prompt(), commit()], { transcript_path: '/nope.jsonl' });
  assert.equal(missing.run().status, 0);
  assert.equal(existsSync(missing.log), false);
});
