// Tests for the PreToolUse `git -C` guard (#87). Run: npm run test:gitc
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usesGitC } from './lib/git-c-guard.mjs';
import { git, repoWithOrigin, tmp } from './lib/test-repo.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'git-c-guard.mjs');
const lines = (...l) => l.join('\n');

/** A repo whose origin is on GitHub (only the URL matters: the guard never talks to the network). */
function githubRepo() {
  const { dir } = repoWithOrigin();
  git(dir, 'remote', 'set-url', 'origin', 'https://github.com/acme/app.git');
  return dir;
}

/** Run the hook as Claude Code does: node, payload on stdin. Returns { status, out, raw } with out parsed. */
function run(cwd, { command = 'git -C /r log', payload, env = {} } = {}) {
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

test('usesGitC sees git -C in every command position, whatever the subcommand', () => {
  for (const c of [
    'git -C dir commit -m x',
    'git -C dir log',
    'git -C dir status',
    'cd x && git -C y status',
    'cd x; git -C y status',
    'ls | git -C y apply',
    'false || git -C y log',
    '(git -C y log)',
    'echo "$(git -C y log)"',
    'FOO=1 git -C y status',
    'git -c user.name=x -C y log',
    'git --no-pager -C y log',
    'git -C "$dir" status',
    lines('ls', 'git -C y status'),
    lines("cat > f <<'EOF'", 'body', 'EOF', 'git -C y status'),
  ]) {
    assert.equal(usesGitC(c), true, c);
  }
});

// The review of #87 found these passing: a command position after a keyword, a brace or a wrapper,
// a path to git, and global options in short or separated form.
test('usesGitC sees git -C after a keyword, a brace, a wrapper or a path, and behind any global option', () => {
  for (const c of [
    'if true; then git -C y log; fi',
    'for d in a; do git -C $d log; done',
    'if git -C y diff --quiet; then echo clean; fi',
    'while true; do git -C y pull; done',
    'x || { git -C y log; }',
    '{ git -C y log; }',
    '! git -C y log',
    '/usr/bin/git -C y log',
    'command git -C y log',
    'env git -C y log',
    'env FOO=1 git -C y log',
    'sudo git -C y log',
    'time git -C y log',
    'ls | xargs git -C y log',
    'git -p -C y log',
    'git -P -C y log',
    'git --git-dir x -C y log',
    'git --work-tree w --git-dir g -C y log',
    'git --exec-path=/p --no-pager -C y log',
    'git  -C y log',
    'git\t-C y log',
  ]) {
    assert.equal(usesGitC(c), true, c);
  }
});

test('usesGitC ignores text that only mentions git -C, and a -C that is not a git option', () => {
  for (const c of [
    'echo "git -C"',
    "echo 'run git -C dir status'",
    'git commit -m "use git -C no more"',
    'gh pr create --title "x" --body "never git -C"',
    lines("cat > note.md <<'EOF'", 'git -C dir commit is not recognised', 'EOF', 'gh issue comment 87 --body-file note.md'),
    lines('gh pr edit 84 --body "$(cat <<\'EOF\'', 'deny git -C', 'EOF', ')"'),
    'echo git -C',
    'git log -C',
    'git diff -C -M',
    'git grep -C 3 foo',
    'git status',
    'git -c user.name=x status',
    'gitk -C',
    'npm run git -C',
    // a wrapper or keyword as an argument is not a command position
    'echo then git -C y',
    'echo sudo git -C y',
    'ls /usr/bin/git -C',
    'grep -r git -C src',
    // a global option takes the next word only when it is one that does: -C here belongs to the subcommand
    'git --no-pager log -C',
    'git -p log -C',
    'git --git-dir x log -C',
    'git -c a=b diff -C',
    'echo "x; git -C y log"',
    '',
  ]) {
    assert.equal(usesGitC(c), false, c);
  }
});

test('usesGitC never throws, even on a deeply nested command', () => {
  const deep = 'git -C y log ' + '"$('.repeat(20000);
  assert.doesNotThrow(() => usesGitC(deep));
  assert.doesNotThrow(() => usesGitC(undefined));
  assert.doesNotThrow(() => usesGitC(42));
});

// A long row of separators once took seconds to minutes (every `;` or newline rescanned the rest). A hook must not stall.
test('usesGitC stays fast on long rows of separators, newlines and wrappers', () => {
  const started = Date.now();
  for (const c of ['\n'.repeat(100000) + 'git', ';'.repeat(100000) + 'git', ';a='.repeat(50000) + 'git', 'x/'.repeat(50000) + 'git -C y', 'sudo '.repeat(50000) + 'git -C y']) {
    usesGitC(c);
  }
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});

test('the hook denies git -C with a reason that says to cd and run plain git', () => {
  const dir = githubRepo();
  for (const command of ['git -C /r commit -m x', 'cd x && git -C y status', 'git -C dir log']) {
    const r = run(dir, { command });
    assert.equal(r.status, 0, command);
    assert.equal(denied(r), true, command);
    assert.equal(r.out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.match(reason(r), /git -C/);
    assert.match(reason(r), /\bcd\b/);
    assert.match(reason(r), /plain `git`/);
  }
});

test('the hook lets through a command that only mentions git -C', () => {
  const dir = githubRepo();
  for (const command of [
    'echo "git -C"',
    'git commit -m "no more git -C"',
    lines('gh pr create --title "x" --body "$(cat <<\'EOF\'', 'deny every git -C use', 'EOF', ')"'),
    'git log -C',
    'git status',
  ]) {
    const r = run(dir, { command });
    assert.equal(r.status, 0, command);
    assert.equal(r.raw.trim(), '', command);
  }
});

test('the hook does nothing outside a repo whose origin is on GitHub', () => {
  const { dir } = repoWithOrigin(); // origin is a local bare repo
  assert.equal(run(dir).raw.trim(), '');
  git(dir, 'remote', 'set-url', 'origin', 'https://gitlab.com/acme/app.git');
  assert.equal(run(dir).raw.trim(), '');
  git(dir, 'remote', 'remove', 'origin');
  assert.equal(run(dir).raw.trim(), '');
  assert.equal(run(tmp()).raw.trim(), '', 'not a repo at all');
});

test('the hook does nothing for another event, another tool, or a payload it cannot read', () => {
  const dir = githubRepo();
  const bash = { command: 'git -C /r log' };
  assert.equal(run(dir, { payload: JSON.stringify({ hook_event_name: 'PostToolUse', cwd: dir, tool_input: bash }) }).raw.trim(), '');
  assert.equal(run(dir, { payload: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: dir, tool_input: { file_path: '/x' } }) }).raw.trim(), '');
  for (const payload of ['not json', '[]', 'null', '']) {
    const r = run(dir, { payload });
    assert.equal(r.status, 0, payload);
    assert.equal(r.raw.trim(), '', payload);
  }
});

test('a deeply nested command does not fail the session', () => {
  const r = run(githubRepo(), { command: 'git -C y log ' + '"$('.repeat(20000) });
  assert.equal(r.status, 0);
});
