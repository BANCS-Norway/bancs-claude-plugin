// Tests for work-log (#69). Run: npm run test:worklog
// Real temporary repos and a temporary HOME; the script runs as the skills run it (node, arguments on stdin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIT_ENV, git, repoWithOrigin, tmp } from './lib/test-repo.mjs';
import { memoryDir } from './lib/project-context.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'work-log.mjs');
const run = (cwd, home, args) => {
  const r = spawnSync(process.execPath, [script], { cwd, input: args, encoding: 'utf8', env: { ...GIT_ENV, HOME: home } });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
};
const put = (file, text = 'log') => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

/** A primary clone with a worktree, a temporary HOME, and the memory folder both resolve to. */
function setup() {
  const { dir } = repoWithOrigin();
  git(dir, 'worktree', 'add', '-q', '.worktrees/w', '-b', 'feat/1_w', 'main');
  const home = tmp();
  const main = realpathSync(dir);
  return { dir, wt: join(dir, '.worktrees', 'w'), home, memory: memoryDir(main, home) };
}

test('memory: the same folder from the primary clone and from a worktree', () => {
  const { dir, wt, home, memory } = setup();
  assert.equal(run(dir, home, 'memory').out, `memory: ${memory}`);
  assert.equal(run(wt, home, 'memory').out, `memory: ${memory}`);
});

test('path: finds each layout, and prefers log.md over work-log.md over the flat file', () => {
  const { wt, home, memory } = setup();
  assert.equal(run(wt, home, 'path 5').out, 'path: none');
  put(join(memory, 'issue-5.md'));
  assert.equal(run(wt, home, 'path 5').out, `path: ${join(memory, 'issue-5.md')}`);
  put(join(memory, 'issues', '5', 'work-log.md'));
  assert.equal(run(wt, home, 'path 5').out, `path: ${join(memory, 'issues', '5', 'work-log.md')}`);
  put(join(memory, 'issues', '5', 'log.md'));
  assert.equal(run(wt, home, 'path 5').out, `path: ${join(memory, 'issues', '5', 'log.md')}`);
});

test('create: a legacy log is returned, not shadowed by a new log.md path', () => {
  const { wt, home, memory } = setup();
  put(join(memory, 'issue-6.md'));
  assert.equal(run(wt, home, 'create 6').out, `path: ${join(memory, 'issue-6.md')}`);
  assert.ok(existsSync(join(memory, 'issues', '6')));
});

test('create: makes the folder, prints the log path, and leaves an existing log alone', () => {
  const { wt, home, memory } = setup();
  const log = join(memory, 'issues', '7', 'log.md');
  assert.equal(run(wt, home, 'create 7').out, `path: ${log}`);
  assert.ok(existsSync(dirname(log)));
  put(log, 'keep');
  assert.equal(run(wt, home, 'create 7').out, `path: ${log}`);
  assert.equal(run(wt, home, 'path 7').out, `path: ${log}`);
});

test('active: lists issues from every layout once, in issue order', () => {
  const { wt, home, memory } = setup();
  put(join(memory, 'issues', '19', 'work-log.md'));
  put(join(memory, 'issues', '38', 'log.md'));
  put(join(memory, 'issue-4.md'));
  put(join(memory, 'issue-38.md'));
  mkdirSync(join(memory, 'issues', '50'), { recursive: true }); // a folder without a log
  assert.deepEqual(run(wt, home, 'active').out.split('\n'), [
    `4 ${join(memory, 'issue-4.md')}`,
    `19 ${join(memory, 'issues', '19', 'work-log.md')}`,
    `38 ${join(memory, 'issues', '38', 'log.md')}`,
  ]);
  assert.equal(run(wt, tmp(), 'active').out, '');
});

test('remove: deletes the folder and the flat file, only for that issue', () => {
  const { wt, home, memory } = setup();
  put(join(memory, 'issues', '8', 'log.md'));
  put(join(memory, 'issues', '8', 'notes.md'));
  put(join(memory, 'issue-8.md'));
  put(join(memory, 'issues', '9', 'log.md'));
  const r = run(wt, home, 'remove 8');
  assert.deepEqual(r.out.split('\n'), [`removed: ${join(memory, 'issues', '8')}`, `removed: ${join(memory, 'issue-8.md')}`]);
  assert.equal(run(wt, home, 'path 8').out, 'path: none');
  assert.equal(run(wt, home, 'path 9').out, `path: ${join(memory, 'issues', '9', 'log.md')}`);
  assert.equal(run(wt, home, 'remove 8').out, 'removed: nothing');
});

test('usage errors and a non-repository exit 1', () => {
  const { wt, home } = setup();
  for (const args of ['', 'bogus', 'path', 'path x', 'path 1 2', 'create ../x', 'remove', 'active 1', 'memory 1']) {
    const r = run(wt, home, args);
    assert.equal(r.code, 1, `"${args}"`);
    assert.match(r.err, /^work-log: /);
  }
  const r = run(tmp(), home, 'memory');
  assert.equal(r.code, 1);
  assert.match(r.err, /not in a git repository/);
});
