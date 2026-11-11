// Tests for worktree-start (#44). Run: npm run test:start
// Real temporary repos, the script run as the skill runs it (node, arguments on stdin, a temporary
// HOME), a fake `gh` so nothing touches the network, and fake `npm` and `direnv` that record their calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorktreeInclude } from './lib/worktree.mjs';
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

// ---- .worktreeinclude (#37) ----------------------------------------------------------------------

/** A repo whose .gitignore hides .env, build/, other/ and shared/; the hidden files exist on disk, uncommitted. */
function repoWithIgnored(include, extra = {}) {
  const { dir } = repoWithOrigin({ '.gitignore': '.env\nbuild/\nother/\nshared/\n.worktrees/\n', ...(include === undefined ? {} : { '.worktreeinclude': include }), ...extra });
  writeFileSync(join(dir, '.env'), 'SECRET=1');
  for (const d of ['build', 'other', 'shared']) mkdirSync(join(dir, d));
  writeFileSync(join(dir, 'build', 'out.txt'), 'out');
  writeFileSync(join(dir, 'other', 'x.txt'), 'x');
  writeFileSync(join(dir, 'shared', 'data.txt'), 'data');
  return dir;
}

test('parseWorktreeInclude: patterns before `## links`, `# link:` lines after it, comments ignored', () => {
  assert.deepEqual(parseWorktreeInclude('.env\n# a comment\nbuild/\n\n## Links\n# link: shared\n#link:  a/b\nstray line\n'), { patterns: ['.env', 'build/'], links: ['shared', 'a/b'] });
  assert.deepEqual(parseWorktreeInclude(''), { patterns: [], links: [] });
  assert.deepEqual(parseWorktreeInclude('# link: not under the heading\n'), { patterns: [], links: [] });
});

test('.worktreeinclude: the gitignored files its patterns match are copied, and only those', () => {
  const dir = repoWithIgnored('.env\nbuild/\n');
  const r = start({ cwd: dir });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^ok: \.worktreeinclude: copied 2 files$/m);
  const wt = join(dir, PATH_ARG);
  assert.equal(readFileSync(join(wt, '.env'), 'utf8'), 'SECRET=1');
  assert.equal(readFileSync(join(wt, 'build', 'out.txt'), 'utf8'), 'out');
  assert.equal(existsSync(join(wt, 'other')), false, 'not in the file, so not copied');
  assert.doesNotMatch(r.out, /^warn: no \.worktreeinclude/m);
});

test('.worktreeinclude: a pattern does not pull in an untracked file that is not gitignored', () => {
  const dir = repoWithIgnored('.env\nnotes.txt\n');
  writeFileSync(join(dir, 'notes.txt'), 'untracked, not ignored');
  const r = start({ cwd: dir });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^ok: \.worktreeinclude: copied 1 file$/m);
  assert.equal(existsSync(join(dir, PATH_ARG, 'notes.txt')), false);
});

test('.worktreeinclude: `# link:` entries become symlinks to the main checkout, not copies, and stay out of git status', () => {
  const dir = repoWithIgnored('.env\n\n## links\n# link: shared\n');
  const r = start({ cwd: dir });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^ok: \.worktreeinclude: linked shared from the main checkout$/m);
  const link = join(dir, PATH_ARG, 'shared');
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(resolve(dirname(link), readlinkSync(link)), join(dir, 'shared'));
  assert.equal(git(join(dir, PATH_ARG), 'status', '--porcelain'), '');
});

test('.worktreeinclude: a link that is missing, escapes the repository or already exists is a warning, never a failure', () => {
  const dir = repoWithIgnored('## links\n# link: nope\n# link: ../outside\n# link: /etc\n# link: .gitignore\n');
  const r = start({ cwd: dir });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^warn: \.worktreeinclude: link nope does not exist in the main checkout; skipped$/m);
  assert.match(r.out, /^warn: \.worktreeinclude: link \.\.\/outside is not a path inside the repository; skipped$/m);
  assert.match(r.out, /^warn: \.worktreeinclude: link \/etc is not a path inside the repository; skipped$/m);
  assert.match(r.out, /^warn: \.worktreeinclude: \.gitignore already exists in the worktree; not linked$/m);
  assert.match(r.out, /^start: done$/m);
});

// #76: core.hooksPath is relative (husky sets it to .husky/_) and .husky/_ is generated and gitignored, so a new
// worktree has the tracked .husky/commit-msg but no _ and git runs no hooks, silently. A link brings it back.
function repoWithHusky(include) {
  const { dir } = repoWithOrigin({ '.gitignore': '.worktrees/\n', '.worktreeinclude': include });
  mkdirSync(join(dir, '.husky', '_'), { recursive: true });
  // tracked, the way a project commits it: refuses any message that does not start with "ok"
  writeFileSync(join(dir, '.husky', 'commit-msg'), 'grep -q "^ok" "$1" || { echo "message must start with ok"; exit 1; }\n');
  // generated by husky on install: the same dirname-of-dirname lookup as husky's own `h`
  writeFileSync(join(dir, '.husky', '_', '.gitignore'), '*');
  writeFileSync(join(dir, '.husky', '_', 'h'), 'n=$(basename "$0")\ns=$(dirname "$(dirname "$0")")/$n\n[ ! -f "$s" ] && exit 0\nsh -e "$s" "$@"\n');
  writeFileSync(join(dir, '.husky', '_', 'commit-msg'), '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n', { mode: 0o755 });
  git(dir, 'add', '.husky');
  git(dir, 'commit', '-q', '-m', 'ok: add the hook');
  git(dir, 'config', 'core.hooksPath', '.husky/_');
  return dir;
}
const commit = (wt, message) => spawnSync('git', ['commit', '--allow-empty', '-q', '-m', message], { cwd: wt, env: GIT_ENV, encoding: 'utf8' });

test('.worktreeinclude: linking .husky/_ makes the git hooks run in the new worktree; without it they are silent', () => {
  const without = repoWithHusky('## links\n');
  assert.equal(start({ cwd: without }).code, 0);
  assert.equal(existsSync(join(without, PATH_ARG, '.husky', '_')), false);
  assert.equal(commit(join(without, PATH_ARG), 'bad message').status, 0, 'no hooks path, so the bad message goes through');

  const dir = repoWithHusky('## links\n# link: .husky/_\n');
  const r = start({ cwd: dir });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^ok: \.worktreeinclude: linked \.husky\/_ from the main checkout$/m);
  const wt = join(dir, PATH_ARG);
  assert.ok(lstatSync(join(wt, '.husky', '_')).isSymbolicLink());
  assert.equal(git(wt, 'status', '--porcelain'), '', 'the link is not offered for commit');
  const bad = commit(wt, 'bad message');
  assert.notEqual(bad.status, 0, 'the worktree runs the commit-msg hook');
  assert.match(bad.stdout + bad.stderr, /message must start with ok/);
  assert.equal(commit(wt, 'ok: fine').status, 0);
});

test('.worktreeinclude: a missing file is flagged; an empty one is a decision and says nothing', () => {
  const missing = start({ cwd: repoWithIgnored(undefined) });
  assert.equal(missing.code, 0, missing.out + missing.err);
  assert.match(missing.out, /^warn: no \.worktreeinclude: gitignored files .* add one, or an empty one to silence this$/m);
  const empty = start({ cwd: repoWithIgnored('') });
  assert.equal(empty.code, 0, empty.out + empty.err);
  assert.doesNotMatch(empty.out, /worktreeinclude/);
});
