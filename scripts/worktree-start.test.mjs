// Tests for worktree-start (#44). Run: npm run test:start
// Real temporary repos, the script run as the skill runs it (node, arguments on stdin, a temporary
// HOME), a fake `gh` so nothing touches the network, and fake `npm` and `direnv` that record their calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIT_ENV, PATH_WITH_GH, fakeCommand, git, pathWithGitAndGhOnly, repoWithOrigin, tmp } from './lib/test-repo.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'worktree-start.mjs');
const BRANCH = 'feat/7_demo';
const PATH_ARG = '.worktrees/feat-7-demo';
const NODE_FILES = { 'package.json': '{"name":"x"}', 'package-lock.json': '{}' };

function start({ cwd, args = `7 ${BRANCH} ${PATH_ARG}`, env = {}, path = PATH_WITH_GH }) {
  const home = tmp();
  const r = spawnSync(process.execPath, [script], {
    cwd, input: args, encoding: 'utf8',
    env: { ...GIT_ENV, PATH: path, HOME: home, USERPROFILE: home, ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const log = (dir, name) => (existsSync(join(dir, `${name}.log`)) ? readFileSync(join(dir, `${name}.log`), 'utf8') : '');

test('a passing preflight creates the worktree on the new branch, from the base it names', () => {
  const { dir } = repoWithOrigin();
  const r = start({ cwd: dir });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^base: main$/m);
  assert.match(r.out, new RegExp(`^ok: worktree ${PATH_ARG} created on ${BRANCH} from main$`, 'm'));
  assert.match(r.out, /^start: done$/m);
  assert.equal(git(join(dir, PATH_ARG), 'rev-parse', '--abbrev-ref', 'HEAD'), BRANCH);
  assert.equal(git(join(dir, PATH_ARG), 'rev-parse', 'HEAD'), git(dir, 'rev-parse', 'main'));
});

test('a failed preflight creates nothing: no worktree, no branch', () => {
  const { dir } = repoWithOrigin();
  git(dir, 'branch', BRANCH);
  const taken = start({ cwd: dir });
  assert.equal(taken.code, 1);
  assert.match(taken.out, new RegExp(`^FAIL: branch ${BRANCH} already exists locally$`, 'm'));
  assert.match(taken.out, /^start: failed$/m);
  assert.equal(existsSync(join(dir, PATH_ARG)), false);

  const { dir: other } = repoWithOrigin();
  const noGh = start({ cwd: other, env: { FAKE_GH_AUTH: '0' } });
  assert.equal(noGh.code, 1);
  assert.match(noGh.out, /^FAIL: gh is not signed in/m);
  assert.equal(existsSync(join(other, PATH_ARG)), false);
  assert.equal(git(other, 'branch', '--list', BRANCH), '');
});

test('node_modules: linked from the main checkout and excluded; a project with no lockfile is left alone', () => {
  const { dir } = repoWithOrigin(NODE_FILES);
  mkdirSync(join(dir, 'node_modules'));
  const r = start({ cwd: dir });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^ok: node_modules linked from the main checkout$/m);
  const link = join(dir, PATH_ARG, 'node_modules');
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(resolve(dirname(link), readlinkSync(link)), join(dir, 'node_modules'));
  assert.equal(git(join(dir, PATH_ARG), 'status', '--porcelain'), '', 'the link is not offered for commit');

  const { dir: bare } = repoWithOrigin({ 'package.json': '{"name":"x"}' });
  mkdirSync(join(bare, 'node_modules'));
  const none = start({ cwd: bare });
  assert.equal(none.code, 0, none.out + none.err);
  assert.doesNotMatch(none.out, /node_modules|npm/);
  assert.equal(existsSync(join(bare, PATH_ARG, 'node_modules')), false);
});

test('node_modules: a clean install when the main checkout has none; a failed install warns and does not fail', () => {
  const { dir } = repoWithOrigin(NODE_FILES);
  const fake = fakeCommand('npm');
  const r = start({ cwd: dir, path: `${fake}${delimiter}${PATH_WITH_GH}` });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^ok: npm ci done$/m);
  assert.match(log(fake, 'npm'), new RegExp(`^ci @ .*${PATH_ARG}$`, 'm'));

  const { dir: other } = repoWithOrigin(NODE_FILES);
  const broken = fakeCommand('npm', { code: 1 });
  const failing = start({ cwd: other, path: `${broken}${delimiter}${PATH_WITH_GH}` });
  assert.equal(failing.code, 0, failing.out + failing.err);
  assert.match(failing.out, /^warn: npm ci failed/m);
  assert.match(failing.out, /^start: done$/m);
});

test('direnv allow runs in the new worktree where the project uses direnv, and only there', () => {
  const { dir } = repoWithOrigin({ '.envrc': 'export A=1' });
  const fake = fakeCommand('direnv');
  const r = start({ cwd: dir, path: `${fake}${delimiter}${PATH_WITH_GH}` });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^ok: direnv allowed in the worktree$/m);
  assert.match(log(fake, 'direnv'), new RegExp(`^allow @ .*${PATH_ARG}$`, 'm'));

  const { dir: plain } = repoWithOrigin();
  const unused = fakeCommand('direnv');
  const none = start({ cwd: plain, path: `${unused}${delimiter}${PATH_WITH_GH}` });
  assert.equal(none.code, 0, none.out + none.err);
  assert.doesNotMatch(none.out, /direnv/);
  assert.equal(log(unused, 'direnv'), '');
});

test('a project that uses direnv on a machine without it warns; the worktree is still made', () => {
  const { dir } = repoWithOrigin({ '.envrc': 'export A=1' });
  const r = start({ cwd: dir, path: pathWithGitAndGhOnly() });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^warn: the project uses direnv but it is not installed/m);
  assert.match(r.out, /^start: done$/m);
});

test('bad arguments are refused before anything runs', () => {
  const { dir } = repoWithOrigin();
  for (const args of ['', '7', 'x feat/a .wt/a', `7 ${BRANCH} ${PATH_ARG} extra`]) {
    const r = start({ cwd: dir, args });
    assert.equal(r.code, 1, args);
    assert.match(r.err, /expected <issue-number> <branch> <worktree-path>/);
  }
  assert.equal(existsSync(join(dir, PATH_ARG)), false);
});
