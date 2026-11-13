// Tests for the process-step checks and the Stop hook. Run: npm run test:stop
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEPS, checkLastTurn, parseTranscript, toEvents } from './lib/process-steps.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'bcp-stop-'));

let n = 0;
const prompt = (text = 'go') => ({ type: 'user', message: { role: 'user', content: text } });
const tool = (name, input, extra = {}, output = 'ok') => {
  const id = `toolu_${++n}`;
  return [
    { type: 'assistant', cwd: '/r', gitBranch: 'feat/31_x', message: { content: [{ type: 'tool_use', id, name, input }] }, ...extra },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: output }] } },
  ];
};
const bash = (command, extra, output) => tool('Bash', { command }, extra, output);
const commit = (msg = 'feat(x): y', extra, output) => bash(`git commit -m "${msg}"`, extra, output);
const idOf = (entries) => entries[0].message.content[0].id;
// What a commit prints when it went through, and when a hook or a guard refused it (#89).
const WENT_THROUGH = '[feat/31_x 4d11a79] feat(x): y\n 1 file changed, 2 insertions(+)';
const HOOK_REFUSED = '[STARTED] Running tasks\n✖   body\'s lines must not be longer than 100 characters\nhusky - commit-msg script failed (code 1)';
const GUARD_REFUSED = "bcp commit guard:\n\nRefusing to commit on the default branch 'main'.";
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

test('STEPS lists every step checkBatch can report', () => {
  const offBranch = check(prompt(), commit('feat: y', { gitBranch: 'main' }))[0].skipped; // skips them all
  assert.deepEqual(offBranch, STEPS);
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

// #89: a refused attempt is not a commit, so the retry is judged on the whole batch.
test('a refused attempt followed by a retry with every step done produces no finding', () => {
  assert.deepEqual(check(prompt(), GOOD(), commit('feat(x): y', {}, HOOK_REFUSED), commit('feat(x): y', {}, WENT_THROUGH)), []);
  assert.deepEqual(check(prompt(), GOOD(), commit('feat(x): y', {}, GUARD_REFUSED), commit('feat(x): y', {}, WENT_THROUGH)), []);
});

test('a refused attempt followed by a retry with a step missing gives one finding, on the commit that went through', () => {
  const retry = commit('feat(x): y', {}, WENT_THROUGH);
  const noLog = [tool('Skill', { skill: 'commit-guide' }), bash('npm test'), bash('node scripts/checklist-sync.mjs 31')];
  const found = check(prompt(), noLog, commit('feat(x): y', {}, HOOK_REFUSED), retry);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].skipped, ['work-log']);
  assert.equal(found[0].commitId, idOf(retry));
});

test('a refused attempt alone is not a commit, and a refusal hidden by a pipe is still seen', () => {
  assert.deepEqual(check(prompt(), commit('feat(x): y', {}, HOOK_REFUSED)), []);
  assert.deepEqual(check(prompt(), bash('git add . && git commit -m "x" 2>&1 | tail -6', {}, HOOK_REFUSED)), []);
});

test('two commits that went through are each judged on their own window', () => {
  const [f, ...rest] = check(prompt(), GOOD(), commit('feat(x): y', {}, WENT_THROUGH), commit('fix(x): z', {}, WENT_THROUGH));
  assert.equal(rest.length, 0);
  assert.deepEqual(f.skipped, ['tests', 'work-log', 'checklist-sync', 'commit-guide']);
});

test('output without a refusal counts as a commit: no output, a summary line, or a marker beside a summary line', () => {
  assert.equal(check(prompt(), commit('feat: x', {}, '')).length, 1); // git commit -q prints nothing
  assert.equal(check(prompt(), commit('feat: x', {}, WENT_THROUGH)).length, 1);
  assert.equal(check(prompt(), commit('feat: x', {}, `error: a hook warned\n${WENT_THROUGH}`)).length, 1);
});

