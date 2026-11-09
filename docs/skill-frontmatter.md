# Skill frontmatter contract

Every `skills/*/SKILL.md` can declare who owns it and when it should be revisited. `npm run validate` enforces the contract in CI (`scripts/lib/skill-frontmatter.mjs`). Output of
[#30](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/30), point 3 of the bcp review.

| Field | Required | Value |
| --- | --- | --- |
| `kind` | when tagged | `shim`, `process` or `convention`; meanings in [skill-step-audit.md](skill-step-audit.md) |
| `checked` | when `kind` is set | `YYYY-MM`, the month someone last confirmed the skill is still needed |
| `fills-gap` | `shim` | the gap in Claude Code the skill fills |
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

**Untagged skills pass for now.** Skills that mix kinds are split in #44 and tagged in #43. #43 makes `kind` mandatory.
