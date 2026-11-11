// Checks before a worktree is created for an issue (#42, from #1): `gh` is signed in, the default
// branch exists, and nothing already uses the branch name, the worktree path or the issue. Code, not
// prose in a skill, so a skipped check is a failed run and not a forgotten sentence.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { git } from './repo.mjs';
import { checkoutRoots, ensure } from './project-context.mjs';

/** { ok, missing, out }: `gh` run with a time limit and no prompts. */
export function gh(cwd, ...args) {
  try {
    const out = execFileSync('gh', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
    });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, missing: err.code === 'ENOENT' };
  }
}

export const exists = (top, ref) => Boolean(git(top, 'rev-parse', '--verify', '--quiet', ref));

/** Whether git lists a worktree at the absolute path `abs`, even when its folder is gone. */
export const isListed = (top, abs) => (git(top, 'worktree', 'list', '--porcelain') ?? '').split('\n').some((l) => l === `worktree ${abs}`);

/**
 * Runs every check and reports each one: { base, results: [{ level, msg }], ok }. `level` is `ok`,
 * `warn` or `FAIL`; `ok` is false when any check failed. `base` is the ref to start the branch from:
 * the local default branch, else `origin/<default>`, else null.
 */
export function preflight({ cwd, issue, branch, path }) {
  const results = [];
  const add = (level, msg) => results.push({ level, msg });
  const roots = checkoutRoots(cwd);
  if (!roots) return { base: null, results: [{ level: 'FAIL', msg: 'not in a git repository' }], ok: false };
  const { top, main } = roots;

  const auth = gh(top, 'auth', 'status');
  if (auth.ok) add('ok', 'gh is signed in');
  else add('FAIL', auth.missing ? 'gh is not installed' : 'gh is not signed in (run: gh auth login)');

  let base = null;
  const found = ensure(cwd, ['default_branch']).entries.default_branch;
  if (found.value === 'unknown') {
    add('FAIL', `default branch unknown (${found.from}); set it with /bcp:context confirm default_branch <name>`);
  } else {
    const name = found.value;
    const local = exists(top, `refs/heads/${name}`);
    const remote = exists(top, `refs/remotes/origin/${name}`);
    if (!local && !remote) {
      add('FAIL', `default branch ${name} exists neither locally nor on origin`);
    } else {
      base = local ? name : `origin/${name}`;
      add('ok', `default branch ${name}${local ? '' : ' (origin only; the branch will start from origin/' + name + ')'}`);
      const behind = local && remote ? Number(git(top, 'rev-list', '--count', `${name}..origin/${name}`)) : 0;
      if (behind > 0) {
        add('warn', `local ${name} is ${behind} commit${behind === 1 ? '' : 's'} behind origin/${name} (as of the last fetch); pull it first or the new branch starts without them`);
      }
    }
  }

  if (exists(top, `refs/heads/${branch}`)) add('FAIL', `branch ${branch} already exists locally`);
  else if (exists(top, `refs/remotes/origin/${branch}`)) add('FAIL', `branch ${branch} already exists on origin`);
  else add('ok', `branch ${branch} is free (as of the last fetch)`);

  const abs = resolve(main, path);
  if (existsSync(abs) || isListed(top, abs)) add('FAIL', `${path} already exists or is already a worktree`);
  else add('ok', `${path} is free`);

  if (!auth.ok) {
    add('warn', `open PRs for #${issue} not checked: gh is not usable`);
  } else {
    const prs = gh(top, 'pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,headRefName,closingIssuesReferences');
    let list;
    try {
      list = JSON.parse(prs.out);
    } catch {
      // handled below
    }
    if (!Array.isArray(list)) {
      add('warn', `open PRs for #${issue} not checked: gh did not answer`);
    } else {
      const own = list.find((pr) => pr?.closingIssuesReferences?.some?.((r) => r?.number === issue)
        || new RegExp(`^[a-z]+/${issue}_`).test(pr?.headRefName ?? ''));
      if (own) add('FAIL', `PR #${own.number} (${own.headRefName}) is already open for #${issue}`);
      else add('ok', `no open PR for #${issue}`);
    }
  }

  return { base, results, ok: !results.some((r) => r.level === 'FAIL') };
}
