# Where work logs live

Decision for [#40](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/40), point 2 of the bcp review.

**Decision: work logs stay in the project memory folder**, `~/.claude/projects/<project>/memory/`, the folder Claude Code uses for its own auto memory. bcp does not get a folder of its own for them.

## What lives where

| What | Where |
| --- | --- |
| Work log of an issue in progress | `memory/issues/{NNN}/log.md` |
| Project facts ([project-context.md](project-context.md)) | `memory/project_context.md` |
| Missions | `~/.claude/missions/{member}/` |
| Workforce, skipped-step log, nudges | `~/.claude/bcp/` |

Missions and `~/.claude/bcp/` are not per project and not in Claude Code's folder, so they are not part of this decision.

## Why stay

Checked against the [memory docs](https://code.claude.com/docs/en/memory.md), section "Storage location", read 2026-11.

- **The folder is per repository, not per worktree.** "The `<project>` path is derived from the git repository, so all worktrees and subdirectories within the same repo share one auto memory directory." A log written from a worktree and one written from the main checkout belong in the same place, and there they are.
- **The contention is gone.** Each issue has its own folder with one writer, and the issue skills never write `MEMORY.md`, the one shared file. #19's lock was retired by #55 for that reason.
- **It moves with the user's choice.** If memory is relocated with `autoMemoryDirectory`, the logs and `project_context.md` go with it. A bcp folder would stay behind.
- **It survives cleanup.** Memory files are excluded from the transcript retention sweep.

**Not stated in the docs:** what Claude Code does with a subfolder or a file it did not write, and what happens when several sessions write to the folder at once. bcp accepts that: a log is small and is removed when its issue is cleaned up. If Claude Code starts reading or rewriting such files, move the logs (see below).

## Layouts

Three layouts exist. Where the table below says a skill reads a layout, it does; none rewrites a legacy one.

| Layout | Written by | Read by |
| --- | --- | --- |
| `memory/issues/{NNN}/log.md` | the skills, now | every skill, through `scripts/work-log.mjs path` |
| `memory/issue-{NNN}.md` (flat, with frontmatter) | the skills before the per-issue folder | the same |
| `memory/issues/{NNN}/work-log.md` | by hand | the same; `log.md` wins when both exist |

## Migration path

**There is nothing to migrate.** New logs use `issues/{NNN}/log.md`. A legacy log stays where it is, is read as it is (`work-log.mjs path` finds all three layouts), and is removed by `worktree-cleanup` with its issue.

**If the logs ever have to move** (Claude Code starts rewriting unknown files, or the folder stops being shared): copy `issues/` to the new place, make the skills read the new place first and the old one as a fallback for one release, then stop reading the old one. Copy, never move, so an interrupted session can still find its log.

## One script computes the folder

`scripts/work-log.mjs` ([#69](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/69)) is the only place the folder is computed, from the main checkout (as `project-context` does), so a session started inside a worktree and one in the primary clone share the same logs. Skills call `memory`, `path <issue>`, `create <issue>`, `active` and `remove <issue>` and never spell the path; `npm run test:literals` fails when one does.