test('"nothing to commit" refuses a commit, unless the same command also ran git status', () => {
  const nothing = 'On branch feat/31_x\nnothing to commit, working tree clean';
  assert.deepEqual(check(prompt(), commit('feat: x', {}, nothing)), []); // the commit had nothing to commit
  assert.equal(check(prompt(), bash('git commit -q -m "feat: x"; git status', {}, nothing)).length, 1); // status printed it
  assert.deepEqual(check(prompt(), commit('feat: x', {}, 'no changes added to commit (use "git add")')), []);
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

function runHook(entries, payload = {}, env = {}) {
  const home = tmp();
  const transcript = join(tmp(), 't.jsonl');
  writeFileSync(transcript, entries.flat(Infinity).map((e) => JSON.stringify(e)).join('\n'));
  const run = () =>
    spawnSync(process.execPath, [resolve(scripts, 'stop-check.mjs')], {
      input: JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', transcript_path: transcript, ...payload }),
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, ...env },
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

// --- posting a comment on the issue (#32): opt-in, through a fake `gh` ---

const posix = process.platform !== 'win32';

function repoOn(branch, remote) {
  const dir = tmp();
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', branch);
  git('-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'init'); // an unborn branch cannot be asked
  if (remote) git('remote', 'add', 'origin', remote);
  return dir;
}

function fakeGh(exit = 0) {
  const dir = tmp();
  const calls = join(dir, 'calls.txt');
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\nprintf '%s\\n' "$@" >> '${calls}'\nprintf -- '--\\n' >> '${calls}'\nexit ${exit}\n`);
  chmodSync(join(dir, 'gh'), 0o755);
  return { env: { PATH: `${dir}:${process.env.PATH}` }, calls: () => (existsSync(calls) ? readFileSync(calls, 'utf8') : '') };
}

const ON = { BCP_COMMENT_SKIPPED: '1' };
const demoRepo = () => repoOn('feat/31_x', 'https://github.com/example-org/demo.git');

test('stop-check does not comment unless BCP_COMMENT_SKIPPED=1', { skip: !posix }, () => {
  const gh = fakeGh();
  const { run } = runHook([prompt(), commit('feat: y', { cwd: demoRepo() })], {}, gh.env);
  assert.equal(run().status, 0);
  assert.equal(gh.calls(), '');
});

test('stop-check comments once per recorded commit on its issue when opted in', { skip: !posix }, () => {
  const gh = fakeGh();
  const { run } = runHook([prompt(), commit('feat: y', { cwd: demoRepo() })], {}, { ...gh.env, ...ON });
  const r = run();
  assert.equal(r.status, 0);
  const call = gh.calls().split('\n--\n')[0].split('\n');
  assert.deepEqual(call.slice(0, 5), ['issue', 'comment', '31', '--repo', 'example-org/demo']);
  assert.match(call.join('\n'), /feat\/31_x/);
  assert.match(call.join('\n'), /without tests, work-log, checklist-sync, commit-guide/);
  assert.match(JSON.parse(r.stdout).systemMessage, /commented on 1 issue/);
  run(); // the same commit again: already recorded, so not posted again
  assert.equal(gh.calls().split('\n--\n').filter(Boolean).length, 1);
});

test('stop-check does not comment without an issue number or a GitHub repo', { skip: !posix }, () => {
  const gh = fakeGh();
  const offBranch = runHook([prompt(), commit('feat: y', { cwd: repoOn('main', 'https://github.com/example-org/demo.git') })], {}, { ...gh.env, ...ON });
  assert.equal(offBranch.run().status, 0);
  const noRemote = runHook([prompt(), commit('feat: y', { cwd: repoOn('feat/31_x') })], {}, { ...gh.env, ...ON });
  assert.equal(noRemote.run().status, 0);
  assert.equal(gh.calls(), '');
  assert.equal(existsSync(offBranch.log), true); // still recorded
  assert.equal(existsSync(noRemote.log), true);
});

test('stop-check comments through an SSH GitHub remote, but never through another host', { skip: !posix }, () => {
  const ssh = fakeGh();
  const github = runHook([prompt(), commit('feat: y', { cwd: repoOn('feat/31_x', 'git@github.com:example-org/demo.git') })], {}, { ...ssh.env, ...ON });
  assert.equal(github.run().status, 0);
  assert.match(ssh.calls(), /example-org\/demo/);
  // gh talks to github.com, so acme/app on another host would hit an unrelated GitHub repo
  for (const remote of ['git@gitlab.com:acme/app.git', 'https://gitlab.com/acme/app', 'ssh://git@git.corp.example:2222/acme/app.git', 'https://github.com.evil.example/acme/app.git']) {
    const gh = fakeGh();
    const other = runHook([prompt(), commit('feat: y', { cwd: repoOn('feat/31_x', remote) })], {}, { ...gh.env, ...ON });
    assert.equal(other.run().status, 0, remote);
    assert.equal(gh.calls(), '', remote);
    assert.equal(JSON.parse(readFileSync(other.log, 'utf8').trim()).repo, 'acme/app', remote); // still recorded
  }
});

test('stop-check still records and exits 0 when gh fails, and says so', { skip: !posix }, () => {
  const gh = fakeGh(1);
  const { run, log } = runHook([prompt(), commit('feat: y', { cwd: demoRepo() })], {}, { ...gh.env, ...ON });
  const r = run();
  assert.equal(r.status, 0);
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1);
  assert.match(JSON.parse(r.stdout).systemMessage, /could not comment on #31/);
});

test('stop-check still records when gh is not installed', { skip: !posix }, () => {
  const bin = tmp(); // git on PATH, gh not
  symlinkSync(spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim(), join(bin, 'git'));
  const { run, log } = runHook([prompt(), commit('feat: y', { cwd: demoRepo() })], {}, { ...ON, PATH: bin });
  const r = run();
  assert.equal(r.status, 0);
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1);
  assert.match(JSON.parse(r.stdout).systemMessage, /could not comment on #31/);
});
