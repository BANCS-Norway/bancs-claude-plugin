// Tests for the PreToolUse commit guard (#45). Run: npm run test:guard
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCommitCommand } from './lib/commit-guard.mjs';
import { git, repoWithOrigin, tmp } from './lib/test-repo.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'commit-guard.mjs');

/** Run the hook as Claude Code does: node, payload on stdin. Returns { status, out } with out parsed. */
function run(cwd, { command = 'git commit -m x', payload, env = {} } = {}) {
  const input = payload ?? JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command } });
  const r = spawnSync(process.execPath, [script], {
    input, encoding: 'utf8', cwd,
    env: { PATH: process.env.PATH, HOME: tmp(), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...env },
  });
  let out = null;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { /* leave null */ }
  return { status: r.status, out, raw: r.stdout };
}
const denied = (r) => r.out?.hookSpecificOutput?.permissionDecision === 'deny';
const reason = (r) => r.out?.hookSpecificOutput?.permissionDecisionReason ?? '';
const warning = (r) => r.out?.systemMessage ?? '';

/** A repo on a feature branch with `files` (path -> text) staged. */
function featureRepo(files = {}) {
  const { dir } = repoWithOrigin();
  git(dir, 'switch', '-q', '-c', 'feat/1_x');
  stage(dir, files);
  return dir;
}
function stage(dir, files) {
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  git(dir, 'add', '-A');
}

test('isCommitCommand matches a git commit command and nothing else', () => {
  for (const c of ['git commit -m x', 'git commit', 'cd a && git commit -am x', 'FOO=1 git commit -m x', 'git -c user.name=x commit -m y', 'git add . ; git commit -m x', 'git --no-pager commit -m x', 'git commit -m "add a -h flag and --help text"', "git commit -m 'fix'"]) {
    assert.equal(isCommitCommand(c), true, c);
  }
  for (const c of ['git status', 'git commit --help', 'git log --grep "git commit"', 'echo git commit', 'git commit-tree HEAD^{tree}', 'gitk commit', 'npm run commit', 'echo "x; git commit -m y"']) {
    assert.equal(isCommitCommand(c), false, c);
  }
});

test('blocks a commit on the default branch and names the way out', () => {
  const { dir } = repoWithOrigin();
  stage(dir, { 'b.txt': 'b' });
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.equal(denied(r), true);
  assert.match(reason(r), /default branch 'main'/);
  assert.match(reason(r), /worktree-create/);
  assert.match(reason(r), /BCP_ALLOW_DEFAULT_BRANCH_COMMIT=1/);
});

test('allows a commit on a feature branch', () => {
  const r = run(featureRepo({ 'b.txt': 'b' }));
  assert.equal(r.status, 0);
  assert.equal(r.raw.trim(), '');
});

test('allows the first commit of a repo that has none, even on main', () => {
  const dir = tmp();
  git(dir, 'init', '-q', '-b', 'main');
  stage(dir, { 'a.txt': 'a' });
  assert.equal(run(dir).raw.trim(), '');
});

test('without origin/HEAD, main and master still count as the default branch', () => {
  const dir = tmp();
  git(dir, 'init', '-q', '-b', 'master');
  stage(dir, { 'a.txt': 'a' });
  git(dir, 'commit', '-q', '-m', 'init');
  stage(dir, { 'b.txt': 'b' });
  assert.equal(denied(run(dir)), true);
});

test('origin/HEAD decides when the default branch has another name', () => {
  const { dir } = repoWithOrigin();
  git(dir, 'branch', '-m', 'main', 'trunk');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
  stage(dir, { 'b.txt': 'b' });
  assert.match(reason(run(dir)), /default branch 'trunk'/);
});

test('BCP_ALLOW_DEFAULT_BRANCH_COMMIT=1 lets a commit on the default branch through', () => {
  const { dir } = repoWithOrigin();
  stage(dir, { 'b.txt': 'b' });
  assert.equal(run(dir, { env: { BCP_ALLOW_DEFAULT_BRANCH_COMMIT: '1' } }).raw.trim(), '');
});

test('blocks a staged secret file by name, and says how to unstage it', () => {
  for (const name of ['.env', 'config/.env.production', 'deploy.pem', 'server.key', 'home/.ssh/id_rsa']) {
    const r = run(featureRepo({ [name]: 'x' }));
    assert.equal(denied(r), true, name);
    assert.ok(reason(r).includes(name), name);
    assert.match(reason(r), /git restore --staged/);
  }
});

test('lets a template env file through', () => {
  for (const name of ['.env.example', '.env.sample', '.env.template']) {
    assert.equal(run(featureRepo({ [name]: 'KEY=' })).raw.trim(), '', name);
  }
});

