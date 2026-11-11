// Tests for worktree-finish (#44). Run: npm run test:finish
// Real temporary repos, the script run as the skill runs it (node, arguments on stdin), and a fake
// `gh` whose `pr list` prints FAKE_GH_PRS, so nothing touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIT_ENV, PATH_WITH_GH, git, repoWithOrigin, tmp } from './lib/test-repo.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'worktree-finish.mjs');
const BRANCH = 'feat/7_demo';
const PATH_ARG = '.worktrees/feat-7-demo';

function finish(verb, { cwd, env = {}, args = `${verb} 7 ${BRANCH} ${PATH_ARG}` }) {
  const r = spawnSync(process.execPath, [script], {
    cwd, input: args, encoding: 'utf8',
    env: { ...GIT_ENV, PATH: PATH_WITH_GH, HOME: tmp(), ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const merged = (dir, over = {}) => JSON.stringify([{ number: 9, state: 'MERGED', mergedAt: '2026-11-11T00:00:00Z', headRefOid: git(dir, 'rev-parse', BRANCH), ...over }]);

/** A repo with the worktree on BRANCH holding one commit that main does not have. */
function withWorktree() {
  const { dir } = repoWithOrigin();
  git(dir, 'worktree', 'add', '-q', PATH_ARG, '-b', BRANCH, 'main');
  writeFileSync(join(dir, PATH_ARG, 'work.txt'), 'w');
  git(join(dir, PATH_ARG), 'add', '-A');
  git(join(dir, PATH_ARG), 'commit', '-q', '-m', 'work');
  return dir;
}

test('status: a clean worktree, its branch and the PR GitHub knows', () => {
  const dir = withWorktree();
  const r = finish('status', { cwd: dir, env: { FAKE_GH_PRS: merged(dir) } });
  assert.equal(r.code, 0, r.out + r.err);
  for (const line of [`primary: ${dir}`, 'worktree: present', 'branch: present', 'dirty: no', 'pr: merged #9']) {
    assert.ok(r.out.split('\n').includes(line), `${line}\n${r.out}`);
  }
});

test('status: dirty changes, an open PR, no PR, and gh not answering', () => {
  const dir = withWorktree();
  writeFileSync(join(dir, PATH_ARG, 'new.txt'), 'n');
  const open = finish('status', { cwd: dir, env: { FAKE_GH_PRS: JSON.stringify([{ number: 4, state: 'OPEN', mergedAt: null }]) } });
  assert.match(open.out, /^dirty: yes \(1 change\)$/m);
  assert.match(open.out, /^pr: open #4$/m);
  assert.match(finish('status', { cwd: dir }).out, /^pr: none$/m);
  assert.match(finish('status', { cwd: dir, env: { FAKE_GH_FAIL: '1' } }).out, /^pr: unknown \(gh did not answer\)$/m);
});

test('status: both gone is an interrupted cleanup; a deleted folder git still lists says so', () => {
  const dir = withWorktree();
  rmSync(join(dir, PATH_ARG), { recursive: true });
  const stale = finish('status', { cwd: dir });
  assert.match(stale.out, /^worktree: gone \(git still lists it\)$/m);
  git(dir, 'worktree', 'prune');
  git(dir, 'branch', '-D', BRANCH);
  const gone = finish('status', { cwd: dir });
  assert.match(gone.out, /^worktree: gone$/m);
  assert.match(gone.out, /^branch: gone$/m);
  assert.doesNotMatch(gone.out, /^dirty:/m);
});

test('remove: a branch git sees as merged goes with -d, and the worktree first', () => {
  const dir = withWorktree();
  git(dir, 'merge', '-q', '--no-ff', '-m', 'merge', BRANCH);
  const r = finish('remove', { cwd: dir });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, new RegExp(`^ok: worktree ${PATH_ARG} removed$`, 'm'));
  assert.match(r.out, new RegExp(`^ok: branch ${BRANCH} deleted$`, 'm'));
  assert.match(r.out, /^finish: done$/m);
  assert.equal(existsSync(join(dir, PATH_ARG)), false);
  assert.equal(git(dir, 'branch', '--list', BRANCH), '');
});

test('remove: a branch git does not see as merged is deleted with -D only when the merged PR ends at its tip', () => {
  const dir = withWorktree();
  const r = finish('remove', { cwd: dir, env: { FAKE_GH_PRS: merged(dir) } });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^ok: branch feat\/7_demo deleted \(PR #9 is merged on GitHub; git does not see the branch as merged\)$/m);
  assert.doesNotMatch(r.out, /squash|rebase/i, 'the message names no merge type');
  assert.equal(git(dir, 'branch', '--list', BRANCH), '');
});

test('remove: commits the merged PR does not have keep the branch', () => {
  const dir = withWorktree();
  const tipAtMerge = git(dir, 'rev-parse', BRANCH);
  writeFileSync(join(dir, PATH_ARG, 'late.txt'), 'late');
  git(join(dir, PATH_ARG), 'add', '-A');
  git(join(dir, PATH_ARG), 'commit', '-q', '-m', 'after the merge');
  const r = finish('remove', { cwd: dir, env: { FAKE_GH_PRS: merged(dir, { headRefOid: tipAtMerge }) } });
  assert.equal(r.code, 1);
  assert.match(r.out, /^FAIL: branch feat\/7_demo is not merged and no merged PR ends at its tip/m);
  assert.match(r.out, /^finish: failed$/m);
  assert.notEqual(git(dir, 'branch', '--list', BRANCH), '', 'the branch is still there');
});

test('remove: an open PR, no PR, or gh not answering never deletes an unmerged branch', () => {
  for (const env of [{ FAKE_GH_PRS: JSON.stringify([{ number: 4, state: 'OPEN', mergedAt: null, headRefOid: 'x' }]) }, {}, { FAKE_GH_FAIL: '1' }]) {
    const dir = withWorktree();
    const r = finish('remove', { cwd: dir, env });
    assert.equal(r.code, 1, JSON.stringify(env));
    assert.notEqual(git(dir, 'branch', '--list', BRANCH), '');
  }
  const dir = withWorktree();
  assert.match(finish('remove', { cwd: dir, env: { FAKE_GH_FAIL: '1' } }).out, /gh did not answer, so a merged PR cannot be confirmed/);
});

test('remove: a dirty worktree is left alone, branch included', () => {
  const dir = withWorktree();
  writeFileSync(join(dir, PATH_ARG, 'wip.txt'), 'wip');
  const r = finish('remove', { cwd: dir, env: { FAKE_GH_PRS: merged(dir) } });
  assert.equal(r.code, 1);
  assert.match(r.out, /^FAIL: git worktree remove failed/m);
  assert.equal(existsSync(join(dir, PATH_ARG)), true);
  assert.notEqual(git(dir, 'branch', '--list', BRANCH), '');
});

test('remove: an interrupted cleanup resumes: what is gone is ok, a stale listing is pruned', () => {
  const dir = withWorktree();
  rmSync(join(dir, PATH_ARG), { recursive: true });
  const first = finish('remove', { cwd: dir, env: { FAKE_GH_PRS: merged(dir) } });
  assert.equal(first.code, 0, first.out + first.err);
  assert.match(first.out, /^ok: worktree \.worktrees\/feat-7-demo was already gone; pruned$/m);
  const again = finish('remove', { cwd: dir });
  assert.equal(again.code, 0, again.out + again.err);
  assert.match(again.out, /^ok: worktree \.worktrees\/feat-7-demo already gone$/m);
  assert.match(again.out, new RegExp(`^ok: branch ${BRANCH} already gone$`, 'm'));
});

test('remove runs from inside the worktree it removes, and reports the main checkout', () => {
  const dir = withWorktree();
  const r = finish('remove', { cwd: join(dir, PATH_ARG), env: { FAKE_GH_PRS: merged(dir) } });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, new RegExp(`^primary: ${dir}$`, 'm'));
  assert.equal(existsSync(join(dir, PATH_ARG)), false);
});

test('bad arguments are refused before anything runs', () => {
  const dir = withWorktree();
  for (const args of ['', 'remove', 'wipe 7 a b', 'remove x a b', `remove 7 ${BRANCH} ${PATH_ARG} extra`]) {
    const r = finish('remove', { cwd: dir, args });
    assert.equal(r.code, 1, args);
    assert.match(r.err, /expected <status\|remove> <issue-number> <branch> <worktree-path>/);
  }
  assert.equal(existsSync(join(dir, PATH_ARG)), true);
});
