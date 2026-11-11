# bcp — BANCS Claude Plugin

The **BANCS Claude Plugin** (`bcp`) packages BANCS Norway's
[Claude Code](https://code.claude.com/docs/en/overview) workflow: **automated
git-worktree handling** and a **mission system** with swappable agent workforces,
delivered as skills, slash commands, and hooks.

> **Note:** the default workforce, **Clone Force 99**, is a non-commercial *example*
> built on Star Wars / *The Bad Batch* names (Disney/Lucasfilm trademarks, all rights
> reserved) — see [DISCLAIMER.md](./DISCLAIMER.md). Prefer a clean slate? Switch to the
> bundled `neutral` workforce or your own with `/bcp:workforce`.

## Install

This repository is a single-plugin marketplace named `bancs`:

```text
/plugin marketplace add BANCS-Norway/bancs-claude-plugin
/plugin install bcp@bancs
```

## What's included

### Skills (`skills/`)

| Skill | Purpose |
| --- | --- |
| `worktree-create` | Start fresh work on an issue: derive branch, create the worktree, label the issue, assign a workforce member |
| `worktree-resume` | Resume an issue after a crash/interruption when the worktree already exists |
| `worktree-cleanup` | Tear down after a merged PR: remove worktree, delete branch, complete the mission |
| `issues` | Session entry point: sync the issue cache and shortlist what to work on next |
| `commit-guide` | Drive the commit process after a batch: type, message, version impact |
| `pr-create` | Create the PR after a push and update the issue cache + work log |
| `review` | Simplicity-lens self-review of a diff before proposing a commit |
| `setup-contribution` | Bootstrap a repo's contribution tooling |

### Commands (`commands/`)

| Command | Purpose |
| --- | --- |
| `/bcp:missions` | Report current mission status for the project (grouped by the active workforce) |
| `/bcp:missions-sync` | Sync mission timestamps from GitHub issue events |
| `/bcp:workforce` | List / switch / update the active workforce (the agent persona roster) |
| `/bcp:nudge` | Record a manual correction against a process step and repo, or report the nudges (three on a step in a repo = withered) |
| `/bcp:context` | Show the project facts bcp detected once (release, direnv, CI directory, default branch, test command, repo, PR title format, in-progress label), confirm one, correct one, or reset one |
| `/bcp:shim-review` | In the bcp repo: review the shims not checked since the last Claude Code update against their `retire-when`, and mark each one checked |

### Hooks (`hooks/hooks.json`)

A `SessionStart` hook (`scripts/session-start.mjs`) seeds the default workforce to
`~/.claude/bcp/workforce.json` on first run, so the engine always has a roster — no
manual setup, no external tools. A second `SessionStart` hook (`scripts/version-check.mjs`)
stores the Claude Code version in `~/.claude/bcp/claude-version.json` and tells you once when
it changes. In the bcp repo it also lists the shims not checked since that change, every
session until `/bcp:shim-review` marks them. Hooks are Node `.mjs` scripts that filter first and share
one payload helper; see [docs/hook-conventions.md](./docs/hook-conventions.md) before adding one.

### Workforces

The engine is **theme-agnostic**: it assigns issues to members of the *active
workforce* rather than any hardcoded roster. Bundled workforces live in
[`workforces/`](./workforces/) (`clone-force-99` is the default *example*; `neutral` is
an IP-free alternative), and `/bcp:workforce` switches between them or pulls one from any
GitHub repo. See [WORKFORCES.md](./WORKFORCES.md) for the format and how to author your own.

The mission system reads/writes globally under `~/.claude/missions/` (one roster across
all repos), so mission files carry a `**Repo:** owner/name` field to disambiguate
colliding issue numbers.

## Layout

```text
.claude-plugin/
  plugin.json          # manifest (name: "bcp")
  marketplace.json     # single-plugin marketplace (name: "bancs")
commands/              # /bcp:missions, /bcp:missions-sync, /bcp:workforce, /bcp:nudge, /bcp:context, /bcp:shim-review
skills/<name>/SKILL.md # the worktree + issue/PR workflow skills
hooks/hooks.json       # SessionStart hook (seeds the active workforce)
workforces/            # bundled workforces + index.json + schema
scripts/               # helper scripts (${CLAUDE_PLUGIN_ROOT}-relative)
WORKFORCES.md          # workforce format + authoring guide
DISCLAIMER.md          # IP / trademark notice
```

### Scripts

| Script | Purpose |
| --- | --- |
| `scripts/checklist-sync.mjs <issue> [path]` | Seed or sync a worktree's `CHECKLIST.md` into an issue body's `<!-- checklist:start/end -->` block (via `gh`). Used by `worktree-create`, `commit-guide`, `pr-create`. |
| `scripts/project-context.mjs`, `scripts/lib/project-context.mjs` | Detect and read the per-project facts (release, direnv, CI directory, default branch, test command, repo, PR title format, in-progress label) once, for every gate; see [docs/project-context.md](./docs/project-context.md). Read by the skills and `/bcp:context`. |
| `scripts/worktree-preflight.mjs`, `scripts/lib/preflight.mjs` | Checks `worktree-create` runs before it creates anything: `gh` signed in, default branch exists, branch name and path free, no open PR for the issue. |
| `scripts/session-start.mjs`, `scripts/lib/hook.mjs` | `SessionStart` hook — seeds the default workforce; shared hook payload helper |
| `scripts/validate.mjs`, `scripts/set-version.mjs`, `scripts/hooks.test.mjs` | dev/CI only (manifest and hook validation; release version sync; hook tests) |

## Development

Before adding a skill, command or hook, run the [native check](./docs/native-check.md):
if Claude Code already does it, don't build it.

```bash
npm install        # sets up git hooks via husky
npm run validate   # check the manifests, hooks and referenced paths
npm test           # validate + hook tests (`npm run test:hooks` alone)
npm run lint       # markdownlint
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(enforced by commitlint). Releases are automated with
[semantic-release](https://semantic-release.gitbook.io/): merging to `main` bumps
the version in `.claude-plugin/plugin.json`, updates `CHANGELOG.md`, and publishes a
GitHub release.

## Known follow-ups

- **Path portability:** bundled skills reference global `~/.claude/...` paths (the
  mission registry is global by design). The "move later" step removes the duplicate
  skills from `~/.claude/skills` and `~/.claude/commands` once `bcp` is installed.
- **Themed labels in reports:** `/bcp:missions` shows pretty member labels when `jq`
  is available, falling back to raw member ids otherwise. Missions always list
  correctly; only the labels degrade.

## License

[MIT](./LICENSE) © BANCS Norway. Third-party trademarks remain with their owners —
see [DISCLAIMER.md](./DISCLAIMER.md).
