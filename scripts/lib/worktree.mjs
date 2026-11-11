// Starts a worktree for an issue (#44, the shim steps of worktree-create): the preflight, `git worktree
// add` from the base it names, the dependency bootstrap and `direnv allow`. Code, not prose in a skill,
// so a skipped step is a failed run. A failed preflight creates nothing.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { git } from './repo.mjs';
import { checkoutRoots, ensure } from './project-context.mjs';
import { exists, gh, isListed, preflight } from './preflight.mjs';

/** { ok, out } for a command run with no prompts and a time limit; `out` is the error text on failure. */
function run(cwd, ms, cmd, ...args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: ms }) };
  } catch (err) {
    return { ok: false, missing: err.code === 'ENOENT', out: String(err.stderr || err.message).trim().split('\n').pop() };
  }
}

/** Makes `node_modules` available in the worktree: the main checkout's, linked; else a clean install. */
function bootstrapNode(main, wt, add) {
  if (!existsSync(join(wt, 'package.json')) || !existsSync(join(wt, 'package-lock.json'))) return;
  const modules = join(wt, 'node_modules');
  if (!existsSync(modules)) {
    const shared = join(main, 'node_modules');
    if (existsSync(shared)) {
      symlinkSync(relative(dirname(modules), shared), modules);
      add('ok', 'node_modules linked from the main checkout');
    } else {
      const install = run(wt, 600000, 'npm', 'ci');
      add(install.ok ? 'ok' : 'warn', install.ok ? 'npm ci done' : `npm ci failed (${install.out}); run it in the worktree`);
    }
  }
  // a symlink is not matched by the `node_modules/` .gitignore pattern, so exclude it by name
  const exclude = resolve(wt, git(wt, 'rev-parse', '--git-path', 'info/exclude') ?? '');
  const have = existsSync(exclude) ? readFileSync(exclude, 'utf8').split('\n') : [];
  if (!have.includes('node_modules')) appendFileSync(exclude, `${have.length && have.at(-1) !== '' ? '\n' : ''}node_modules\n`);
}

/**
 * Runs the preflight and, only when it passes, creates the worktree. Returns { base, results, ok,
 * created }: the preflight's lines followed by one line per step taken.
 */
export function startWorktree({ cwd, issue, branch, path }) {
  const found = preflight({ cwd, issue, branch, path });
  const results = [...found.results];
  const add = (level, msg) => results.push({ level, msg });
  if (!found.ok || !found.base) return { base: found.base, results, ok: false, created: false };
  const { main } = checkoutRoots(cwd);
  const wt = resolve(main, path);

  const made = run(main, 60000, 'git', 'worktree', 'add', path, '-b', branch, found.base);
  if (!made.ok) {
    add('FAIL', `git worktree add failed: ${made.out}`);
    return { base: found.base, results, ok: false, created: false };
  }
  add('ok', `worktree ${path} created on ${branch} from ${found.base}`);

  bootstrapNode(main, wt, add);

  if (ensure(cwd, ['direnv']).entries.direnv.value === true) {
    // direnv's trust is per path: a new worktree is untrusted though the main checkout's .envrc was allowed
    const allowed = run(wt, 15000, 'direnv', 'allow');
    if (allowed.ok) add('ok', 'direnv allowed in the worktree');
    else add('warn', allowed.missing ? 'the project uses direnv but it is not installed; the worktree is not allowed' : `direnv allow failed (${allowed.out})`);
  }
  return { base: found.base, results, ok: true, created: true };
}

// ---- finishing: after the PR is merged -------------------------------------------------------

