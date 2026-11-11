// The checks behind the PreToolUse commit guard (#45). Convention: docs/hook-conventions.md.
//
// `checkCommit` looks at the repo a `git commit` is about to run in and returns what blocks the
// commit and what only deserves a warning. Every message names the way out. Nothing here talks to
// the network or writes anything, and a git call that fails reads as "nothing to report".
import { execFileSync } from 'node:child_process';

export const LARGE_FILE_BYTES = 1024 * 1024;

// `git` as a command word (start of the command, or after ; & | ( ), then global options, then
// `commit`. `git -C <dir> commit` is left out on purpose: the hook cannot tell which repo that is.
const COMMIT = /(?:^|[;&|(]\s*)(?:\w+=\S+\s+)*git\s+(?:(?:-c\s+\S+|--[\w-]+(?:=\S+)?)\s+)*commit(?=\s|$)/;

// Quoted text is dropped first: a commit message that says "-h" or "; git commit" is not a flag or a command.
export function isCommitCommand(command) {
  const bare = command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
  return COMMIT.test(bare) && !/\s--help\b|\s-h\b/.test(bare);
}

const run = (cwd, args, input) => {
  try {
    return execFileSync('git', args, { cwd, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
};

function defaultBranch(cwd) {
  const head = run(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])?.trim();
  return head ? [head.replace(/^origin\//, '')] : ['main', 'master']; // offline: no ls-remote in a hook
}

const SECRET_NAMES = [
  /(?:^|\/)\.env(?:\.(?!example$|sample$|template$)[^/]*)?$/,
  /\.(?:pem|key)$/,
  /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$/,
];
const SECRET_CONTENT = [
  ['an AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['a private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['a GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['an API secret key (sk-...)', /\bsk-[A-Za-z0-9_-]{32,}/],
];
const STRAY = [/(?:^|\/)CHECKLIST\.md$/, /(?:^|\/)\.DS_Store$/, /(?:^|\/)(?:node_modules|\.worktrees)\//, /\.log$/];

const list = (files) => files.map((f) => `  ${f}`).join('\n');

/** Secrets by content: [{ file, kind }] from the lines this commit adds. */
function secretsInDiff(diff) {
  const found = [];
  let file;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.startsWith('+++ b/') ? line.slice(6) : undefined;
    else if (line.startsWith('+') && file) {
      for (const [kind, re] of SECRET_CONTENT) {
        if (re.test(line) && !found.some((f) => f.file === file && f.kind === kind)) found.push({ file, kind });
      }
    }
  }
  return found;
}

/** Sizes in bytes of the staged versions of `files`, from `git cat-file --batch-check`. */
function stagedSizes(cwd, files) {
  const out = run(cwd, ['cat-file', '--batch-check=%(objectsize)'], files.map((f) => `:${f}`).join('\n') + '\n');
  const sizes = out?.trim().split('\n') ?? [];
  return files.map((file, i) => ({ file, size: Number(sizes[i]) })).filter((f) => Number.isFinite(f.size));
}

/**
 * @returns {{ blocks: string[], warns: string[] }} one entry per problem, each with its recovery action.
 * `env` supplies the BCP_ALLOW_* switches.
 */
export function checkCommit(cwd, env = {}) {
  const blocks = [];
  const warns = [];
  if (run(cwd, ['rev-parse', '--git-dir']) === undefined) return { blocks, warns };

  const branch = run(cwd, ['symbolic-ref', '--short', '-q', 'HEAD'])?.trim();
  const hasCommits = run(cwd, ['rev-parse', '--verify', '-q', 'HEAD']) !== undefined;
  if (env.BCP_ALLOW_DEFAULT_BRANCH_COMMIT !== '1' && hasCommits && branch && defaultBranch(cwd).includes(branch)) {
    blocks.push(`Refusing to commit on the default branch '${branch}'. Start the work on its own branch: run the worktree-create skill, or \`git switch -c <type>/<issue>_<slug>\`. To commit here anyway, set BCP_ALLOW_DEFAULT_BRANCH_COMMIT=1.`);
  }

  const staged = (run(cwd, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])?.split('\0') ?? []).filter(Boolean);
  if (!staged.length) return { blocks, warns };

  if (env.BCP_ALLOW_SECRET_COMMIT !== '1') {
    const byName = staged.filter((f) => SECRET_NAMES.some((re) => re.test(f)));
    const byContent = secretsInDiff(run(cwd, ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff']) ?? '').filter((s) => !byName.includes(s.file));
    if (byName.length || byContent.length) {
      const lines = [...byName.map((f) => `  ${f} (a file that holds secrets)`), ...byContent.map((s) => `  ${s.file} (looks like ${s.kind})`)];
      const files = [...byName, ...byContent.map((s) => s.file)].join(' ');
      blocks.push(`Staged files look like secrets:\n${lines.join('\n')}\nUnstage them with \`git restore --staged ${files}\`, add them to .gitignore, and rotate anything that was real. If this is a false alarm, set BCP_ALLOW_SECRET_COMMIT=1.`);
    }
  }

  if (env.BCP_ALLOW_LARGE_FILE_COMMIT !== '1') {
    const big = stagedSizes(cwd, staged).filter((f) => f.size > LARGE_FILE_BYTES);
    if (big.length) {
      blocks.push(`Staged files over ${LARGE_FILE_BYTES / 1024 / 1024} MB:\n${big.map((f) => `  ${f.file} (${(f.size / 1024 / 1024).toFixed(1)} MB)`).join('\n')}\nUnstage them with \`git restore --staged ${big.map((f) => f.file).join(' ')}\`, or track them with Git LFS. To commit them anyway, set BCP_ALLOW_LARGE_FILE_COMMIT=1.`);
    }
  }

  const stray = staged.filter((f) => STRAY.some((re) => re.test(f)));
  if (stray.length) {
    warns.push(`Staged files that usually do not belong in a commit:\n${list(stray)}\nIf they are stray, unstage them with \`git restore --staged ${stray.join(' ')}\`.`);
  }
  return { blocks, warns };
}
