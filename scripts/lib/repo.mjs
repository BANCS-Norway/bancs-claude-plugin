// Which repo a working directory belongs to. Shared by the Stop hook and /nudge.
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

export const git = (cwd, ...args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
};

// `repo` is `owner/name` from the origin remote (any host), else the folder name. `onGitHub` is true
// only when that remote is on github.com: `gh` talks to github.com, so a GitLab or self-hosted
// `acme/app` must never be handed to it, or the comment would land on an unrelated GitHub repo.
export function repoOf(cwd) {
  if (!cwd) return { repo: null, onGitHub: false };
  const remote = git(cwd, 'remote', 'get-url', 'origin');
  const m = remote && /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (m) return { repo: m[1], onGitHub: /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?github\.com[:/]/i.test(remote) };
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  return { repo: top ? basename(top) : null, onGitHub: false };
}
