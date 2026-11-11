// Starts a worktree for an issue (#44, the shim steps of worktree-create): the preflight, `git worktree
// add` from the base it names, the dependency bootstrap and `direnv allow`. Code, not prose in a skill,
// so a skipped step is a failed run. A failed preflight creates nothing.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { git } from './repo.mjs';
import { checkoutRoots, ensure } from './project-context.mjs';
import { preflight } from './preflight.mjs';

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
