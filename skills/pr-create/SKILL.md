---
name: pr-create
description: Create the PR after the user has pushed the branch, then update the issue cache and work log. Trigger when the user says "pushed", "branch is pushed", "I pushed", or "create the PR".
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# PR Create — Branch Pushed, Open the PR

The branch is pushed. You create the PR, update the issue cache, and update the work log. The user never has to think about PR format or cache sync.

## Load context

Read the issue work log: `~/.claude/projects/{project-slug}/memory/issue-{NNN}.md`

Extract:

- Issue number and title
- Branch name
- Batches completed (for the PR body summary)
- Any decisions or notes worth including

Also read the issue from cache for labels and full description. Carefull!

## Determine PR title

The PR title follows the same conventional commit format as the commits:

```
{type}({scope}): {description}
```

Use the primary commit type from the batches. If multiple types were used across batches, use the most significant one (`feat` > `fix` > `style` > `chore`/`docs`).

## Build the PR body

```markdown
Closes #{NNN}

## Summary
{bullet points — one per batch or logical group of changes}

## Test plan
- [ ] {key things to verify}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Keep the summary tight — what changed and why, not a repeat of the commit messages.

## Show and ask for approval

Present the PR before creating it:

```
Proposed PR:

  Title: chore(ci): add social-post backfill workflow and issue template
  Branch: chore/213_social-post-template-backfill → main

  Closes #213

  Summary:
  - ...

  Test plan:
  - [ ] ...

Create PR?
```

Wait for explicit confirmation before proceeding.

## Create the PR

Always `cd` into the worktree before running `gh pr create` — the shell's working directory may have drifted to the main repo, which would cause `gh` to see the wrong branch. The worktree path is in the issue work log (`Worktree:` field) — use it.

```bash
cd {worktree-path} && gh pr create \
  --title "{title}" \
  --body "$(cat <<'EOF'
{body}
EOF
)"
```

Capture the PR URL and number from the output.

## Update the issue cache

Read `~/.claude/projects/{project-slug}/memory/project_issues.md`

Find the row for issue #{NNN} and update the `PR?` column:

```
— → [#{PR-number}]({PR-url})
```

Save the file.

## Update the issue work log

Add to `issue-{NNN}.md`:

```markdown
## PR
[#{PR-number}]({PR-url}) — opened {today}
```

Update `## Current State`:

```
PR #{PR-number} open. Waiting for review/merge.
```

## Update the mission file

Find the mission file at `~/.claude/missions/{member-id}/current/{NNN}.md` (or glob `~/.claude/missions/*/current/{NNN}.md`).

If it exists, append to the `## 📝 Progress Notes` section:

```markdown
### {DATE} {TIME}
- PR #{PR-number} opened: {PR-url}
```

And update the `## ✅ Completion Checklist`:

```
- [x] Branch pushed
- [x] PR created
```

If no mission file exists, skip silently.

## Final checklist sync

Before declaring done, ensure the issue body's checklist section matches local `CHECKLIST.md`. Same mechanism as `commit-guide` *Update the checklist and sync to GitHub* — replace the section between `<!-- checklist:start -->` / `<!-- checklist:end -->` markers and write the body back via `gh issue edit {NNN} --body-file -`.

If unchecked items remain that *should* have been done as part of this PR, flag them to the user before confirming — it's their call whether to land the PR with open items or finish them first.

## Confirm

```
PR created: #{PR-number} — {title}
{PR-url}

Issue cache updated. Ready for review.
```
