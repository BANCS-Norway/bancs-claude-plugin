---
name: worktree-cleanup
description: Clean up after a PR is merged — remove the worktree, delete the branch, update issue labels, complete the mission, and remove the work log. Trigger when the user says "PR is merged", "cleanup #NNN", "merged", "let's clean up", or "it's merged".
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
kind: process
checked: 2026-11
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

Read `~/.claude/projects/{project-slug}/memory/issues/{NNN}/log.md` (fall back to the legacy
flat `memory/issue-{NNN}.md` for worktrees created before the per-issue-folder change).

Extract branch name and worktree path for the cleanup commands.

If no work log exists, derive from GitHub (`gh issue/pr view`) or ask the user.

## Verify issue and PR state

Check the issue cache first. If the cache clearly shows the issue is closed or the PR is merged — proceed without extra verification.

Only go to GitHub and raise a flag when something is **inconsistent**:

| Inconsistency | Action |
|---|---|
| Cache shows issue open + no PR, but asked to clean up | Verify on GitHub, warn user |
| Worktree exists but no matching issue in cache | Flag before proceeding |
| Asked to clean up but PR is still open | Block and flag clearly |

**Worktree missing but work log exists** = interrupted cleanup (resume mode). *Look at the worktree and the branch* tells you; when both are gone, skip to *Update issue labels*.

When verification is needed:

```bash
gh issue view {NNN} --json state,closedAt,closingPullRequests
```

If a PR exists and its state is unclear:

```bash
gh pr view {PR-number} --json state,mergedAt
```

## Look at the worktree and the branch

Ask git what is left, before asking the user anything. Read-only:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-finish.mjs" <<'ARGS'
status {NNN} {type}/{NNN}_{slug} .worktrees/{type}-{NNN}-{slug}
ARGS
```

It prints `primary:` (the primary checkout), `worktree:` and `branch:` (`present` or `gone`), `dirty:`
(only while the worktree exists) and `pr:` (what GitHub knows about the branch).

If `worktree:` and `branch:` are **both gone**, this is a **resumed cleanup**. Say so and go to
*Update issue labels*:

```
Resuming cleanup for #NNN — worktree and branch already removed. Continuing from the labels.
```

If `pr:` is not `merged`, stop and flag it: the branch has not been merged as far as GitHub knows.

## Confirm before removing

Only reached if the worktree or the branch still exists.

Before showing the prompt, audit `CHECKLIST.md` in the worktree root. Any line matching `^- \[ \]` (plain unchecked item, not `~~struck~~`) is unresolved. If any exist, surface them in the prompt — the user may want to abort cleanup, finish the items, or explicitly descope them with a comment.

```
Ready to clean up #NNN:

  Worktree: .worktrees/{type}-{NNN}-{slug}
  Branch:   {type}/{NNN}_{slug}
  ⚠️  Uncommitted changes present       ← only if `dirty:` said yes
  ⚠️  Unresolved checklist items:       ← only show if any plain - [ ] lines remain
       - {item 1}
       - {item 2}

Remove worktree and delete branch?
```

Wait for explicit confirmation before proceeding. The local `CHECKLIST.md` dies with the worktree — no
separate cleanup needed.

## Remove the worktree and the branch

One script does both, in order, and works from the primary checkout, so it does not matter that the
shell may be sitting inside the worktree. Run it as its own Bash call:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-finish.mjs" <<'ARGS'
remove {NNN} {type}/{NNN}_{slug} .worktrees/{type}-{NNN}-{slug}
ARGS
```

It prints one `ok:` or `FAIL:` line per step, `primary: <path>`, then `finish: done` or `finish: failed`.

- It removes the worktree only when git agrees it is clean, then deletes the branch with `-d`. A
  squash or rebase merge makes git call the branch "not merged"; the script then uses `-D` only when GitHub
  shows a merged PR whose head is exactly the branch tip. Nothing is lost that way.
- On `finish: failed`, show the `FAIL:` line and stop. Do not run `git worktree remove --force` or
  `git branch -D` yourself: the line says what is left and why.
- Afterwards `cd` to the `primary:` path, so the next commands do not run inside the removed worktree.

If `${CLAUDE_PLUGIN_ROOT}` is unset (not run as an installed plugin), say the script cannot run and
stop.

## Update issue labels

The label's name is the repo's, so ask for it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/project-context.mjs" <<'ARGS'
get in_progress_label
ARGS
```

If `in_progress_label:` is a name, remove it: `gh issue edit {NNN} --remove-label "{label}"`. If it
is `none` or `unknown`, remove nothing and say so; do not guess a label name.

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

Remove the whole per-issue folder — it's single-writer, so this touches nothing shared:

```bash
rm -rf ~/.claude/projects/{project-slug}/memory/issues/{NNN}
```

Also remove the legacy flat file if it exists (pre-folder worktrees):
`rm -f ~/.claude/projects/{project-slug}/memory/issue-{NNN}.md`

No `MEMORY.md` edit is needed — active work was never pointered there; the folder *was* the
index, and removing it drops the issue from the next `issues` scan.

## Confirm

```
Cleaned up #NNN. 

  ✓ Worktree removed        (or: already gone — resumed)
  ✓ Branch deleted          (or: already gone — resumed)
  ✓ Issue labels updated
  ✓ PR test plan checked off
  ✓ Work log removed
  ✓ Mission complete

Back in the main checkout. What's next?
```

The "What's next?" is an invitation for the `issues` skill to pick up naturally.
