# Project context

Facts about a repo that every gate needs and that do not change between gates, detected once and
read by all of them. This is [#24](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/24).
Before it, each skill hard-coded a guess (`commit-guide` assumed a VitePress site and said "triggers
a patch version bump and site deployment" in repos with neither, [#22](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/22))
or re-checked (`worktree-create` looked for `.envrc` on every run), and a wrong guess was repeated
on every run with no single place to correct it.

## The file

`~/.claude/projects/<slug>/memory/project_context.md`, indexed from `MEMORY.md`. It is per
machine and adds no file to any repo. `<slug>` is the **main** checkout's path with every
non-alphanumeric character turned into `-`, so a linked worktree reads and writes the same file as
the main checkout. The facts are one JSON block; edit them with `/bcp:context`, not by hand.

## The facts

| Fact | Values | Detected from | Re-detected when this changes |
| --- | --- | --- | --- |
| `release` | `semantic-release`, `vitepress`, `none`, `unknown` | `semantic-release` in package.json dependencies, a `release` key, or a `.releaserc*` / `release.config.*` file; `vitepress` in dependencies or a `.vitepress/` directory | those inputs (a version bump alone does not count) |
| `direnv` | `true`, `false` | `.envrc` in the repo root | whether `.envrc` exists |
| `ci_dir` | a path, or `none` | `.github/workflows`, `.gitlab-ci.yml`, `.circleci`, `azure-pipelines.yml`, `Jenkinsfile`, `.buildkite` | which of those exist |
| `default_branch` | a branch name, or `unknown` | `origin/HEAD`, else `git ls-remote --symref origin HEAD` | the origin URL and `origin/HEAD` |
| `test_command` | a command, or `unknown` | `scripts.test` in package.json (`npm`, `pnpm`, `yarn` or `bun` by lockfile), a Makefile `test:` target, `Cargo.toml`, `go.mod` | those inputs |
| `repo` | `owner/name`, or `unknown` | the origin URL, only when it is a host URL | the origin URL |
| `pr_title` | `conventional`, `unknown`, or a format you set | a commitlint config (file or `commitlint` key in package.json), or a workflow using `action-semantic-pull-request` | those inputs |
| `commit_types` | the allowed types, space separated (`feat fix docs`), or `unknown` | `type-enum` in a data commitlint config (`.commitlintrc`, `.commitlintrc.json` or the `commitlint` key in package.json); a config that extends `@commitlint/config-conventional` with no `type-enum` gets that preset's types; `scope-enum` is recorded as `scopes`. A `.js`/`.ts` config is code and is not run; YAML is not read; any other shared config is not followed. Those are `unknown` | the commitlint config files (their content) and the package.json key |
| `in_progress_label` | a label name, `none`, or `unknown` | `gh label list`: the `status: in progress` label, else the one label with "in progress" in its name | the origin URL |

`release` also records `bumps`: which commit types bump a version under that mechanism.
`semantic-release` lists its defaults (`feat` minor, `fix` and `perf` patch, `BREAKING CHANGE`
major); a `releaseRules` entry in the project's release config overrides them, and detection does
not read it. `vitepress` lists `feat` minor, `fix` and `style` patch.

`in_progress_label` asks GitHub, so only a clear single match is stored. No matching label (`none`),
several matches, or a `gh` that does not answer are shown but not stored and asked again next time,
because the label may be created later. A repo that is not on github.com has `none` settled
without asking. If a stored label is later renamed, `reset in_progress_label` detects it again.

Each entry also records what it was detected from, the date, `confirmed`, and a fingerprint (a hash
of the inputs above).

## Rules

- **Unknown is unknown.** A fact that cannot be detected is `unknown`, and a gate says so ("release
  mechanism not detected"); it never turns a guess into a fact. An unreadable `package.json` is
  `unknown`, not `none`.
- **Confirmed is never overwritten.** Detection skips a `confirmed: true` fact, and a write merges
  with what is on disk at that moment, so a confirmation that lands while another clone detects is
  kept.
- **Detected again only when the inputs change.** Reading the fingerprint is cheap; detection runs
  only on a miss, so once the file exists no gate detects again.
- **A failure that may pass is not stored.** If the remote does not answer, `default_branch` is
  shown as `unknown` and asked again next time (five seconds at most, never prompting for
  credentials). `in_progress_label` works the same way through `gh` (ten seconds at most).
- **Atomic writes.** Written to a temp file and renamed, so two clones writing at once leave one
  whole file. A file that does not parse is moved aside as `project_context.md.corrupt`, never
  overwritten.

## Reading and correcting

`/bcp:context` shows the facts; `confirm <fact>` pins the detected value, `confirm <fact> <value>`
sets yours (`release` accepts `semantic-release`, `vitepress` or `none`), `reset <fact>` forgets one.
The code is `scripts/lib/project-context.mjs`; gates call `scripts/project-context.mjs get <fact>`.

## Who reads it

| Fact | Read by |
| --- | --- |
| `release`, `commit_types` | `commit-guide` |
| `default_branch` | `worktree-create` (through the preflight), `worktree-resume`, `pr-create` |
| `direnv` | `worktree-create` |
| `in_progress_label` | `worktree-create`, `worktree-cleanup`, `issues` |
| `pr_title` | `pr-create` |
| `ci_dir`, `test_command`, `repo` | nothing yet |

Where a skill needs a fact and gets `unknown` or `none`, it says so and asks or skips; it never
falls back to a default like `main` or `status: in progress`. `scripts/skill-literals.test.mjs`
fails if a skill writes one of those literals back
([#42](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/42)).

## The preflight

`worktree-create` runs `scripts/worktree-preflight.mjs <issue> <branch> <path>` before it creates
anything. It checks that `gh` is signed in, that the default branch exists (and warns when the
local one is behind origin), that the branch name and worktree path are free, and that no open PR
already covers the issue, and it prints the ref to start from. It is a shim for what native
worktrees do not check; see `WC5b` in [native-overlap.md](native-overlap.md).

## Native check

Claude Code does not detect or store these (checked against the memory, settings, plugins and hooks
pages and the changelog up to 2.1.322, 2026-11). `/init` writes build and test commands into
`CLAUDE.md` as prose, which covers part of `test_command` but is not a record a skill can read; no
hook payload field, environment variable or setting reports the release mechanism, default branch,
repo, CI directory or direnv. So this is a `process` piece, not a shim, and needs no `retire-when`.
Not followed: the `autoMemoryDirectory` setting. The helper always uses `~/.claude/projects/<slug>/memory/`.
