---
name: commit-guide
description: Guide the commit process after a batch of work is done — determine the correct commit type, draft the message, flag version bump impact, and commit after approval. Trigger when the user says "looks good", "ready to commit", "that's the batch", "let's commit", "approve", or similar end-of-batch signals.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
kind: process
checked: 2026-11
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

### Commit types — ask the project context

Which types a repo allows is the repo's rule (commitlint), not the skill's. Ask for them; never
assume a list:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/project-context.mjs" <<'ARGS'
get commit_types
ARGS
```

The first line is `commit_types: <types>`, the allowed types separated by spaces.

- A list: propose only a type from it, even when another type would fit the change better. Use the
  meanings below to choose among them. A `scopes:` line lists the only scopes the repo allows.
- `commit_types: unknown`, or the script fails, or `${CLAUDE_PLUGIN_ROOT}` is unset: do not propose a
  type from memory. Say "Commit types not detected" and what the `from:` line says, and ask the user
  which types this repo uses. Use their answer, and offer `/bcp:context confirm commit_types <list>`
  so it is asked only once.

What the types mean, for choosing among the allowed ones:

| Type | When |
|------|------|
| `feat` | Something new for the user of the project |
| `fix` | Corrects something broken or wrong |
| `style` | Visual or formatting changes only |
| `docs` | CLAUDE.md, README, workflow docs, code comments |
| `chore` | Tooling, deps, configs, build scripts |
| `refactor` | Code restructuring, no behaviour change |
| `ci` | GitHub Actions, CI/CD changes |
| `test` | Tests only |
| `perf` | A change that makes something faster |

A type outside this table is the repo's own: read its meaning from the repo (CONTRIBUTING, its
commit history) or ask.

When in doubt between `feat` and `fix`: `feat` adds something new, `fix` corrects something broken or wrong.

### Version impact — ask the project context

Whether a commit bumps a version, and by how much, depends on the project's release mechanism,
not on the type's name. Ask for it; never assume one:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/project-context.mjs" <<'ARGS'
get release
ARGS
```

Read the first line, `release: <value>`, and say exactly one of these in the proposal:

| `release` | In the proposal |
|-----------|-----------------|
| `semantic-release` | The `bumps:` line names the types that bump and by how much; every other type does not bump. Say what this commit's type does. |
| `vitepress` | The `bumps:` line names the types that bump the site version; every other type does not. Say what this commit's type does, and that a bump deploys the site. |
| `none` | Nothing about versions or deployment. |
| `unknown`, or the script fails, or `${CLAUDE_PLUGIN_ROOT}` is unset | "Release mechanism not detected." No bump claim and no no-bump claim. |

The answer is recorded once per project and every gate reads the same one. If its `from:` line says
`unconfirmed`, say so once in the session and that `/bcp:context confirm release` pins it (or
`/bcp:context confirm release <value>` corrects it). Do not raise it again on later commits.

## Determine scope (optional)

If the change is clearly scoped to one area, add it: `feat(api):`, `fix(parser):`, `chore(ci):`.
Skip scope if it's broad or unclear — don't force it. When `get commit_types` printed a `scopes:`
line, the scope is one of those, or none.

## Draft the commit message

Format:

```
{type}({scope}): {description}

{bullet points summarising what changed — keep to essentials}

Part of #{NNN}
```

Write no attribution footer (`Generated with`, `Co-Authored-By`). Claude Code adds its own from the
`attribution` setting, and the session may name the lines to end with; a footer written here would
be a second one, and would name the wrong model.

Keep the subject line under 72 characters. Description is imperative mood: "add", "fix", "update" not "added", "fixed", "updated".

## Show and ask for approval

Present clearly:

```
Proposed commit:

  fix(parser): handle an empty config file

  - Return the defaults when the config file has no content
  - Add a test for the empty file

  Part of #215

  ⚠️  This is a `fix:` — a patch version bump under semantic-release.

Stage and commit?
```

The ⚠️ line comes from *Version impact* above: with `none` leave it out, and with `unknown` it reads
"Release mechanism not detected."

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

Append to `~/.claude/projects/{project-slug}/memory/issues/{NNN}/log.md`:

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

After edits, flush `CHECKLIST.md` to the issue body — the helper replaces only the
section between `<!-- checklist:start -->` and `<!-- checklist:end -->`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/checklist-sync.mjs" {NNN}
```

For any items that became `~~struck~~` in this batch, post a one-line comment explaining why (the audit trail lives in comments, not the body):

```bash
gh issue comment {NNN} --body "Descoped: {item} — {one-line reason}"
```

If `CHECKLIST.md` doesn't exist (older worktree predating this skill), skip silently.