test('blocks a staged secret by content, naming the file and kind but never the value', () => {
  const cases = {
    'aws.txt': 'id = AKIAABCDEFGHIJKLMNOP',
    'k.txt': '-----BEGIN OPENSSH PRIVATE KEY-----',
    'gh.txt': 'token ghp_' + 'a'.repeat(36),
    'pat.txt': 'github_pat_' + 'A1'.repeat(30),
    'oa.txt': 'key sk-' + 'b'.repeat(40),
  };
  for (const [name, text] of Object.entries(cases)) {
    const r = run(featureRepo({ [name]: text }));
    assert.equal(denied(r), true, name);
    assert.ok(reason(r).includes(name), name);
    assert.ok(!reason(r).includes(text.split(' ').pop()), `${name}: the value is not echoed`);
  }
});

test('a secret on a line that is not added does not block', () => {
  const dir = featureRepo({ 'aws.txt': 'AKIAABCDEFGHIJKLMNOP\nx\n' });
  git(dir, 'commit', '-q', '-m', 'seed'); // committed once, already past the guard
  stage(dir, { 'aws.txt': 'AKIAABCDEFGHIJKLMNOP\nx\ny\n' });
  assert.equal(run(dir).raw.trim(), '');
});

test('BCP_ALLOW_SECRET_COMMIT=1 lets a secret through', () => {
  assert.equal(run(featureRepo({ '.env': 'x' }), { env: { BCP_ALLOW_SECRET_COMMIT: '1' } }).raw.trim(), '');
});

test('blocks a staged file over 1 MB and names it', () => {
  const r = run(featureRepo({ 'big.bin': 'a'.repeat(1024 * 1024 + 1) }));
  assert.equal(denied(r), true);
  assert.match(reason(r), /big\.bin/);
  assert.match(reason(r), /Git LFS/);
  assert.equal(run(featureRepo({ 'ok.bin': 'a'.repeat(1024 * 1024) })).raw.trim(), '');
});

test('BCP_ALLOW_LARGE_FILE_COMMIT=1 lets a large file through', () => {
  const dir = featureRepo({ 'big.bin': 'a'.repeat(1024 * 1024 + 1) });
  assert.equal(run(dir, { env: { BCP_ALLOW_LARGE_FILE_COMMIT: '1' } }).raw.trim(), '');
});

test('warns, without blocking, about stray staged files', () => {
  const r = run(featureRepo({ 'CHECKLIST.md': '- [ ] x', 'node_modules/p/i.js': 'x', 'debug.log': 'x', '.DS_Store': 'x', 'src/ok.js': 'x' }));
  assert.equal(denied(r), false);
  for (const name of ['CHECKLIST.md', 'node_modules/p/i.js', 'debug.log', '.DS_Store']) assert.ok(warning(r).includes(name), name);
  assert.ok(!warning(r).includes('src/ok.js'));
  assert.match(warning(r), /git restore --staged/);
});

test('one block reports every problem, and keeps the stray-file warning', () => {
  const { dir } = repoWithOrigin();
  stage(dir, { '.env': 'x', 'debug.log': 'x' });
  const r = run(dir);
  assert.equal(denied(r), true);
  assert.match(reason(r), /default branch/);
  assert.match(reason(r), /\.env/);
  assert.match(reason(r), /debug\.log/);
});

test('does nothing for a command that is not a commit', () => {
  const { dir } = repoWithOrigin(); // on main, would block a commit
  assert.equal(run(dir, { command: 'git status' }).raw.trim(), '');
  assert.equal(run(dir, { command: 'git commit --help' }).raw.trim(), '');
});

test('does nothing for another event, an unreadable payload, or a payload with no command', () => {
  const { dir } = repoWithOrigin();
  stage(dir, { 'b.txt': 'b' });
  for (const payload of ['not json', '', '{}', JSON.stringify({ hook_event_name: 'Stop', tool_input: { command: 'git commit -m x' } })]) {
    const r = run(dir, { payload });
    assert.equal(r.status, 0, payload);
    assert.equal(r.raw.trim(), '', payload);
  }
});

test('never fails the session: a directory that is not a repo exits 0 and says nothing', () => {
  const r = run(tmp());
  assert.equal(r.status, 0);
  assert.equal(r.raw.trim(), '');
});

test('never fails the session: git missing from PATH exits 0 and says nothing', () => {
  const { dir } = repoWithOrigin();
  const r = run(dir, { env: { PATH: dirname(process.execPath) } });
  assert.equal(r.status, 0);
  assert.equal(r.raw.trim(), '');
});
