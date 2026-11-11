# Frontmatter contract for skills and commands

Every `skills/*/SKILL.md` and `commands/*.md` declares who owns it and when it should be revisited. `npm run validate` enforces the contract in CI (`scripts/lib/skill-frontmatter.mjs`). The contract is [#30](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/30), the tags and the rule that `kind` is mandatory are [#43](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/43), point 3 of the bcp review.

| Field | Required | Value |
| --- | --- | --- |
| `kind` | always | `shim`, `process` or `convention`; meanings in [skill-step-audit.md](skill-step-audit.md) |
| `checked` | always | `YYYY-MM`, the month someone last confirmed the skill is still needed |
| `fills-gap` | `shim` | the gap in Claude Code the skill fills, found by the [native check](native-check.md) |
| `retire-when` | `shim` | the condition under which the skill should be removed |

```yaml
---
name: example
description: ...
kind: shim
fills-gap: Native worktrees cannot take a caller-chosen branch name.
retire-when: Native worktrees accept a caller-chosen branch name.
checked: 2026-11
---
```

Values are single-line `key: value`. The parser reads flat fields only, so a block scalar (`>` or `|`) is rejected.

**A skill has one `kind`, and since #44 the mixed ones are split.** `worktree-create`, `worktree-cleanup`, `pr-create` and `commit-guide` each mixed owners. Their shim steps moved out of the prose: `git worktree add`, the dependency bootstrap and `direnv allow` are `scripts/worktree-start.mjs`; `git worktree remove` and the branch delete are `scripts/worktree-finish.mjs`; the two hard-coded footers are gone. A shim in a script keeps its `retire-when` in a row of [native-overlap.md](native-overlap.md), which the shim review (#36) reads like a `kind: shim` file; retiring it means deleting the script step and the skill's call. What the repo owns (base branch, commit types, labels, PR title format, direnv) is read from the project context ([project-context.md](project-context.md)). What is left in the skills is bcp's own process, so each is `process`.

**All 8 skills and 4 commands are tagged `checked: 2026-11`**, the month of the audit in [#25](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/25) and [#26](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/26). A skill or command with no `kind` fails `npm run validate`.

**`checked` drives the shim review ([#36](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/36)).** A `kind: shim` file, like a shim row in [native-overlap.md](native-overlap.md), is listed at session start in the bcp repo once a Claude Code update lands in a later month than its `checked`. `/bcp:shim-review` reviews it against `retire-when` and sets `checked` to the current month.
