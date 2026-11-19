// The checks behind the worktree guards (#85). Convention: docs/hook-conventions.md.
//
// A guard only protects a person running Claude Code with bcp installed; it is not team-wide
// enforcement (branch protection, a git hook or CI are). It acts only in a repo whose
// `worktree_guard` fact is `on` (docs/project-context.md), and any failure reads as "allow".
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { checkoutRoots, ensure } from './project-context.mjs';

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
