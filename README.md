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

### Hooks (`hooks/hooks.json`)

A `SessionStart` hook (`scripts/session-start.sh`) seeds the default workforce to
`~/.claude/bcp/workforce.json` on first run, so the engine always has a roster — no
manual setup, no external tools.

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
commands/              # /bcp:missions, /bcp:missions-sync, /bcp:workforce
skills/<name>/SKILL.md # the worktree + issue/PR workflow skills
hooks/hooks.json       # SessionStart hook (seeds the active workforce)
workforces/            # bundled workforces + index.json + schema
scripts/               # helper scripts (${CLAUDE_PLUGIN_ROOT}-relative)
WORKFORCES.md          # workforce format + authoring guide
DISCLAIMER.md          # IP / trademark notice
```

## Development

```bash
npm install        # sets up git hooks via husky
npm run validate   # check the manifests and referenced paths
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
