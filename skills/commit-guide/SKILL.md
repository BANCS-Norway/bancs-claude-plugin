---
name: commit-guide
description: Guide the commit process after a batch of work is done — determine the correct commit type, draft the message, flag version bump impact, and commit after approval. Trigger when the user says "looks good", "ready to commit", "that's the batch", "let's commit", "approve", or similar end-of-batch signals.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Commit Guide — Batch Completion

You handle the commit step so the user never has to think about commit types, message format, or version bump impact. You propose, they approve, you commit.

## See what changed

Run in parallel:

```bash
git diff --staged
git diff
git status
```

If nothing is staged, show unstaged changes and ask which files to include.

## Determine commit type

Analyse what changed and apply these rules:

### Triggers a version bump (VitePress site changes only)

| Type | When | Bump |
|------|------|------|
| `feat` | New page, component, or user-visible feature | Minor (1.0→1.1) |
| `fix` | Bug fix to site functionality or appearance | Patch (1.0→1.0.1) |
| `style` | CSS/visual changes to the site | Patch |

### No version bump (internal changes)

| Type | When |
|------|------|
| `docs` | CLAUDE.md, README, workflow docs, code comments |
| `chore` | Tooling, deps, configs, build scripts |
| `refactor` | Code restructuring, no behaviour change |
| `ci` | GitHub Actions, CI/CD changes |
| `test` | Tests only |

### Critical distinction

- `style:` = CSS/visual → **version bump**
- `refactor:` = code restructuring → **no bump**

When in doubt between `feat` and `fix`: `feat` adds something new, `fix` corrects something broken or wrong.

## Determine scope (optional)

If the change is clearly scoped to one area, add it: `feat(blog):`, `fix(footer):`, `chore(ci):`.
Skip scope if it's broad or unclear — don't force it.

## Draft the commit message

Format:

```
{type}({scope}): {description}

{bullet points summarising what changed — keep to essentials}

Part of #{NNN}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Keep the subject line under 72 characters. Description is imperative mood: "add", "fix", "update" not "added", "fixed", "updated".

## Show and ask for approval

Present clearly:

```
Proposed commit:

  fix(footer): update org number to reflect VAT registration

  - Add MVA suffix to org number in Footer.vue
  - Update MVA-registrert status on contact.md

  Part of #215

  ⚠️  This is a `fix:` — triggers a patch version bump and site deployment.

Stage and commit?
```

Wait for explicit approval. Do not commit until confirmed.

## Commit

```bash
git add {files}
git commit -m "$(cat <<'EOF'
{full message}
EOF
)"
```

## Update the issue work log

Append to `~/.claude/projects/{project-slug}/memory/issue-{NNN}.md`:

Under `## Batches`, add:

```
- [x] Batch {N}: {description} — `{commit type}: {subject}`
```

Update `## Current State`:

```
Batch {N} committed. {X} batches done. Remaining: {what's left from goal}
```

## Update the checklist and sync to GitHub

Open `CHECKLIST.md` (worktree root). Ask the user:

```
Items resolved by this batch?
  - [ ] item A
  - [ ] item B
  - [ ] item C

Tick, strike-through (~~item~~ for descope), or add new items.
```

After edits, flush to the issue body — replace only the section between `<!-- checklist:start -->` and `<!-- checklist:end -->`:

```bash
# 1. fetch current body, 2. swap the marked section with CHECKLIST.md contents, 3. write back
gh issue view {NNN} --json body --jq '.body' > /tmp/body.md
# substitute the block, then:
gh issue edit {NNN} --body-file /tmp/body.md
```

For any items that became `~~struck~~` in this batch, post a one-line comment explaining why (the audit trail lives in comments, not the body):

```bash
gh issue comment {NNN} --body "Descoped: {item} — {one-line reason}"
```

If `CHECKLIST.md` doesn't exist (older worktree predating this skill), skip silently.
