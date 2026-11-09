# Decay baseline

Which process steps the agent skipped or followed inconsistently, per repo. Output of
[#27](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/27), point 6 of the bcp review. The detection work in [#31](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/31) measures against this table.

Every mark is derived from traces on GitHub, in `~/.claude` and in session transcripts, sampled 2026-11-09. The maintainer has not marked any cell by hand. Step IDs refer to [skill-step-audit.md](skill-step-audit.md).

## How to read this

Only steps whose skipping is observable are listed: steps that leave a trace (a file, a comment, a label, a commit) or that should have run and didn't. Steps that are pure judgment (the shortlist, the Hickey lens) are left out.

Each cell is a mark and the count behind it, `followed/opportunities`. The mark follows from the share followed:

| Mark | Share followed |
| --- | --- |
| `holds` | 90% or more |
| `inconsistent` | 25% to under 90% |
| `skipped` | under 25% |
| `?` | not measured, or there is no denominator |

Repos: `forestboys` ([VirtueMe/forestboys](https://github.com/VirtueMe/forestboys)) and `conductor-swarm-forge` ([VirtueMe/conductor-swarm-forge](https://github.com/VirtueMe/conductor-swarm-forge)).

## Baseline

### Starting and resuming work

| Step | What it should leave behind | forestboys | conductor-swarm-forge |
| --- | --- | --- | --- |
| IS8 `issues` used at session start | a shortlist before work begins | skipped (6/39 sessions) | inconsistent (8/27 sessions) |
| WC11 mission file created | `missions/<member>/current/{NNN}.md` | inconsistent (29/40 closed issues) | inconsistent (34/40 closed issues) |
| WC12 work log created | `memory/issues/{NNN}/log.md` or `issue-{NNN}.md` | holds (30/31) | holds (19/20) |
| WC13 `CHECKLIST.md` seeded | local checklist, excluded from git | holds (29/31) | holds (20/20) |
| WC14 issue-body checklist markers | `<!-- checklist:start -->` block in the issue | inconsistent (25/31) | inconsistent (14/20) |
| WR7 `Current State` updated on resume | work log reflects the session | ? (0 resume sessions) | ? (1 resume session) |

### Committing

| Step | What it should leave behind | forestboys | conductor-swarm-forge |
| --- | --- | --- | --- |
| Tests before commit | a test run since the previous commit | inconsistent (88/109 commits) | inconsistent (80/105 commits) |
| RV6 `review` used before a non-trivial commit | review findings shown with the proposal | skipped (2/31 commit sessions) | inconsistent (14/21 commit sessions) |
| CG7 human approves every commit | a proposal and an explicit yes | ? | ? |
| CG9 batch appended to the work log | a line under `## Batches` | inconsistent (80/109 commits) | inconsistent (86/105 commits) |
| CG10 checklist synced to the issue | ticked items in the issue body | inconsistent (73/109 commits) | inconsistent (66/105 commits) |
| CG11 comment for descoped items | an issue comment naming what was dropped | ? (13 commits followed by a comment) | ? (14 commits followed by a comment) |
| CG12 `commit-guide` used in the session | the skill's proposal before the commit | inconsistent (14/31 commit sessions) | inconsistent (13/21 commit sessions) |

### Opening the PR

| Step | What it should leave behind | forestboys | conductor-swarm-forge |
| --- | --- | --- | --- |
| PR12 issue linked (`Closes #`) | the PR closes the issue | holds (18/18 PRs) | inconsistent (15/20 PRs) |
| PR3 Summary and Test plan in the body | the PR template followed | holds (18/18 PRs) | holds (20/20 PRs) |
| PR8 `## PR` appended to the work log | PR link in the log | holds (29/30) | holds (19/20) |
| PR9 mission file updated | progress note and ticked checklist | holds (28/30) | holds (19/20) |
| PR10 final checklist sync | issue body matches `CHECKLIST.md` | holds (27/30) | holds (18/20) |
| PR13 PR opened through `pr-create` | the skill's proposal before `gh pr create` | holds (68/68) | holds (73/75) |

### After merge

| Step | What it should leave behind | forestboys | conductor-swarm-forge |
| --- | --- | --- | --- |
| WX15 worktree removed through `worktree-cleanup` | the skill's confirmation before removal | holds (68/68) | holds (74/74) |
| WX8 `status: in progress` label removed | no stale label on a closed issue | inconsistent (51/58 closed issues) | holds (93/94 closed issues) |
| WX10 mission moved to `done/` | `missions/<member>/done/{NNN}.md` | holds (68 done, 1 left in `current/`) | holds (74 done, 1 left in `current/`) |
| WX11 PR test plan ticked | all boxes checked | inconsistent (22/34 PRs) | inconsistent (25/40 PRs) |
| WX12 work log removed | no work log left for a finished issue | holds (1 stale log) | holds (2 stale logs, in the older checkout) |

## Method

- **GitHub:** the last 20 merged PRs per repo for PR3 and PR12 (release PRs excluded), the last 40 merged PRs for WX11, and all closed issues for WX8.
- **`~/.claude`:** mission files in `~/.claude/missions/` and `issue-*.md` work logs in each repo's project memory, for WC11, WX10 and WX12. WC11 compares the 40 most recent closed issues (`forestboys` #309–#433, `conductor-swarm-forge` #107–#189) with mission files. The one mission left in `current/` per repo (`forestboys` #14, `conductor-swarm-forge` #188) may be active work.
- **Transcripts:** main-thread sessions under `~/.claude/projects/`. 39 sessions for `forestboys` (2026-10-12 to 2026-11-09) and 27 for `conductor-swarm-forge` (2026-10-31 to 2026-11-09), with 109 and 105 commits, release commits excluded. Counts come from `Skill`, `Bash`, `Edit` and `Write` tool calls, so a step done by another route is missed and counts as not followed.
- **What a count means:** CG12, PR13, WX15, IS8 and RV6 count whether the skill was used, not whether a trigger phrase fired. `commit-guide` ran once per session, not once per batch. `conductor-swarm-forge` tests with shell scripts such as `scripts/test-*.sh`; the test counter includes those. CG11 has no denominator because the number of descoped items is unknown. WR7 is `?` because `worktree-resume` was almost never used.
- **Not reproducible as it stands:** the counts came from a one-off script that was not kept. #31 is the way to measure them continuously; until then, re-sampling means repeating the steps above by hand.
