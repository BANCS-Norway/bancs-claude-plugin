// Tests for /nudge: the pure library and the CLI. Run: npm run test:nudge
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NUDGE_STEPS, WITHER_AT, formatReport, normaliseStep, parseInvocation, parseNudges, tally } from './lib/nudges.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'bcp-nudge-'));
const nudge = (repo, step) => ({ repo, step });

test('a step is matched case-insensitively and anything else is unknown', () => {
  assert.equal(normaliseStep(' Tests '), 'tests');
  assert.equal(normaliseStep('review'), 'review');
  assert.equal(normaliseStep('issues'), 'issues');
  assert.equal(normaliseStep('test'), null); // a typo must not split the counts
  assert.equal(normaliseStep(''), null);
  assert.equal(normaliseStep(undefined), null);
  assert.ok(NUDGE_STEPS.includes('commit-guide'));
});

test('the arguments are a report when empty, otherwise the step as typed and the rest as the note', () => {
  assert.deepEqual(parseInvocation(''), { mode: 'report' });
  assert.deepEqual(parseInvocation(' \n'), { mode: 'report' });
  assert.deepEqual(parseInvocation(undefined), { mode: 'report' });
  assert.deepEqual(parseInvocation('tests'), { mode: 'record', step: 'tests', note: '' });
  assert.deepEqual(parseInvocation('test typo'), { mode: 'record', step: 'test', note: 'typo' }); // not corrected here
  assert.deepEqual(parseInvocation('  review   it was skipped \n'), { mode: 'record', step: 'review', note: 'it was skipped' });
});

test('parseNudges skips blank and torn lines', () => {
  const text = [JSON.stringify(nudge('a/b', 'tests')), '', '{"repo":"a/b","st', '{"no":"step"}', JSON.stringify(nudge('a/b', 'review'))].join('\n');
  assert.deepEqual(parseNudges(text).map((r) => r.step), ['tests', 'review']);
});

test('tally counts per repo and step, and withers at three', () => {
  const rows = tally([nudge('a/b', 'tests'), nudge('a/b', 'tests'), nudge('a/b', 'work-log'), nudge('c/d', 'tests')]);
  assert.equal(rows.find((r) => r.repo === 'a/b' && r.step === 'tests').count, 2);
  assert.equal(rows.find((r) => r.repo === 'c/d' && r.step === 'tests').count, 1); // another repo counts apart
  assert.ok(rows.every((r) => !r.withered));
  const third = tally([nudge('a/b', 'tests'), nudge('a/b', 'tests'), nudge('a/b', 'tests'), nudge('c/d', 'review')]);
  assert.deepEqual(third.map((r) => [r.repo, r.step, r.count, r.withered]), [
    ['a/b', 'tests', 3, true],
    ['c/d', 'review', 1, false],
  ]);
  assert.equal(WITHER_AT, 3);
});

test('the report names the withered steps, and says so when there is nothing', () => {
  assert.equal(formatReport([]), 'No nudges recorded.');
  const out = formatReport(tally(Array(3).fill(nudge('a/b', 'tests')).concat(nudge('a/b', 'review'))));
  assert.match(out, /^Nudges \(3 on a step in a repo = withered\)/);
  assert.match(out, /^a\/b\s+tests\s+3\s+WITHERED$/m);
  assert.match(out, /^a\/b\s+review\s+1$/m);
});

// --- nudge.mjs, run as the command runs it: node, note on stdin, HOME for the log ---

function repoWith(remote) {
  const dir = tmp();
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  if (remote) spawnSync('git', ['remote', 'add', 'origin', remote], { cwd: dir });
  return dir;
}

function cli(home, cwd, input = '') {
  return spawnSync(process.execPath, [resolve(scripts, 'nudge.mjs')], {
    cwd,
    input,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home },
  });
}
const logOf = (home) => join(home, '.claude', 'bcp', 'nudges.jsonl');

test('record appends one line with repo, step and note, and counts toward three', () => {
  const home = tmp();
  const repo = repoWith('https://github.com/example-org/demo.git');
  const first = cli(home, repo, 'tests you committed without running them\n');
  assert.equal(first.status, 0);
  assert.equal(first.stdout.trim(), 'Nudged tests in example-org/demo (1 of 3)');
  const rec = JSON.parse(readFileSync(logOf(home), 'utf8').trim());
  assert.equal(rec.repo, 'example-org/demo');
  assert.equal(rec.step, 'tests');
  assert.equal(rec.note, 'you committed without running them');
  assert.ok(!Number.isNaN(Date.parse(rec.ts)));
  assert.match(cli(home, repo, 'TESTS').stdout, /\(2 of 3\)/);
  assert.match(cli(home, repo, 'tests').stdout, /\(3 of 3\): WITHERED/);
});

test('a nudge without a note has no note field, and quotes in a note survive', () => {
  const home = tmp();
  const repo = repoWith('git@github.com:example-org/demo.git');
  cli(home, repo, 'review');
  cli(home, repo, `issues it's "wrong" $HOME \`x\`\n`);
  const [a, b] = readFileSync(logOf(home), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(!('note' in a));
  assert.equal(b.note, `it's "wrong" $HOME \`x\``);
});

test('report lists the withered steps per repo', () => {
  const home = tmp();
  const demo = repoWith('https://github.com/example-org/demo.git');
  const other = repoWith('https://github.com/example-org/other.git');
  for (let i = 0; i < 3; i++) cli(home, demo, 'tests');
  cli(home, other, 'tests');
  const out = cli(home, demo).stdout;
  assert.match(out, /^example-org\/demo\s+tests\s+3\s+WITHERED$/m);
  assert.match(out, /^example-org\/other\s+tests\s+1$/m);
  assert.equal(cli(tmp(), demo).stdout.trim(), 'No nudges recorded.');
});

test('an unknown step and no repo are refused and write nothing', () => {
  const home = tmp();
  const repo = repoWith('https://github.com/example-org/demo.git');
  const unknown = cli(home, repo, 'test typo'); // an obvious typo is still refused, never guessed
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown step "test"\. Steps: tests, work-log/);
  assert.equal(cli(home, repo, 'commit it was skipped').status, 1);
  const noRepo = cli(home, tmp(), 'tests');
  assert.equal(noRepo.status, 1);
  assert.match(noRepo.stderr, /not in a git repository/);
  assert.equal(existsSync(logOf(home)), false);
});
