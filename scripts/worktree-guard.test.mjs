// Tests for the worktree guards (#85). Run: npm run test:wguard
// The edit guard runs as Claude Code runs it: node, payload on stdin, a temporary HOME.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirm } from './lib/project-context.mjs';
import { git, repoWithOrigin, tmp } from './lib/test-repo.mjs';

const editGuard = resolve(dirname(fileURLToPath(import.meta.url)), 'edit-guard.mjs');

/** Run a guard script as the hook does. `payload` is an object, or a string sent as it is. */
function runHook(script, payload, { cwd, home }) {
  const r = spawnSync(process.execPath, [script], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8', cwd,
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  let out = null;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { /* leave null */ }
  return { status: r.status, out, raw: r.stdout };
}
const denied = (r) => r.out?.hookSpecificOutput?.permissionDecision === 'deny';
const reason = (r) => r.out?.hookSpecificOutput?.permissionDecisionReason ?? '';

/** A repo with the guard on (confirmed), and its own HOME. */
function guardedRepo(value = 'on') {
  const { dir } = repoWithOrigin();
  const main = realpathSync(dir);
  const home = tmp();
  confirm(main, 'worktree_guard', value, { home });
  return { main, home };
}
const edit = (file, cwd, tool = 'Edit') => ({ hook_event_name: 'PreToolUse', tool_name: tool, cwd, tool_input: { file_path: file } });

// ---- the edit guard ---------------------------------------------------------------------------

test('edit guard: Write, Edit and NotebookEdit on a file in the main checkout are denied, with the way out', () => {
  const { main, home } = guardedRepo();
  for (const tool of ['Write', 'Edit']) {
    const r = runHook(editGuard, edit(join(main, 'a.txt'), main, tool), { cwd: main, home });
    assert.equal(r.status, 0);
    assert.ok(denied(r), tool);
    assert.match(reason(r), /worktree-create/);
    assert.match(reason(r), /confirm worktree_guard off/);
  }
  const nb = runHook(editGuard, { hook_event_name: 'PreToolUse', tool_name: 'NotebookEdit', cwd: main, tool_input: { notebook_path: join(main, 'n.ipynb') } }, { cwd: main, home });
  assert.ok(denied(nb));
});

test('edit guard: a relative path, a file not written yet and a new folder are judged by the repo they land in', () => {
  const { main, home } = guardedRepo();
  assert.ok(denied(runHook(editGuard, edit('a.txt', main), { cwd: main, home })));
  assert.ok(denied(runHook(editGuard, edit('src/new/deep/file.js', main), { cwd: main, home })));
  mkdirSync(join(main, 'src'));
  assert.ok(denied(runHook(editGuard, edit('../src/x.js', join(main, 'src')), { cwd: main, home })));
});

test('edit guard: .worktrees/ and .claude/ in the main checkout are allowed, even before they exist', () => {
  const { main, home } = guardedRepo();
  for (const f of ['.worktrees/feat-1-x/a.txt', '.claude/settings.json', '.claude/new/x.md']) {
    assert.equal(denied(runHook(editGuard, edit(join(main, f), main), { cwd: main, home })), false, f);
  }
});

test('edit guard: a file in a linked worktree is allowed, and a file in main is denied from a session in that worktree', () => {
  const { main, home } = guardedRepo();
  const inside = join(main, '.worktrees', 'feat-1-x');
  const beside = join(tmp(), 'feat-2-y');
  git(main, 'worktree', 'add', '-q', '-b', 'feat/1_x', inside);
  git(main, 'worktree', 'add', '-q', '-b', 'feat/2_y', beside);
  for (const wt of [inside, realpathSync(beside)]) {
    assert.equal(denied(runHook(editGuard, edit(join(wt, 'a.txt'), wt), { cwd: wt, home })), false, wt);
    assert.equal(denied(runHook(editGuard, edit(join(wt, 'src', 'new.js'), wt), { cwd: wt, home })), false, wt);
    assert.ok(denied(runHook(editGuard, edit(join(main, 'a.txt'), wt), { cwd: wt, home })), `main from ${wt}`);
  }
});

test('edit guard: a file outside every repo, and a session outside a repo, are allowed', () => {
  const { main, home } = guardedRepo();
  const elsewhere = tmp();
  assert.equal(denied(runHook(editGuard, edit(join(elsewhere, 'notes.md'), main), { cwd: main, home })), false);
  assert.equal(denied(runHook(editGuard, edit(join(elsewhere, 'a', 'b', 'notes.md'), elsewhere), { cwd: elsewhere, home })), false);
  assert.equal(denied(runHook(editGuard, edit(join(home, '.claude', 'memory', 'x.md'), main), { cwd: main, home })), false);
});

test('edit guard: with the fact off, or a repo that never opted in, nothing is blocked', () => {
  const off = guardedRepo('off');
  assert.equal(denied(runHook(editGuard, edit(join(off.main, 'a.txt'), off.main), { cwd: off.main, home: off.home })), false);
  // never opted in: detected, not confirmed; no .worktrees/ and no work log, so off
  const { dir } = repoWithOrigin();
  const main = realpathSync(dir);
  assert.equal(denied(runHook(editGuard, edit(join(main, 'a.txt'), main), { cwd: main, home: tmp() })), false);
});

test('edit guard: a repo that already uses worktrees is on without being told', () => {
  const { dir } = repoWithOrigin();
  const main = realpathSync(dir);
  const home = tmp();
  mkdirSync(join(main, '.worktrees'));
  assert.ok(denied(runHook(editGuard, edit(join(main, 'a.txt'), main), { cwd: main, home })));
});

test('edit guard: other tools, unreadable payloads and a payload with no file do nothing', () => {
  const { main, home } = guardedRepo();
  const file = join(main, 'a.txt');
  assert.equal(denied(runHook(editGuard, edit(file, main, 'Bash'), { cwd: main, home })), false);
  for (const bad of ['not json', '[]', 'null', '', '{}', JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: {} }), JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file } })]) {
    const r = runHook(editGuard, bad, { cwd: main, home });
    assert.equal(r.status, 0, bad);
    assert.equal(r.raw, '', bad);
  }
});

test('edit guard: a file that is a symlink out of the repo is judged where it lands', () => {
  const { main, home } = guardedRepo();
  const elsewhere = tmp();
  writeFileSync(join(elsewhere, 'real.txt'), 'x');
  mkdirSync(join(main, 'link-parent'));
  spawnSync('ln', ['-s', elsewhere, join(main, 'link-parent', 'out')]);
  assert.equal(denied(runHook(editGuard, edit(join(main, 'link-parent', 'out', 'real.txt'), main), { cwd: main, home })), false);
});
