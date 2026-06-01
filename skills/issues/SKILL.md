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

## Step 2 — Sync the cache

Read the existing `project_issues.md` and check `Last synced` date.

**If stale (not today):**

- Fetch open issues: `gh issue list --repo {owner}/{repo} --state open --json number,title,updatedAt,labels --limit 100`
- Fetch recently closed: `gh issue list --repo {owner}/{repo} --state closed --json number,updatedAt --limit 50`
- Filter both for changes since `Last synced`
- For new/changed issues, fetch full details
- Check for newly linked PRs on any issue with `—` in PR? column:
  `gh pr list --repo {owner}/{repo} --state all --search "closes #{number}" --json number,url,state`
- Remove closed issues, add/update changed ones
- Update `Last synced` to today

**If already today:** Skip sync, use existing cache.

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

---

## Recent / Active (updated < 1 year ago)

| # | Updated | Title | Member | PR? | Assessment |
|---|---------|-------|-------|-----|------------|

---

## Medium age (1–2 years, still potentially relevant)

| # | Updated | Title | Member | PR? | Assessment |
|---|---------|-------|-------|-----|------------|

---

## Stale / low priority / questions / not actionable

Issues #N, #N — old, stale, or blocked. Skip unless specifically referenced.
```

---

## Creating a new issue

When a new issue is created with `gh issue create`, immediately add it to `project_issues.md` — do not wait for the next sync. Add a row to the appropriate section with:

- Issue number and title
- Today's date as `Updated`
- Assigned member (derive from issue content/labels using the active workforce — see below)
- `—` for PR?
- A one-line assessment

Do NOT update `Last synced` — that field is only set by a full sync. Leaving it unchanged ensures the next session still runs a proper sync and picks up any other issues created in the meantime.

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
