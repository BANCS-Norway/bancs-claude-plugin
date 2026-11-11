// Helpers for the tests that run the worktree scripts on real temporary repos (#42, #44): a work repo
// whose origin is a local bare repo, and a fake `gh` on PATH so nothing touches the network.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

export const tmp = () => mkdtempSync(join(tmpdir(), 'bcp-test-'));
export const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};
export const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A fake `gh`: `auth status` fails when FAKE_GH_AUTH=0, `pr list` prints FAKE_GH_PRS (fails when FAKE_GH_FAIL). */
function fakeGhDir() {
  const dir = tmp();
  const bin = join(dir, 'gh');
  writeFileSync(bin, `#!${process.execPath}
const [a] = process.argv.slice(2);
if (a === 'auth') process.exit(process.env.FAKE_GH_AUTH === '0' ? 1 : 0);
if (a === 'pr') {
  if (process.env.FAKE_GH_FAIL) process.exit(1);
  process.stdout.write(process.env.FAKE_GH_PRS ?? '[]');
}
`);
  chmodSync(bin, 0o755);
  return dir;
}
const GH_DIR = fakeGhDir();
export const PATH_WITH_GH = `${GH_DIR}${delimiter}${process.env.PATH}`;

/** A command that records its arguments in `<dir>/<name>.log` and exits `code`; `dir` goes on PATH. */
export function fakeCommand(name, { dir = tmp(), code = 0 } = {}) {
  const bin = join(dir, name);
  writeFileSync(bin, `#!${process.execPath}
require('node:fs').appendFileSync(${JSON.stringify(join(dir, `${name}.log`))}, process.argv.slice(2).join(' ') + ' @ ' + process.cwd() + '\\n');
process.exit(${code});
`);
  chmodSync(bin, 0o755);
  return dir;
}

/** PATH with git and node but no gh at all. */
export function pathWithoutGh() {
  const dir = tmp();
  symlinkSync(execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), join(dir, 'git'));
  return `${dir}${delimiter}${dirname(process.execPath)}`;
}

/** PATH with git, the fake gh and node, and nothing else: no direnv, no npm. */
export function pathWithGitAndGhOnly() {
  const dir = tmp();
  symlinkSync(execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), join(dir, 'git'));
  return `${dir}${delimiter}${GH_DIR}${delimiter}${dirname(process.execPath)}`;
}

/**
 * A work repo on `main` whose origin is a local bare repo with `main` pushed and origin/HEAD set, so
 * the default branch is known offline. `files` maps path to text, committed on `main`. Returns { dir, bare }.
 */
export function repoWithOrigin(files = {}) {
  const bare = tmp();
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const dir = tmp();
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.txt'), 'a');
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  git(dir, 'remote', 'add', 'origin', bare);
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'fetch', '-q', 'origin');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  return { dir, bare };
}
