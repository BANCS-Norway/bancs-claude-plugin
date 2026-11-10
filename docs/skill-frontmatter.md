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

**Mixed skills carry their dominant kind until #44.** `worktree-create`, `worktree-cleanup`, `pr-create` and `commit-guide` each mix owners (see the rows in [skill-step-audit.md](skill-step-audit.md)); the contract allows one `kind` per file, so each is tagged `process`, the owner of most of its steps. The shim steps inside them (`git worktree add`, `git worktree remove`, the hard-coded footers) have no `retire-when` of their own until #44 splits the skills; the audit table and [native-overlap.md](native-overlap.md) record them meanwhile.

**All 8 skills and 4 commands are tagged `checked: 2026-11`**, the month of the audit in [#25](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/25) and [#26](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/26). A skill or command with no `kind` fails `npm run validate`.

**`checked` drives the shim review ([#36](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/36)).** A `kind: shim` file, like a shim row in [native-overlap.md](native-overlap.md), is listed at session start in the bcp repo once a Claude Code update lands in a later month than its `checked`. `/bcp:shim-review` reviews it against `retire-when` and sets `checked` to the current month.
