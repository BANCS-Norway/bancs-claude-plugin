// The checks behind the worktree guards (#85). Convention: docs/hook-conventions.md.
//
// A guard only protects a person running Claude Code with bcp installed; it is not team-wide
// enforcement (branch protection, a git hook or CI are). It acts only in a repo whose
// `worktree_guard` fact is `on` (docs/project-context.md), and any failure reads as "allow".
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { checkoutRoots, ensure } from './project-context.mjs';
import { codeOf, ghCommandPattern } from './shell-command.mjs';

/**
 * `file` with its nearest existing directory resolved through symlinks, so a file that is not written
 * yet still has a repo: { dir, path }, the real directory and the real path of the file. Null if none.
 */
function locate(file) {
  let dir = dirname(file);
  while (!existsSync(dir)) {
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  try {
    const real = realpathSync(dir);
    return { dir: real, path: resolve(real, relative(dir, file)) };
  } catch {
    return null;
  }
}

/** Is the `worktree_guard` fact `on` for the repo `dir` is in? False outside a repo and on any failure. */
export function guardOn(dir) {
  try {
    return ensure(dir, ['worktree_guard'])?.entries.worktree_guard?.value === 'on';
  } catch {
    return false;
  }
}

/**
 * Edits in the main checkout. `file` is the path the tool call targets (relative to `cwd` when it is
 * not absolute). Returns the reason to deny it, or null to allow.
 *
 * The repo is the file's own, not the shell's directory: a session that sits in a worktree is still
 * denied an edit of a file in the main checkout, and one that sits anywhere is allowed an edit
 * outside every repo. A file in a linked worktree has that worktree as its git root, so only a file
 * whose root is the main checkout is judged, and `.worktrees/` and `.claude/` there are allowed.
 */
export function checkEdit(file, cwd) {
  const abs = resolve(cwd, file);
  const at = locate(abs);
  if (!at) return null;
  const { dir } = at;
  const roots = checkoutRoots(dir);
  if (!roots || roots.top !== roots.main) return null; // not in a repo, or in a linked worktree
  const rel = relative(roots.main, at.path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null; // outside the repo
  const [first] = rel.split(sep);
  if (first === '.worktrees' || first === '.claude') return null;
  if (!guardOn(dir)) return null;
  return `Refusing to edit ${rel} in the main checkout (${roots.main}). Do the work in a worktree: run the worktree-create skill, or resume one with worktree-resume, then edit the file there. To stop this guard in this repo, run /bcp:context confirm worktree_guard off.`;
}

// ---- the PR guard -----------------------------------------------------------------------------

const PR_CREATE = ghCommandPattern(String.raw`pr\s+create(?=\s|$)`);

/** Is this command a `gh pr create`? Only what the shell runs counts (shell-command.mjs): a PR body or heredoc that mentions it does not. */
export function isPrCreate(command) {
  const bare = codeOf(command);
  return PR_CREATE.test(bare) && !/\s--help\b|\s-h\b/.test(bare);
}

// A `cd <dir>` ahead of the PR command. The skills run `cd <worktree> && gh pr create`, so the branch
// to judge is the one in that directory, not the one the shell happens to be in.
const CD_TARGET = /(?:^|[;&|(\n])[ \t]*cd[ \t]+(?:"([^"\n]*)"|'([^'\n]*)'|([^\s;&|()<>"'$`\\]+))[ \t]*(?:&&|;|\n)/g;

/**
 * The directory the PR command runs in: `cwd`, or the last `cd` target before it. Null when that
 * cannot be told (a target built from a variable or a command, or one that does not exist), because
 * a guard that cannot tell does not judge.
 */
export function prDirectory(command, cwd) {
  let dir = cwd;
  const code = codeOf(command);
  if (/(?:^|[;&|(\n])[ \t]*cd\b/.test(code.slice(0, Math.max(code.search(PR_CREATE), 0)))) {
    // the raw text is needed for the path (codeOf blanks quotes); only the part before the last mention of the command
    const mentions = [...command.matchAll(/\bgh\s+pr\s+create\b/g)];
    const before = mentions.length ? command.slice(0, mentions.at(-1).index) : command;
    let target = null;
    for (const m of before.matchAll(CD_TARGET)) target = m[1] ?? m[2] ?? m[3];
    if (target === null || /[$`]/.test(target)) return null;
    dir = resolve(cwd, target === '~' ? homedir() : target.startsWith('~/') ? join(homedir(), target.slice(2)) : target);
  }
  try {
    return statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

const git = (cwd, ...args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
};

/**
 * `gh pr create` before the push. Returns the reason to deny it, or null to allow: the branch must have
 * an upstream and no commits the upstream lacks. Local refs only (no network), so it sees the last
 * fetch or push. Detached HEAD, a repo with the guard off and anything unreadable are allowed.
 */
export function checkPr(command, cwd) {
  const dir = prDirectory(command, cwd);
  if (!dir || git(dir, 'rev-parse', '--git-dir') === undefined) return null;
  if (!guardOn(dir)) return null;
  const branch = git(dir, 'symbolic-ref', '--short', '-q', 'HEAD');
  if (!branch) return null;
  const way = 'The human pushes the branch: ask them to push it, wait for "pushed", then create the PR. To stop this guard in this repo, run /bcp:context confirm worktree_guard off.';
  if (git(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}') === undefined) {
    return `Refusing to create a PR: branch '${branch}' has no upstream, so it has not been pushed. ${way}`;
  }
  const ahead = Number(git(dir, 'rev-list', '--count', '@{u}..HEAD'));
  if (ahead > 0) {
    return `Refusing to create a PR: branch '${branch}' has ${ahead} commit${ahead === 1 ? '' : 's'} its upstream lacks, so the push is not complete. ${way}`;
  }
  return null;
}
