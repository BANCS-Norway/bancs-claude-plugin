// Tests for the worktree preflight (#42). Run: npm run test:preflight
// Real temporary repos, the script run as the skill runs it (node, arguments on stdin, a temporary
// HOME), and a fake `gh` on PATH so nothing touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIT_ENV, PATH_WITH_GH, git, pathWithoutGh, repoWithOrigin, tmp } from './lib/test-repo.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'worktree-preflight.mjs');
const contextCli = resolve(dirname(fileURLToPath(import.meta.url)), 'project-context.mjs');
const BRANCH = 'feat/7_demo';
const PATH_ARG = '.worktrees/feat-7-demo';

function check({ cwd, args = `7 ${BRANCH} ${PATH_ARG}`, home = tmp(), env = {} }) {
  const r = spawnSync(process.execPath, [script], {
    cwd,
    input: args,
    encoding: 'utf8',
    env: { ...GIT_ENV, PATH: PATH_WITH_GH, HOME: home, USERPROFILE: home, ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('everything free: passes and says what to start from', () => {
  const { dir } = repoWithOrigin();
  const r = check({ cwd: dir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^base: main$/m);
  for (const line of ['ok: gh is signed in', 'ok: default branch main', `ok: branch ${BRANCH} is free (as of the last fetch)`, `ok: ${PATH_ARG} is free`, 'ok: no open PR for #7', 'preflight: passed']) {
    assert.ok(r.out.includes(line), `${line}\n${r.out}`);
  }
});

test('gh not signed in fails, and the PR check says it was skipped', () => {
  const { dir } = repoWithOrigin();
  const r = check({ cwd: dir, env: { FAKE_GH_AUTH: '0' } });
  assert.equal(r.code, 1);
  assert.match(r.out, /^FAIL: gh is not signed in/m);
  assert.match(r.out, /^warn: open PRs for #7 not checked: gh is not usable/m);
  assert.match(r.out, /^preflight: failed$/m);
});

test('gh not installed fails with its own message', () => {
  const { dir } = repoWithOrigin();
  const r = check({ cwd: dir, env: { PATH: pathWithoutGh() } });
  assert.equal(r.code, 1);
  assert.match(r.out, /^FAIL: gh is not installed$/m);
});

test('an unknown default branch fails and says how to set it', () => {
  const dir = tmp();
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  const r = check({ cwd: dir });
  assert.equal(r.code, 1);
  assert.match(r.out, /^FAIL: default branch unknown \(no origin remote\); set it with \/bcp:context confirm default_branch <name>$/m);
  assert.doesNotMatch(r.out, /^base:/m);
});

test('a default branch that does not exist fails; one that exists only on origin starts from origin', () => {
  const { dir } = repoWithOrigin();
  const home = tmp();
  spawnSync(process.execPath, [contextCli], { cwd: dir, input: 'confirm default_branch trunk', env: { ...GIT_ENV, HOME: home, USERPROFILE: home } });
  const missing = check({ cwd: dir, home });
  assert.equal(missing.code, 1);
  assert.match(missing.out, /^FAIL: default branch trunk exists neither locally nor on origin$/m);

  const { dir: other } = repoWithOrigin();
  git(other, 'checkout', '-q', '-b', 'work');
  git(other, 'branch', '-D', 'main'); // origin/main stays
  const remoteOnly = check({ cwd: other });
  assert.equal(remoteOnly.code, 0, remoteOnly.out);
  assert.match(remoteOnly.out, /^base: origin\/main$/m);
});

test('a local default branch behind origin warns, and does not fail', () => {
  const { dir, bare } = repoWithOrigin();
  const clone = tmp();
  git(clone, 'clone', '-q', bare, '.');
  writeFileSync(join(clone, 'b.txt'), 'b');
  git(clone, 'add', '-A');
  git(clone, 'commit', '-q', '-m', 'ahead');
  git(clone, 'push', '-q', 'origin', 'main');
  git(dir, 'fetch', '-q', 'origin');
  const r = check({ cwd: dir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^warn: local main is 1 commit behind origin\/main \(as of the last fetch\); pull it first/m);
});

test('a branch that exists locally or only on origin fails', () => {
  const { dir } = repoWithOrigin();
  git(dir, 'branch', BRANCH);
  const local = check({ cwd: dir });
  assert.equal(local.code, 1);
  assert.match(local.out, new RegExp(`^FAIL: branch ${BRANCH} already exists locally$`, 'm'));

  git(dir, 'push', '-q', 'origin', BRANCH);
  git(dir, 'branch', '-D', BRANCH);
  const remote = check({ cwd: dir });
  assert.equal(remote.code, 1);
  assert.match(remote.out, new RegExp(`^FAIL: branch ${BRANCH} already exists on origin$`, 'm'));
});

test('a worktree path that exists or is already a worktree fails', () => {
  const { dir } = repoWithOrigin();
  mkdirSync(join(dir, PATH_ARG), { recursive: true });
  const exists = check({ cwd: dir });
  assert.equal(exists.code, 1);
  assert.match(exists.out, new RegExp(`^FAIL: ${PATH_ARG} already exists or is already a worktree$`, 'm'));

  const { dir: other } = repoWithOrigin();
  git(other, 'worktree', 'add', '-q', PATH_ARG, '-b', 'something-else');
  const listed = check({ cwd: other, args: `7 ${BRANCH} ${PATH_ARG}` });
  assert.equal(listed.code, 1);
  assert.match(listed.out, /already exists or is already a worktree/);
});

test('a worktree git still lists after its folder was deleted is not free either', () => {
  const { dir } = repoWithOrigin();
  git(dir, 'worktree', 'add', '-q', PATH_ARG, '-b', 'something-else');
  rmSync(join(dir, PATH_ARG), { recursive: true });
  const r = check({ cwd: dir });
  assert.equal(r.code, 1);
  assert.match(r.out, new RegExp(`^FAIL: ${PATH_ARG} already exists or is already a worktree$`, 'm'));
});

test('an open PR for the issue fails, by closing reference or by branch name; others do not', () => {
  const { dir } = repoWithOrigin();
  const pr = (prs) => check({ cwd: dir, env: { FAKE_GH_PRS: JSON.stringify(prs) } });
  const byRef = pr([{ number: 12, headRefName: 'whatever', closingIssuesReferences: [{ number: 7 }] }]);
  assert.equal(byRef.code, 1);
  assert.match(byRef.out, /^FAIL: PR #12 \(whatever\) is already open for #7$/m);
  const byBranch = pr([{ number: 13, headRefName: 'fix/7_other-slug', closingIssuesReferences: [] }]);
  assert.equal(byBranch.code, 1);
  assert.match(byBranch.out, /^FAIL: PR #13 \(fix\/7_other-slug\)/m);
  const unrelated = pr([{ number: 14, headRefName: 'feat/70_x', closingIssuesReferences: [{ number: 70 }] }]);
  assert.equal(unrelated.code, 0, unrelated.out);
  assert.match(unrelated.out, /^ok: no open PR for #7$/m);
});

test('gh failing on the PR list is a warning, not a pass and not a failure', () => {
  const { dir } = repoWithOrigin();
  const r = check({ cwd: dir, env: { FAKE_GH_FAIL: '1' } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^warn: open PRs for #7 not checked: gh did not answer$/m);
});

test('bad arguments and a directory that is not a repository are refused', () => {
  const { dir } = repoWithOrigin();
  for (const args of ['', '7', 'seven feat/x .wt/x', '7 feat/x .wt/x extra']) {
    const r = check({ cwd: dir, args });
    assert.equal(r.code, 1, args);
    assert.match(r.err, /expected <issue-number> <branch> <worktree-path>/);
  }
  const outside = check({ cwd: tmp() });
  assert.equal(outside.code, 1);
  assert.match(outside.out, /^FAIL: not in a git repository$/m);
});
