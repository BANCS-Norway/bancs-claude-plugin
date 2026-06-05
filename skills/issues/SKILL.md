---
name: issues
description: Session entry point — sync the open GitHub issue cache and present an opinionated shortlist of what to work on next. Auto-trigger at the start of a session with no active issue context, or when the user asks "what should we work on", "what's next", "let's start", or similar.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Issue Cache — Sync, Assess, and Recommend

You are the entry point for every coding session. Your job is not just to sync issues — it's to read the project state, understand what makes sense to work on next, and present an opinionated shortlist so the user can simply pick one and the session begins.

## Step 1 — Determine project slug and memory path

From the current working directory, derive the project slug: replace `/` with `-`, strip leading `/`.

Memory path: `~/.claude/projects/{project-slug}/memory/`
Cache file: `{memory-path}/project_issues.md`

## Step 2 — Regenerate the cache (it is a render, not a database)

`project_issues.md` is a **disposable render of GitHub state**, not a store. GitHub is the
source of truth (issue open/closed, the `status: in progress` label, linked PRs). Every sync
**regenerates the whole file from `gh`** — it is never hand-merged row-by-row.

This is what makes concurrent clone sessions safe: there is no shared mutable cache to race
over. If two clones regenerate at once they each rebuild the same render from the same source,
so a lost update is a non-event — the next render is correct regardless.

Read the existing `project_issues.md` and check `Last synced` date.

**If stale (not today) — rebuild wholesale:**

- Fetch open issues (one call): `gh issue list --repo {owner}/{repo} --state open --json number,title,updatedAt,labels --limit 100`
- Fetch PR→issue links in a **single pass** (one call, not one-per-issue): `gh pr list --repo {owner}/{repo} --state all --json number,url,state,closingIssuesReferences --limit 200`, then join PRs to issues locally via `closingIssuesReferences`. Do not loop a `gh` call per issue.
- **Rebuild the entire Recent/Medium tables from those two fetches** — do not diff against the
  old file or selectively add/remove rows. The open-issue fetch *is* the set; anything not in it
  is closed and simply absent from the new render.
- Set `Last synced` to today and overwrite the file.

**If already today:** Skip the rebuild, use the existing render.

## Step 3 — Check for active work logs

Scan the memory directory for `issue-*.md` files. These are issues with active worktrees from previous sessions. Note them — they take priority in the assessment.

Also run `git worktree list` to see what worktrees currently exist.

## Step 4 — Assess and prioritise

Build an opinionated shortlist of 3–5 issues. Prioritise by:

1. **Issues with active work logs** — already in progress, worktree likely exists → surface as resume candidates
2. **Issues labeled `status: in progress`** — started but no work log found → flag for investigation
3. **High priority + low effort** — quick wins with clear value
4. **Logical sequence** — does one issue unblock another? Note dependencies
5. **Recent activity** — recently updated issues are more likely to be relevant now

For each shortlisted issue, write one line: why it makes sense *now*, which member is assigned, effort, and any blockers.

Member assignment and assessment are **derived here, live** — from the issue's current content
and labels (and any per-issue work log) — not read from the cache file. They are presentation
opinion, recomputed each session; the persisted render holds none of it.

## Step 5 — Present the shortlist

Format:

```
Here's what makes sense to work on next:

1. **#NNN — Title** [🔧 Tech] — Low effort, two-file change. Ready to go.
2. **#NNN — Title** [🔌 Echo] — Depends on #205 being merged first. PR #214 still open.
3. **#NNN — Title** [🎯 Hunter] — High value, been sitting a while.
   ↩ Active work log found — worktree may still exist. Could resume.

Which one?
```

Do not start any work until the user picks one.

---

## Cache file format

```markdown
---
name: project_issues
description: Open issues on {owner}/{repo} — last synced {date}
type: project
---

**Last synced:** YYYY-MM-DD
**Repo:** {owner}/{repo}

> Persisted columns are **GitHub-derived only** (`#`, `Updated`, `Title`, `PR?`). Member
> assignment and the one-line assessment are *opinion*, not state — they're computed live in
> Step 4–5 when presenting the shortlist and never written here. That's why a wholesale
> regenerate from `gh` loses nothing: the file only ever held what `gh` can rebuild.

---

## Recent / Active (updated < 1 year ago)

| # | Updated | Title | PR? |
|---|---------|-------|-----|

---

## Medium age (1–2 years, still potentially relevant)

| # | Updated | Title | PR? |
|---|---------|-------|-----|

---

## Stale / low priority / questions / not actionable

Issues #N, #N — old, stale, or blocked. Skip unless specifically referenced.
```

---

## Creating a new issue

When a new issue is created with `gh issue create`, the source of truth (GitHub) already has
it — so **do not hand-add a row** to `project_issues.md`. Instead just regenerate the render
from `gh` (Step 2), which now includes the new issue. Because the render is rebuilt wholesale,
there is nothing to merge and nothing to race.

Do NOT update `Last synced` when you regenerate solely to reflect a just-created issue — leave
it unchanged so the next session still runs a full dated sync.

---

## Member roster (for assignment)

Read the active workforce at `~/.claude/bcp/workforce.json` and assign the member whose
`bestFor` best matches the issue's content and labels. Use each member's emoji-and-name
`label` in the cache table and shortlist, and its `id` for mission directories.

The default **Clone Force 99** workforce, for reference:

- 🎯 Hunter — project coordination, planning, complex dependencies
- 🔧 Tech — technical implementation, detailed analysis, components
- 💥 Wrecker — major refactors, breaking changes, legacy demolition
- 🎯 Crosshair — precision bug fixes, surgical changes
- 🔌 Echo — CI/CD, API integrations, MCP connections
- 🌟 Omega — exploration, new tech, fresh perspectives
- 👑 Rex — security-critical, leadership backup

Switch workforce with `/bcp:workforce`; the assignment logic stays the same (match on
`bestFor`).
