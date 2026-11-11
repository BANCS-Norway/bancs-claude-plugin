---
name: worktree-create
description: Start fresh work on a GitHub issue — derive the branch name and type, create the git worktree, label the issue in-progress, activate the assigned clone, and create the issue work log. Trigger when the user picks an issue to work on fresh (no existing worktree), e.g. "let's do #215", "start #215", "work on #NNN".
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
kind: process
checked: 2026-11
---

# Worktree Create — Fresh Feature Start

You set up everything needed to start work on an issue cleanly. No manual steps for the user.

## Load issue context

Read the issue cache: `~/.claude/projects/{project-slug}/memory/project_issues.md`

Find the issue row. Extract:

- Issue number and title
- Labels
- Assigned member (from the cache; if none yet, assign one — see *Assign a member*)
- Any linked PR (if one exists already, flag it — work may already be in progress)

If the issue isn't in the cache, fetch it: `gh issue view {NNN} --json number,title,labels,body`

## Assign a member

The active workforce lives at `~/.claude/bcp/workforce.json` (seeded on first session;
switch it any time with `/bcp:workforce`). Read it and pick the member whose `bestFor`
best matches this issue — or use the assignment already recorded in the issue cache.

Each member has: `id` (the mission directory name), `label` (emoji + name),
`designation`, `motto`, and `style` (the working style to adopt). Hold onto the chosen
member's fields; the steps below refer to them as `{member.id}`, `{member.label}`, etc.

If the active workforce file is missing, fall back to the bundled default at
`${CLAUDE_PLUGIN_ROOT}/workforces/` (or just proceed with a single generic member
`id: agent`).

## Derive branch type from labels and issue content

Map issue labels to commit/branch type:

| Label | Branch type |
|-------|-------------|
| `feature`, `enhancement` | `feat` |
| `bug`, `fix` | `fix` |
| `docs`, `documentation` | `docs` |
| `style` | `style` |
| `ci` | `chore` |
| `chore`, tooling, config | `chore` |
| `refactor` | `refactor` |

**Override rule — `.github/` folder changes:**
If the issue involves GitHub Actions workflows, issue templates, or anything in `.github/`, always use `chore` regardless of labels. The commit scope should be `ci` (e.g. `chore(ci):`).

When multiple labels exist, prefer the most specific. If ambiguous, use `feat` for new things, `fix` for corrections.

## Derive slug from issue title

- Lowercase
- Replace spaces and special characters with hyphens
- Remove leading commit type prefix if present (e.g. `feat:`, `fix:`)
- Max 35 characters
- Example: `feat: update org number to reflect VAT registration` → `vat-org-number-registration`

## Check before creating

Run the checks with the branch and path you just derived. Run this exactly as written:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-preflight.mjs" <<'ARGS'
{NNN} {type}/{NNN}_{slug} .worktrees/{type}-{NNN}-{slug}
ARGS
```

It prints `base: <ref>`, then one `ok:`, `warn:` or `FAIL:` line per check (`gh` is signed in, the
default branch exists, the branch name and the path are free, no open PR already covers the issue),
then `preflight: passed` or `preflight: failed`.

- Show every `warn:` and `FAIL:` line to the user as it is.
- On `preflight: failed`, stop and create nothing. Each `FAIL:` line says what to do about it.
- A `warn:` does not stop the run, but say it (a local default branch behind origin means the new
  branch would start without those commits).
- `<ref>` from the `base:` line is `{base}` below. Never write a branch name there yourself.

If `${CLAUDE_PLUGIN_ROOT}` is unset (not run as an installed plugin), say that the checks and the
worktree script cannot run, and stop: creating the worktree by hand skips them.

## Confirm names before creating

Show the user what you're about to create:

```
Branch:   fix/215_vat-org-number-registration
Worktree: .worktrees/fix-215-vat-org-number-registration
Base:     {base}
Member:   {member.label}   (from the active workforce)

Create? (or suggest different names)
```

Wait for confirmation.

## Create the worktree

One script does the git work. It runs the checks again, creates the worktree from the base they
named, makes `node_modules` available (the main checkout's, linked, else a clean install) and runs
`direnv allow` where the project uses direnv. Run this exactly as written, with the names you just
confirmed:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-start.mjs" <<'ARGS'
{NNN} {type}/{NNN}_{slug} .worktrees/{type}-{NNN}-{slug}
ARGS
```

It prints `base: <ref>`, one `ok:`, `warn:` or `FAIL:` line per check or step, then `start: done`
or `start: failed`. Between the worktree and the dependencies it copies and links what the repo's
`.worktreeinclude` names.

- Show every `warn:` and `FAIL:` line as it is. A `warn:` (for example a failed `npm ci`, or direnv
  not installed) does not stop the run; say what it means for the user.
- `warn: no .worktreeinclude`: the repo names no gitignored files to copy (`.env`, build output). Ask the
  user whether the new worktree needs any: look at `git status --short --ignored` in the main checkout,
  suggest the likely ones, and write the file with them. Format and meaning:
  [docs/worktreeinclude.md](../../docs/worktreeinclude.md). An empty file is a valid answer. Copy the
  files into the worktree by hand this once, because the script has already run.
