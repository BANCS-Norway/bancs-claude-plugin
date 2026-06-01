---
name: setup-contribution
description: Set up the open-source contribution workflow memory for the current repo — fetches upstream issues and PRs, creates memory files for issue tracking, PR tracking, and worktree management.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
argument-hint: [upstream-repo (optional, e.g. owner/repo)]
---

Set up the contribution workflow memory for the current repository. Follow every step exactly.

## Step 1 — Detect upstream repo

If $ARGUMENTS is provided, use it as the upstream repo (format: `owner/repo`).

Otherwise detect it automatically:

1. Run `git remote -v` to list remotes
2. If there is an `upstream` remote, extract the `owner/repo` from it
3. If not, run `gh repo view --json parent --jq '.parent | "\(.owner.login)/\(.name)"'` to get the parent of the fork
4. If that returns nothing, ask the user to provide the upstream repo as an argument: `/setup-contribution owner/repo`

Store the result as UPSTREAM_REPO.

## Step 2 — Detect our GitHub identity

Run these in parallel:

- `gh api user --jq .login` → our GitHub username (GITHUB_USER)
- `git remote get-url origin` → extract the owner/org from the origin URL (FORK_OWNER)

FORK_OWNER is the org or user in the origin remote URL (e.g. `git@github.com:BANCS-Norway/repo.git` → `BANCS-Norway`).

## Step 3 — Fetch open PRs

Run: `gh pr list --repo $UPSTREAM_REPO --state open --json number,title,headRefName,url --limit 100`

Filter to PRs whose `headRefName` matches branches that exist in our local worktrees, OR whose head ref contains FORK_OWNER.

If the upstream uses the fork+branch model, also try:
`gh pr list --repo $UPSTREAM_REPO --state open --author $GITHUB_USER --json number,title,headRefName,url --limit 100`

Combine results, deduplicate by PR number. These are our open PRs.

## Step 4 — List local worktrees

Run: `git worktree list`

Extract branch names for all non-master/main worktrees. These map to our open PRs.
Match each worktree branch to a PR by headRefName. Note any worktrees without a matching PR (stale) and any PRs without a matching worktree (missing).

## Step 5 — Fetch open issues

Run: `gh issue list --repo $UPSTREAM_REPO --state open --json number,title,updatedAt,author,labels --limit 100`

For each issue:

- Note if `author.login == GITHUB_USER` (opened by us)
- Note labels (bug, enhancement, help wanted, blocked, need more info, etc.)
- Note `updatedAt`

## Step 6 — Assess issues

Categorise each open issue:

- **Has PR open** — already being addressed (reference our PR number)
- **Actionable, no PR** — bug or feature that looks implementable; note effort (low/medium/high) and which source file is likely affected based on the title/labels
- **Opened by us** — note explicitly instead of calling it "well-scoped"
- **Stale/question/blocked** — collapse into a skip list

## Step 7 — Determine memory directory

The memory directory path is: `~/.claude/projects/<escaped-working-dir>/memory/`

The escaped working dir is the absolute path of the repo with `/` replaced by `-` (e.g. `/home/user/github/myrepo` → `-home-user-github-myrepo`).

Run `pwd` to get the current working directory, then construct the path.

Check if the memory directory already exists. If it does, read the existing MEMORY.md and merge rather than overwrite — preserve existing feedback and reference entries.

## Step 8 — Write memory files

Create or update the following files. Use today's date (from `date +%Y-%m-%d`) as the sync date.

### `memory/project_open_prs.md`

```markdown
---
name: project_open_prs
description: Map of our open PRs to their worktrees — update when PRs are created or merged
type: project
---

Active PRs (ours, on $UPSTREAM_REPO):

| PR | Issue | Branch / Worktree | Title |
|----|-------|-------------------|-------|
[one row per open PR — include issue number if derivable from branch name pattern like fix-NNN-* or feat-NNN-*]

**Cleanup workflow:** When a PR is merged into master, delete its worktree (`git worktree remove .worktrees/<branch>`) and remove it from this table.

**Stale worktrees (no matching PR):** [list if any]
```

### `memory/project_issues.md`

```markdown
---
name: project_issues
description: Open issues on $UPSTREAM_REPO — last synced <DATE>, scan for updates with the command below
type: project
---

**Last synced:** <DATE>
**Sync command:** `gh issue list --repo $UPSTREAM_REPO --state open --json number,title,updatedAt,author,labels --limit 100`
**New activity since last sync:** `gh issue list --repo $UPSTREAM_REPO --state open --json number,title,updatedAt --limit 100 | jq '[.[] | select(.updatedAt > "<DATE>")]'`

---

## Actionable issues — no PR yet

| # | Updated | Assessment |
|---|---------|------------|
[one row per actionable issue, ordered by updatedAt descending]

## Issues covered by our open PRs

| # | PR | Notes |
|---|----|-------|
[one row per issue that has a corresponding open PR]

## Stale / questions / blocked / not actionable
[comma-separated list of issue numbers]
```

### `memory/MEMORY.md`

Write (or merge into existing) MEMORY.md with this structure. Keep it under 200 lines.

```markdown
# Memory

## Open PRs (last synced <DATE>)
Cleanup: when merged → `git worktree remove .worktrees/<branch>` + remove row.
PR command: `gh pr create --repo $UPSTREAM_REPO --head "$FORK_OWNER:<branch>"`

| PR | Issue | Branch / Worktree | Title |
|----|-------|-------------------|-------|
[inline copy of open PRs table — same as project_open_prs.md]

## Open Issues — actionable, no PR yet (last synced <DATE>)
Sync: `gh issue list --repo $UPSTREAM_REPO --state open --json number,title,updatedAt,author,labels --limit 100`

| # | Updated | Assessment |
|---|---------|------------|
[inline copy of actionable issues — same as project_issues.md]

Full issue detail: [project_issues.md](project_issues.md)

## Workflow conventions
- Worktree naming: `{type}-{issue-number}-{issue-name}` (e.g. `fix-653-iam-role-path`)
- Create from repo root: `git worktree add .worktrees/{name} -b {name} && cd .worktrees/{name} && npm install --legacy-peer-deps`
- Never run `git push` — user handles all pushes
- PRs: `gh pr create --repo $UPSTREAM_REPO --head "$FORK_OWNER:<branch>"`
- Write failing test first, then implement

## To report
[preserve any existing entries, or leave empty]

## Feedback
[preserve any existing entries]
```

## Step 9 — Report to user

Print a concise summary:

- Upstream repo detected
- Number of open PRs found (ours)
- Number of actionable issues (no PR yet)
- Number of stale worktrees (if any)
- Memory directory path
- Any issues that need attention (e.g. worktrees with no PR, or vice versa)
