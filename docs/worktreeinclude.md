# `.worktreeinclude`

A new worktree has only the tracked files. What the project needs besides them (`.env`, build output, a
shared data folder) is gitignored, so it has to be named. bcp reads `.worktreeinclude` from the repo's root for this,
the file Claude Code reads for the worktrees it creates itself. Claude Code does not reach worktrees made
with `git worktree add`, which is how bcp makes them (checked in
[#37](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/37), see [native-overlap.md](native-overlap.md), WC9), so
`scripts/worktree-start.mjs` does it.

```text
# gitignore syntax: the gitignored files to copy into every new worktree
.env
build/

## links
# link: shared
# link: data/fixtures
```

- **Above `## links`:** gitignore patterns. A file is copied when a pattern matches it **and** `.gitignore` ignores it, so a
  pattern never copies an untracked file git does not ignore, and never a tracked one (the worktree has those).
- **Under `## links`:** each `# link: <path>` becomes a symlink to that path in the main checkout, not a copy. For a
  large or shared folder that must not diverge. The path must be relative and inside the repo. To Claude Code these lines
  are comments, so the same file works for both.
- **Git hooks from an installer (husky):** link them. husky generates `.husky/_` on install, gitignores it and sets
  `core.hooksPath` to it, a path relative to the worktree. A worktree without it runs no hooks and git does not say so:
  commitlint and the pre-commit hook never fire. Under `## links`: `# link: .husky/_`. A link, not a copy, so it follows
  the main checkout when husky regenerates the folder. The hook scripts find the worktree's own tracked `.husky/*`
  from their own path. Any tool that generates ignored hook files at install time needs the same line
  ([#76](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/76)). When `core.hooksPath` is set and its folder
  is missing in the new worktree, `worktree-start` prints `warn: core.hooksPath <path> is missing in the worktree; git
  hooks will not run`. That is the cue to add the link; the run still succeeds
  ([#78](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/78)).
- **No file:** `worktree-start` prints `warn: no .worktreeinclude` and `worktree-create` asks whether to write one. An
  **empty** file means nothing is needed and silences the warning.
- **Not here:** the `node_modules` link or `npm ci` for a Node project is separate and stays; a project that wants another
  folder linked lists it under `## links`.
