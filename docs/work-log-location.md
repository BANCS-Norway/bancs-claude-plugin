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
| `memory/issues/{NNN}/log.md` | the skills, now | `worktree-resume`, `worktree-cleanup`, `issues`, `commit-guide`, `pr-create` |
| `memory/issue-{NNN}.md` (flat, with frontmatter) | the skills before the per-issue folder | `worktree-resume`, `worktree-cleanup`, `issues` |
| `memory/issues/{NNN}/work-log.md` | by hand | nothing |

## Migration path

**There is nothing to migrate.** New logs use `issues/{NNN}/log.md`. A legacy log stays where it is, is read as it is, and is removed by `worktree-cleanup` with its issue. A hand-made `work-log.md` is not read by any skill; rename it to `log.md` to have a skill pick it up.

**If the logs ever have to move** (Claude Code starts rewriting unknown files, or the folder stops being shared): copy `issues/` to the new place, make the skills read the new place first and the old one as a fallback for one release, then stop reading the old one. Copy, never move, so an interrupted session can still find its log.

## Known defect

The skills derive `{project-slug}` from the current working directory. A session that starts inside a worktree computes a different folder from the shared one. `project-context` avoids this by using the main checkout. [#69](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/69) adds one script that computes the folder and reads the layouts above.
