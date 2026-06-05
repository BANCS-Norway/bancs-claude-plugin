---
name: worktree-resume
description: Resume work on an issue after a crash, tool switch, or interrupted session. The worktree already exists. Trigger when the user says "let's continue #NNN", "resume #NNN", "pick up #NNN", "continue working on #NNN", or "I want to get back to #NNN".
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Worktree Resume — Crash or Switch Recovery

You orient Claude and the user quickly after an interrupted session. The worktree exists, work was in progress — you reconstruct the state and reactivate the right workforce member without making the user explain where things were.

## Load the issue work log

Read `~/.claude/projects/{project-slug}/memory/issues/{NNN}/log.md`, or — if that doesn't
exist — the legacy flat `~/.claude/projects/{project-slug}/memory/issue-{NNN}.md` (worktrees
created before the per-issue-folder change). This is a pure read: don't move or rewrite the
file here. The legacy flat file is removed at teardown by `worktree-cleanup`.

Extract:

- Goal (what we set out to do)
- Member assignment (the `**Member:**` line)
- Batches completed so far
- Current state / notes from last session
- Branch and worktree paths

If the work log doesn't exist, skip to *Check the worktree state* and reconstruct from git.

## Check the worktree state

Run these in parallel:

```bash
# What branch, any uncommitted changes?
git -C .worktrees/{path} status

# What commits exist since main?
git -C .worktrees/{path} log --oneline main..HEAD

# What files differ from main?
git -C .worktrees/{path} diff --stat main

# Any stash?
git -C .worktrees/{path} stash list
```

## Check GitHub for changes since last session

```bash
# Any new comments or label changes on the issue?
gh issue view {NNN} --json comments,labels,state
```

Note if:

- Issue was closed while you were away (shouldn't start work)
- New comments from collaborators with instructions or feedback
- Labels changed (e.g. blocked)

## Reconcile the checklist

Compare local `CHECKLIST.md` (working copy) with the issue body's section between `<!-- checklist:start -->` and `<!-- checklist:end -->` (published copy).

```bash
gh issue view {NNN} --json body --jq '.body'
```

Three cases:

- **Identical** → nothing to do.
- **Local has more checks / different items than remote** → expected (you ticked things last session that didn't get pushed). Plan to flush local → issue body at the next commit/PR checkpoint.
- **Remote diverges from local in unexpected ways** (someone else edited the issue, or items added/removed remotely) → show the diff to the user and ask which side wins. Do not silently overwrite either.

If `CHECKLIST.md` is missing but the worktree is otherwise valid, regenerate it from the issue body's checklist section (same logic as `worktree-create` *Seed the local checklist*).

## Activate the member

Read the member assignment from the work log (or issues cache as fallback), look the
member up in the active workforce (`~/.claude/bcp/workforce.json`), and adopt their
`style` for this session — same as `worktree-create` *Activate the member*.

## Brief the user

Give a concise orientation. Example:

```
Resuming #215 with 🔧 Tech.

Last session: Identified two files to change — Footer.vue line 24 and contact.md line 40.

Git state:
  • 0 commits since main
  • 2 uncommitted changes (Footer.vue, docs/contact.md)

Issue: No new activity on GitHub.

Ready to continue — want to review the uncommitted changes first?
```

If there are uncommitted changes, offer to show them before continuing.
If the git state looks messy (conflicts, detached HEAD, etc.), flag it clearly before proceeding.

## Update the work log

Update the `Current State` section of **the work log you loaded above** (the new
`memory/issues/{NNN}/log.md`, or the legacy flat file if that's what existed) to reflect what
was found — write back to the same file, don't split it across both locations:

```markdown
## Current State
Resumed {today}. {X} uncommitted changes, {Y} commits ahead of main.
{Any notable observations from the git state}
```