- On `start: failed`, nothing was created. Stop and report; do not run `git worktree add` yourself.
- Do not run `git worktree add`, `ln -s`, `npm ci` or `direnv allow` yourself: the script did.

Other ecosystems (yarn, pnpm, a uv venv) have no bootstrap step yet; tell the user if the project
needs one.

## Label the issue in-progress

The label's name is the repo's, so ask for it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/project-context.mjs" <<'ARGS'
get in_progress_label
ARGS
```

If `in_progress_label:` is a name, add it: `gh issue edit {NNN} --add-label "{label}"`. If it is
`none` or `unknown`, add nothing and do not make a label up: tell the user what the `from:` line
says (for example no label with "in progress" in its name, so create one and run
`/bcp:context confirm in_progress_label <name>`), and carry on.

## Start the mission

Create the mission file at `~/.claude/missions/{member.id}/current/{NNN}.md` using the member assigned to this issue:

```markdown
# Mission: Issue #{NNN} - {title}

**Member:** {member.label} {member.designation}
**Status:** In Progress
**Started:** {TODAY YYYY-MM-DD HH:MM}
**Completed:** -
**Issue:** #{NNN}
**Repo:** {owner/repo}
**Branch:** {type}/{NNN}_{slug}

## 🎯 Objective

{Brief description from issue body}

## 📋 Tasks

- [ ] {key tasks derived from issue}
- [ ] Commit changes
- [ ] Push and create PR

## 📝 Progress Notes

### {DATE} {TIME}
- Mission started
- Initial analysis completed

## 🔧 Technical Details

### Files Modified
{Will be updated as work progresses}

### Breaking Changes
- None

## ⚠️ Blockers / Issues

- None

## ✅ Completion Checklist

- [ ] All tasks completed
- [ ] Branch pushed
- [ ] PR created
- [ ] Mission file moved to `done/`

## 🎖️ Mission Notes

---

**{member.motto}**

_Mission logged by {member.label}_
```

The mission directory is the member's `id` from the active workforce (e.g. `tech`,
`crosshair`, or `analyst`/`fixer` in the neutral pack). Ensure
`~/.claude/missions/{member.id}/current/` exists before writing.

## Create the issue work log

Each issue gets its own folder — `memory/issues/{NNN}/` — holding the work log and any
per-issue memories. The folder is **single-writer** (this clone), so it never collides with
other clones, and the *set of folders* is the index of active work (no shared index file).

Create the folder and its log:

```bash
mkdir -p ~/.claude/projects/{project-slug}/memory/issues/{NNN}
```

Create `~/.claude/projects/{project-slug}/memory/issues/{NNN}/log.md`:

```markdown
# Work log — #{NNN}: {issue title}

**Issue:** [#{NNN}]({issue-url})
**Member:** {member.label}
**Branch:** {type}/{NNN}_{slug}
**Worktree:** .worktrees/{type}-{NNN}-{slug}
**Started:** {today}

## Goal
{issue body summary — key tasks and acceptance criteria}

## Decisions
<!-- architectural and approach decisions made during work -->

## Batches
<!-- updated by commit-guide after each approved batch -->

## Current State
Fresh start — no batches committed yet.

## Notes
<!-- anything worth remembering for the next session -->
```

Do **not** add a pointer to `MEMORY.md`. The folder `memory/issues/{NNN}/` is itself the index
of active work — the `issues` skill surfaces it by scanning `memory/issues/` at session start.
Keeping active-work tracking out of `MEMORY.md` means the issue skills never write that shared
file, so parallel clones never contend on it.

## Seed the local checklist

Create `CHECKLIST.md` in the worktree root. The local file is the working copy; the issue body is the published copy, synced at checkpoints.

Source items in this order:

1. If the issue body has a `<!-- checklist:start -->` / `<!-- checklist:end -->` block, copy its items verbatim.
2. Else, lift `- [ ]` items from the issue body (e.g. a `## Tasks` section).
3. Else, seed a skeleton:

   ```markdown
   # Checklist for #{NNN} — {title}

   <!-- Working copy. Synced to issue body at commit / PR / cleanup. -->

   - [ ] (add items as you plan the work)
   ```

Mark the file untracked via the worktree-local exclude (no change to the repo's `.gitignore`):

```bash
echo 'CHECKLIST.md' >> "$(git rev-parse --git-path info/exclude)"
```

If the issue body has no markers yet, seed them — run the helper, which wraps the issue
body's existing checkbox list between `<!-- checklist:start -->` and `<!-- checklist:end -->`
(and is robust against prose that merely mentions the markers). From then on, only the
marked section is touched.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/checklist-sync.mjs" {NNN}
```

## Activate the member

Adopt the assigned member's `style` (from the active workforce) for this session — e.g.
a "surgical, minimal blast radius" member makes one precise change at a time, while a
"bold, sweeping changes" member is comfortable with large refactors. Stay in character
for the duration of the session.

## Confirm ready

```
Ready. {member.label} on the job.

Branch:   fix/215_vat-org-number
Worktree: .worktrees/fix-215-vat-org-number

What would you like to tackle first?
```
