// Tests for the SessionStart hook that points a new session at the issues skill (#47).
// Run: npm run test:issues. Real temporary repos and a temporary HOME; the hook runs as Claude Code runs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryDir } from './lib/project-context.mjs';
import { git, repoWithOrigin, tmp } from './lib/test-repo.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'issues-start.mjs');

/** Run the hook in `cwd`; `payload` is an object, or a raw string. Returns { status, out, raw }. */
function run(cwd, home, payload = { hook_event_name: 'SessionStart', source: 'startup' }) {
  const r = spawnSync(process.execPath, [script], {
    cwd, encoding: 'utf8',
    input: typeof payload === 'string' ? payload : JSON.stringify({ cwd, ...payload }),
    env: { PATH: process.env.PATH, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  let out = null;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { /* leave null */ }
  return { status: r.status, out, raw: r.stdout, err: r.stderr };
}
const context = (r) => r.out?.hookSpecificOutput?.additionalContext ?? '';

/** A repo whose origin is on GitHub, a temporary HOME, and the memory folder the hook will read. */
function setup({ origin = 'https://github.com/acme/app.git' } = {}) {
  const { dir } = repoWithOrigin();
  if (origin) git(dir, 'remote', 'set-url', 'origin', origin);
  const home = tmp();
  return { dir, home, memory: memoryDir(realpathSync(dir), home) };
}
const putLog = (file) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, 'log');
};

test('a new session with no active issue work log is pointed at the issues skill', () => {
  const { dir, home } = setup();
  const r = run(dir, home);
  assert.equal(r.status, 0);
  assert.equal(r.out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(context(r), /no active issue work log/);
  assert.match(context(r), /`issues` skill/);
});

test('the context states facts and gives no command', () => {
  const { dir, home } = setup();
  assert.doesNotMatch(context(run(dir, home)), /\b(you must|always|immediately|do not|ignore|system)\b/i);
});

test('startup and clear count as a new session; so does a payload that names no source', () => {
  const { dir, home } = setup();
  for (const source of ['startup', 'clear', undefined]) {
    assert.notEqual(context(run(dir, home, { hook_event_name: 'SessionStart', source })), '', String(source));
  }
});

test('resume and compact are not a new session', () => {
  const { dir, home } = setup();
  for (const source of ['resume', 'compact']) {
    assert.equal(run(dir, home, { hook_event_name: 'SessionStart', source }).raw.trim(), '', source);
  }
});

test('an active work log, in any layout, means there is issue context', () => {
  for (const rel of [['issues', '45', 'log.md'], ['issues', '45', 'work-log.md'], ['issue-45.md']]) {
    const { dir, home, memory } = setup();
    putLog(join(memory, ...rel));
    assert.equal(run(dir, home).raw.trim(), '', rel.join('/'));
  }
});

test('a session started inside a worktree sees the same logs as the primary clone', () => {
  const { dir, home, memory } = setup();
  git(dir, 'worktree', 'add', '-q', '.worktrees/w', '-b', 'feat/1_w', 'main');
  putLog(join(memory, 'issues', '1', 'log.md'));
  assert.equal(run(join(dir, '.worktrees', 'w'), home).raw.trim(), '');
});

test('does nothing outside a repo whose origin is on GitHub', () => {
  const noOrigin = setup({ origin: null });
  git(noOrigin.dir, 'remote', 'remove', 'origin');
  assert.equal(run(noOrigin.dir, noOrigin.home).raw.trim(), '');
  const gitlab = setup({ origin: 'https://gitlab.com/acme/app.git' });
  assert.equal(run(gitlab.dir, gitlab.home).raw.trim(), '');
  assert.equal(run(tmp(), tmp()).raw.trim(), ''); // not a repo at all
});

test('does nothing for another event, an unreadable payload, and still exits 0', () => {
  const { dir, home } = setup();
  for (const payload of [{ hook_event_name: 'Stop' }, 'not json', '[1]']) {
    const r = run(dir, home, payload);
    assert.equal(r.status, 0);
    assert.equal(r.raw.trim(), '');
  }
});

test('an empty payload counts as a session start', () => {
  const { dir, home } = setup();
  assert.notEqual(context(run(dir, home, '')), '');
});