/** The PRs that have `branch` as their head, newest first: an array, or null when gh did not answer. */
function prsFor(main, branch, state) {
  const out = gh(main, 'pr', 'list', '--head', branch, '--state', state, '--limit', '5', '--json', 'number,state,mergedAt,headRefOid');
  try {
    const list = JSON.parse(out.out);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

/**
 * What cleanup needs to know before it asks: { lines } of `key: value`. Read-only. `worktree` and
 * `branch` are `present` or `gone` (both gone means an interrupted cleanup), `dirty` says whether the
 * worktree has changes git would refuse to remove, `pr` says what GitHub knows about the branch.
 */
export function worktreeStatus({ cwd, branch, path }) {
  const roots = checkoutRoots(cwd);
  if (!roots) return { ok: false, lines: ['FAIL: not in a git repository'] };
  const { main } = roots;
  const abs = resolve(main, path);
  const lines = [`primary: ${main}`];
  const present = existsSync(abs);
  lines.push(`worktree: ${present ? 'present' : isListed(main, abs) ? 'gone (git still lists it)' : 'gone'}`);
  lines.push(`branch: ${exists(main, `refs/heads/${branch}`) ? 'present' : 'gone'}`);
  if (present) {
    const changes = (git(abs, 'status', '--porcelain') ?? '').split('\n').filter(Boolean).length;
    lines.push(changes ? `dirty: yes (${changes} change${changes === 1 ? '' : 's'})` : 'dirty: no');
  }
  const prs = prsFor(main, branch, 'all');
  const pr = prs?.find((p) => p?.mergedAt) ?? prs?.[0];
  lines.push(!prs ? 'pr: unknown (gh did not answer)'
    : !pr ? 'pr: none'
      : `pr: ${pr.mergedAt ? 'merged' : String(pr.state).toLowerCase()} #${pr.number}`);
  return { ok: true, lines };
}

/**
 * Removes the worktree, then the local branch. Each step that is already done is `ok` (a cleanup that
 * was interrupted resumes). The worktree is removed only when git agrees it is clean. The branch is
 * deleted with `-d`; a squash merge makes git say "not merged", so `-D` follows only when GitHub shows
 * a merged PR whose head is exactly the branch tip (nothing is lost). Returns { results, ok, main }.
 */
export function finishWorktree({ cwd, branch, path }) {
  const roots = checkoutRoots(cwd);
  if (!roots) return { ok: false, results: [{ level: 'FAIL', msg: 'not in a git repository' }] };
  const { main } = roots;
  const results = [];
  const add = (level, msg) => results.push({ level, msg });
  const abs = resolve(main, path);

  if (existsSync(abs)) {
    const removed = run(main, 60000, 'git', 'worktree', 'remove', path);
    if (!removed.ok) {
      add('FAIL', `git worktree remove failed: ${removed.out}; commit or discard the changes, then run it again`);
      return { results, ok: false, main };
    }
    add('ok', `worktree ${path} removed`);
  } else if (isListed(main, abs)) {
    run(main, 60000, 'git', 'worktree', 'prune');
    add('ok', `worktree ${path} was already gone; pruned`);
  } else {
    add('ok', `worktree ${path} already gone`);
  }

  if (!exists(main, `refs/heads/${branch}`)) {
    add('ok', `branch ${branch} already gone`);
    return { results, ok: true, main };
  }
  if (run(main, 15000, 'git', 'branch', '-d', branch).ok) {
    add('ok', `branch ${branch} deleted`);
    return { results, ok: true, main };
  }
  const tip = git(main, 'rev-parse', `refs/heads/${branch}`);
  const prs = prsFor(main, branch, 'merged');
  const merged = prs?.find((p) => p?.mergedAt && p.headRefOid === tip);
  if (merged && run(main, 15000, 'git', 'branch', '-D', branch).ok) {
    add('ok', `branch ${branch} deleted (PR #${merged.number} was squash-merged: git does not see it as merged, GitHub does)`);
    return { results, ok: true, main };
  }
  add('FAIL', prs
    ? `branch ${branch} is not merged and no merged PR ends at its tip (${tip?.slice(0, 7)}); it may hold commits the PR does not. Not deleted`
    : `branch ${branch} is not merged according to git, and gh did not answer, so a squash merge cannot be confirmed. Not deleted`);
  return { results, ok: false, main };
}
