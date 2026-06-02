---
name: worktree-create
description: Start fresh work on a GitHub issue — derive the branch name and type, create the git worktree, label the issue in-progress, activate the assigned clone, and create the issue work log. Trigger when the user picks an issue to work on fresh (no existing worktree), e.g. "let's do #215", "start #215", "work on #NNN".
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
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

## Confirm names before creating

Show the user what you're about to create:

```
Branch:   fix/215_vat-org-number-registration
Worktree: .worktrees/fix-215-vat-org-number-registration
Member:   {member.label}   (from the active workforce)

Create? (or suggest different names)
```

Wait for confirmation.

## Create the worktree

```bash
git worktree add .worktrees/{type}-{NNN}-{slug} -b {type}/{NNN}_{slug} main
```

Example:

```bash
git worktree add .worktrees/fix-215-vat-org-number -b fix/215_vat-org-number main
```

## Trust direnv in the new worktree (if applicable)

If the project uses direnv (root `.envrc` exists), run `direnv allow` inside the new worktree before any subsequent step that might shell out to `uv` / `npm` / other project-scoped commands. direnv's trust record is per-filesystem-path, so a fresh worktree is untrusted even though the parent `.envrc` was approved at the main checkout. Without this, env-var exports (e.g. `UV_PROJECT_ENVIRONMENT` pointing at a shared venv) are silently dropped and downstream tools fall back to per-worktree state.

```bash
if [ -f .envrc ] && command -v direnv >/dev/null 2>&1; then
  (cd .worktrees/{type}-{NNN}-{slug} && direnv allow)
fi
```

Skip silently if direnv is not installed or `.envrc` is absent.

## Bootstrap dependencies in the new worktree (if applicable)

A fresh worktree has no installed dependencies, so git hooks (husky / lint-staged) and
project scripts won't run until they're available. For a **Node** project with a
`package.json` and a lockfile, make `node_modules` available: symlink the main checkout's
if it exists
(instant, and correct when the branch's deps match `main` — the common case), otherwise
run a clean install. Then exclude it worktree-locally so it's never committed — the
`node_modules/` `.gitignore` pattern does **not** match a symlink.

```bash
WT=.worktrees/{type}-{NNN}-{slug}
if [ -f "$WT/package.json" ] && [ -f "$WT/package-lock.json" ]; then
  if [ ! -e "$WT/node_modules" ]; then
    if [ -d node_modules ]; then
      ln -s ../../node_modules "$WT/node_modules"   # share the main checkout's install
    else
      (cd "$WT" && npm ci)                          # nothing to borrow — clean install
    fi
  fi
  # never commit node_modules from the worktree (a symlink isn't matched by `node_modules/`)
  ( cd "$WT" && excl="$(git rev-parse --git-path info/exclude)" \
    && { grep -qxF 'node_modules' "$excl" 2>/dev/null || echo 'node_modules' >> "$excl"; } )
fi
```

Skip silently if there's no `package.json` + lockfile. Other ecosystems: the direnv step
above covers shared-env setups (e.g. a uv venv); extend this step for yarn/pnpm or
non-Node tooling as needed.

## Label the issue in-progress

```bash
gh issue edit {NNN} --add-label "status: in progress"
```

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

Create `~/.claude/projects/{project-slug}/memory/issue-{NNN}.md`:

```markdown
---
name: issue-{NNN}
type: project
description: Active work log for #NNN — {issue title}
---

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

Also add a pointer to `MEMORY.md`:

```
- [issue-{NNN}](issue-{NNN}.md) — Active: {issue title}
```

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

If the issue body has no markers yet, edit it once to wrap the existing/derived checklist between `<!-- checklist:start -->` and `<!-- checklist:end -->`. From now on, only the section between markers is touched.

```bash
gh issue edit {NNN} --body-file -   # body contents on stdin
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
