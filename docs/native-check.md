# Native check before a new skill, command or hook

Claude Code ships features fast, and a bcp step that copies one becomes dead weight. Before writing a new skill, command or hook, check whether Claude Code already does it or has announced it. This is [#34](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/34), point 7 of the bcp review.

**No `fills-gap`, no shim.** If you can't name the gap in Claude Code that the new piece fills, don't build it.

## Checklist

1. **Search the docs.** Look up the feature in the Claude Code docs (`https://code.claude.com/docs/en/`): settings, hooks, plugins, worktrees, slash commands, subagents. Cite a page and anchor, the way [native-overlap.md](native-overlap.md) does.
2. **Read the changelog.** Search the [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) for anything shipped or announced that covers it, even partly. Note the version.
3. **Decide the kind** ([skill-step-audit.md](skill-step-audit.md) defines the kinds):
   - native covers it: use the native feature and don't build anything;
   - native covers part of it, or not yet: it is a `shim` (build only the missing part);
   - it is not Claude Code's job at all (team process, repo convention): it is a `process` or `convention` piece and needs no `fills-gap`.
4. **Record the finding.**
   - Skill or command: put `fills-gap` and `retire-when` in its frontmatter ([skill-frontmatter.md](skill-frontmatter.md)). `npm run validate` rejects a `shim` without them.
   - Hook: `hooks.json` has no frontmatter, so add a row to [native-overlap.md](native-overlap.md) with the native feature, a verdict, `fills-gap` and `retire-when` (see `HK1`).
5. **Date it.** A skill or command gets `checked: YYYY-MM`, the month of this check.

If the docs don't say either way, write that down (`CANNOT-CONFIRM` in native-overlap.md) instead of guessing.
