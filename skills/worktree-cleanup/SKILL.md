---
name: worktree-cleanup
description: Clean up after a PR is merged — remove the worktree, delete the branch, update issue labels, complete the mission, and remove the work log. Trigger when the user says "PR is merged", "cleanup #NNN", "merged", "let's clean up", or "it's merged".
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Worktree Cleanup — Post-Merge

You clean up everything after a PR merges. One command, full cleanup, nothing left dangling.

## Identify what to clean up

If the user specified an issue number, use it.

Otherwise check:

```bash
gh pr list --state merged --limit 5 --json number,title,headRefName,closingIssuesReferences
```

Present the most recently merged PR and ask if that's the one.

## Load the issue work log

Read `~/.claude/projects/{project-slug}/memory/issue-{NNN}.md`

Extract branch name and worktree path for the cleanup commands.

If no work log exists, derive from the issues cache or ask the user.

## Verify issue and PR state

Check the issue cache first. If the cache clearly shows the issue is closed or the PR is merged — proceed without extra verification.

Only go to GitHub and raise a flag when something is **inconsistent**:

| Inconsistency | Action |
|---|---|
| Cache shows issue open + no PR, but asked to clean up | Verify on GitHub, warn user |
| Worktree exists but no matching issue in cache | Flag before proceeding |
| Asked to clean up but PR is still open | Block and flag clearly |

**Worktree missing but work log exists** = interrupted cleanup (resume mode). Skip *Detect resume mode*, *Confirm before removing*, and *Remove the worktree*; pick up from *Delete the local branch*.

When verification is needed:

```bash
gh issue view {NNN} --json state,closedAt,closingPullRequests
```

If a PR exists and its state is unclear:

```bash
gh pr view {PR-number} --json state,mergedAt
```

## Detect resume mode

Before confirming, check if the worktree and branch still exist:

```bash
git worktree list
git branch --list {type}/{NNN}_{slug}
```

If **neither exists** — this is a **resumed cleanup**. Skip *Confirm before removing* and *Remove the worktree*. Announce to the user:

```
Resuming cleanup for #NNN — worktree and branch already removed. Continuing from *Delete the local branch*.
```

If both exist — proceed with the confirmation prompt below.

## Confirm before removing

Only reached if worktree/branch still exist.

Before showing the prompt, audit `CHECKLIST.md` in the worktree root. Any line matching `^- \[ \]` (plain unchecked item, not `~~struck~~`) is unresolved. If any exist, surface them in the prompt — the user may want to abort cleanup, finish the items, or explicitly descope them with a comment.

```
Ready to clean up #NNN:

  Worktree: .worktrees/{type}-{NNN}-{slug}
  Branch:   {type}/{NNN}_{slug}
  ⚠️  Uncommitted changes present       ← only show if dirty
  ⚠️  Unresolved checklist items:       ← only show if any plain - [ ] lines remain
       - {item 1}
       - {item 2}

Remove worktree and delete branch?
```

Wait for explicit confirmation before proceeding. The local `CHECKLIST.md` dies with the worktree in *Remove the worktree* — no separate cleanup needed.

## Remove the worktree

Run this as its own Bash call — `cd` to the main repo root first, then remove the worktree. The shell may be sitting inside the worktree being removed, which invalidates the CWD. Do NOT chain this with the next section in a single `&&` call; removing the worktree invalidates the CWD for anything that follows in the same call.

```bash
cd {main-repo-path} && git worktree remove .worktrees/{type}-{NNN}-{slug}
```

If that fails because the directory is already gone:

```bash
git worktree prune
```

## Delete the local branch

Run as a separate Bash call. The `cd` from *Remove the worktree* persists automatically.

```bash
git branch -d {type}/{NNN}_{slug}
```

If `-d` fails (not fully merged according to git), use `-D` only after confirming the PR is merged (*Verify issue and PR state* already covered this).

## Update issue labels

```bash
gh issue edit {NNN} --remove-label "status: in progress"
```

The PR closing the issue should have already closed it automatically — verify:

```bash
gh issue view {NNN} --json state
```

If still open, note it but don't close manually (let the user decide).

## Complete the mission

Check if a mission file exists:

```bash
ls ~/.claude/missions/*/current/{NNN}.md 2>/dev/null
```

If found, update it before moving:

- Set `**Completed:** {TODAY YYYY-MM-DD HH:MM}`
- Set `**Status:** Done`
- Check off all remaining `- [ ]` items in `## ✅ Completion Checklist`
- Append a final progress note:

  ```
  ### {DATE} {TIME}
  - Mission complete — PR #{PR-number} merged
  ```

Then move it to done (use the member id from the path you found above):

```bash
mv ~/.claude/missions/{member-id}/current/{NNN}.md ~/.claude/missions/{member-id}/done/{NNN}.md
```

If no mission file exists, skip silently.

## Tick off PR test plan

Read the PR body from the issue work log (PR number is in `## PR`). Check off all test plan checkboxes:

```bash
gh pr view {PR-number} --json body --jq '.body'
```

Replace `- [ ]` with `- [x]` for all items and update the PR body:

```bash
gh pr edit {PR-number} --body "$(cat <<'EOF'
{updated body}
EOF
)"
```

## Remove the issue work log

Remove `~/.claude/projects/{project-slug}/memory/issue-{NNN}.md`

Remove the pointer from `MEMORY.md`:

```
- [issue-{NNN}](issue-{NNN}.md) — Active: ...
```

## Issue cache — nothing to do

`project_issues.md` is a disposable render of GitHub state — do **not** hand-remove the row.
The PR merge already closed the issue on GitHub, so the next `issues` sync regenerates the
render without it. Hand-editing would only reintroduce the shared-write race this design removes.

## Confirm

```
Cleaned up #NNN. 

  ✓ Worktree removed        (or: already gone — resumed)
  ✓ Branch deleted          (or: already gone — resumed)
  ✓ Issue labels updated
  ✓ PR test plan checked off
  ✓ Work log removed
  ✓ Issue cache — render refreshes from GitHub on next sync
  ✓ Mission complete

Back on main. What's next?
```

The "What's next?" is an invitation for the `issues` skill to pick up naturally.
