// The check behind the PreToolUse `git -C` guard (#87). Convention: docs/hook-conventions.md.
//
// `git -C <dir> <subcommand>` runs git in another directory and gets past the permission rules and
// hook filters written for plain `git <subcommand>`. The guard refuses every use, whatever the subcommand.
import { codeOf, gitCommandPattern } from './shell-command.mjs';

// `git` in command position (shell-command.mjs), then its global options, then `-C`. Anchoring on
// the command word is what keeps `git log -C` and `git grep -C 3` (options of a subcommand) and
// `echo git -C` (an argument) from matching.
const GIT_C = gitCommandPattern(String.raw`-C(?=\s|$)`);

/** True when the command runs `git -C`. Only what the shell runs counts (shell-command.mjs): a commit message, PR body or heredoc that mentions it does not. */
export function usesGitC(command) {
  return typeof command === 'string' && GIT_C.test(codeOf(command));
}

export const REASON = [
  'bcp git -C guard: `git -C <dir> ...` runs git in another directory and gets past the permission rules and hook checks written for plain `git`.',
  'Run `cd <dir>` first, then plain `git <subcommand>`, as two steps or `cd <dir> && git <subcommand>`.',
].join('\n\n');
