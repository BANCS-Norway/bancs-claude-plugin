# Skill step audit

One row per step across the 8 skills, 3 commands and the hook (bcp v1.0.3). Output of
[#25](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/25), point 1 of the bcp review.

## How to read this

**Owner** — who should maintain the step:

- **shim** — fills a gap in Claude Code. Should be retired once native covers it.
- **process** — personal workflow (workforce, work logs, missions, the Hickey review). Stays; only how it is triggered may change.
- **convention** — a rule that belongs to the repo (base branch, commit types, label names, PR format, direnv). Should be read from the repo, not hard-coded here.

A step that mixes owners is split into separate rows. Each row has exactly one owner.

**Native overlap** — what Claude Code already does. Rows that touch a native feature carry only the verdict (`YES`, `PARTIAL`, `NO`, `CANNOT-CONFIRM`); the evidence, docs links and `retire-when` are in [native-overlap.md](native-overlap.md), the single place each verdict is written out. `None` means no native feature touches the step.

**Action** — `keep` · `slim` (shorten or replace part) · `retire` · `move` (to repo conventions) · `enforce` (hook or CI instead of prose).

The last column names the issue that carries the change, where one exists.

## `worktree-create`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| WC1 | Load issue from `project_issues.md`, fall back to `gh issue view` | process | None | slim | Cache holds only `#`, `Updated`, `Title`, `PR?`. Labels and member are never there, so this always falls through to `gh`. |
| WC2 | Assign a member from the active workforce | process | None | keep | |
| WC3 | Map labels to branch type; `.github/` override | process | None | keep | #44: bcp's own workflow, not a repo rule. Resume, cleanup and the preflight depend on `{type}/{NNN}_{slug}`. The branch type should be one of the repo's `commit_types`. |
| WC4 | Slug rules, `{type}/{NNN}_{slug}` naming | process | None | keep | #44: as WC3. |
| WC5 | Confirm names with the user | process | None | keep | |
| WC5b | Preflight: `gh` signed in, default branch exists, branch and path free, no open PR for the issue | shim | PARTIAL; see native-overlap.md, WC5b | keep | #42, the checks from #1. In code: `scripts/worktree-preflight.mjs`. #44: `worktree-start` runs it again, so creating cannot skip it. |
| WC6a | `git worktree add` | shim | PARTIAL; see native-overlap.md, WC6a | slim | #37. #44: in code, `scripts/worktree-start.mjs`; the skill makes one call. |
| WC6b | Worktree location `.worktrees/` | convention | `.claude/worktrees/` is the native location | keep | #37 decided: keep `.worktrees/` while bcp creates worktrees with git; see native-overlap.md, WC6b. |
| WC7 | Branch from the default branch | convention | Default branch is available from git | keep | #42: the base comes from the preflight (`default_branch`), no longer `main`. |
| WC8 | `direnv allow` in the new worktree | convention | None | keep | #42: reads the `direnv` fact; only runs where `.envrc` exists. #44: runs in `scripts/worktree-start.mjs`. |
| WC9 | Symlink `node_modules` or `npm ci`, copy and link what `.worktreeinclude` names | shim | PARTIAL; see native-overlap.md, WC9 | slim | #44: in code, `scripts/worktree-start.mjs`. #37: `.worktreeinclude` support (native does not reach git-made worktrees); a missing file is flagged. The Node bootstrap stays Node-only (#8). |
| WC10 | Add the in-progress label | convention | None | keep | #42: the name is the `in_progress_label` fact; when there is none it adds nothing and says so. |
| WC11 | Create mission file | process | None | keep | Overlaps WC12 in content (objective, progress). Revisit with #40. |
| WC12 | Create `memory/issues/{NNN}/log.md` | process | Claude Code project memory shares the same folder | keep | #40 decided: stay in the project memory folder ([work-log-location.md](work-log-location.md)). #69 computes the folder from the main checkout. |
| WC13 | Seed `CHECKLIST.md`, add worktree-local exclude | process | None | keep | |
| WC14 | Wrap issue-body checklist in markers (`checklist-sync.mjs`) | process | None | keep | |
| WC15 | Activate member style | process | None | keep | |
| WC16 | "Ready" confirmation | process | None | keep | |
| WC17 | Trigger: phrases ("let's do #215") | process | YES; see native-overlap.md, WC17 | keep | #43 tags the skill |

## `worktree-resume`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| WR1 | Load work log, fall back to legacy `issue-{NNN}.md` | process | None | keep | #40 decided: stay in the project memory folder ([work-log-location.md](work-log-location.md)). The legacy fallback stays. |
| WR2 | `cd` into the worktree, then git status, log, diff, stash | process | None | keep | #23: was `git -C`, which can bypass permission rules; now `cd` and plain git. |
| WR2a | Default branch for the commit list and the diff | convention | None | keep | #42: the `default_branch` fact, no longer `main`. |
| WR3 | Check GitHub for comments, labels, state | process | None | keep | |
| WR4 | Reconcile local `CHECKLIST.md` with issue body | process | None | keep | |
| WR5 | Activate member (cache as fallback) | process | None | slim | Cache never holds the member; drop the fallback. |
| WR6 | Brief the user | process | None | keep | |
| WR7 | Update `Current State` in the work log | process | None | enforce | #31 |
| WR8 | Trigger: phrases ("resume #NNN") | process | PARTIAL; see native-overlap.md, WR8 | keep | #43 |

## `worktree-cleanup`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| WX1 | Identify the merged PR (`gh pr list --state merged`) | process | None | keep | |
| WX2 | Load work log, legacy fallback | process | None | keep | #40: as WR1. |
| WX3 | Verify issue and PR state on inconsistency | process | None | keep | |
| WX4 | Detect resume mode (worktree/branch already gone) | process | None | keep | #44: read from `worktree-finish status`. |
| WX5a | Warn about uncommitted changes before removal | shim | PARTIAL; see native-overlap.md, WX5a | slim | #38. #44: the `dirty:` line of `worktree-finish status`. |
| WX5b | Audit `CHECKLIST.md` for unresolved items, wait for confirmation | process | None | keep | |
| WX6 | `git worktree remove` | shim | PARTIAL; see native-overlap.md, WX6 | slim | #38. #44: in code, `scripts/worktree-finish.mjs remove`. |
| WX7 | `git branch -d`, `-D` after PR check | shim | PARTIAL; see native-overlap.md, WX7 | slim | #38. #44: in code. `-D` only when GitHub shows a merged PR whose head is the branch tip, so a branch with later commits is kept. |
| WX8 | Remove the in-progress label | convention | None | keep | #42: the `in_progress_label` fact, as WC10. |
| WX9 | Verify the issue closed, leave it open if not | process | None | keep | |
| WX10 | Complete mission and move to `done/` | process | None | keep | |
| WX11 | Tick PR test-plan boxes | process | None | keep | |
| WX12 | Remove `memory/issues/{NNN}/` (and legacy file) | process | None | keep | #40: as WR1. |
| WX13 | "Issue cache — nothing to do" section | process | None | retire | A step that says do nothing. Keep one line in the design note. |
| WX14 | Confirm summary | process | None | keep | |
| WX15 | Trigger: phrases ("merged", "cleanup") | process | None | enforce | #43 tags it; a merged-PR check could replace the phrase. |

## `commit-guide`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| CG1 | `git diff`, `git diff --staged`, `git status` | process | PARTIAL; see native-overlap.md, CG1 | slim | #44: the process's own command, not a shim. No retirement condition, so outside the shim review (#36). |
| CG2 | Commit types (`feat`, `fix`, `style`, ...) | convention | None | keep | #41: the allowed types come from the project context `commit_types` fact (commitlint `type-enum`); `unknown` is asked about, never defaulted. The table keeps only what each type means. |
| CG3 | Version impact, from the project context `release` fact | convention | None | keep | #24 closes #22: the bump rules now follow the detected release mechanism (semantic-release, VitePress, none, unknown) instead of a VitePress table. #41 moved the commit types and scopes (CG2, CG4). |
| CG4 | Optional scope | convention | None | keep | #41: only a `scope-enum` from commitlint is enforced; otherwise the scope stays free. |
| CG5 | Message body, `Part of #{NNN}` trailer | process | None | keep | #44: the trailer links the commit to the issue bcp works on, it is not a repo rule. |
| CG6 | Hard-coded `Generated with Claude Code` / `Co-Authored-By` footer | shim | YES; see native-overlap.md, CG6 | retire | #44 removed it; the skill says to write none. |
| CG7 | Show proposal, wait for approval | process | None | keep | Human approves every commit. |
| CG8 | `git add` and `git commit` | process | PARTIAL; see native-overlap.md, CG8 | slim | #44: the process's own command, not a shim. No retirement condition, so outside the shim review (#36). |
| CG9 | Append batch to the work log | process | None | enforce | #31 |
| CG10 | Ask which checklist items resolved, sync to issue body | process | None | keep | |
| CG11 | Comment on the issue for descoped items | process | None | enforce | #32 |
| CG12 | Trigger: phrases ("looks good", "approve") | process | None | enforce | #43; #45 for the commit-time rules |

## `issues`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| IS1 | Derive project slug and memory path | process | Mirrors Claude Code's own project-folder scheme | keep | #40: the folder stays shared. Derived from the cwd, which differs in a worktree: #69 fixes it. |
| IS2 | Regenerate `project_issues.md` from `gh` (two calls, atomic write) | process | None | keep | |
| IS3 | Scan `memory/issues/*/log.md`, run `git worktree list` | process | None | keep | #40: as WR1. |
| IS4 | Assess and prioritise a 3–5 item shortlist | process | None | keep | Judgment; stays prose. |
| IS5 | Present shortlist, wait for the pick | process | None | keep | |
| IS6 | New issue: regenerate the render, leave `Last synced` | process | None | keep | |
| IS7 | Member roster (hard-coded Clone Force 99 list) | process | None | slim | Duplicates `workforces/clone-force-99.json`; the two can drift. |
| IS8 | Trigger: "auto-trigger at session start" | process | NO; see native-overlap.md, IS8 | enforce | #47. Today it is prose only. |

## `pr-create`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| PR1 | Load work log; read labels and description from the cache | process | None | slim | The cache holds neither. Read from `gh`. |
| PR2 | PR title format and type precedence | convention | None | keep | #42: the `pr_title` fact; `unknown` asks the user and does not guess a format. |
| PR3 | Body: `Closes #`, Summary, Test plan | process | None | keep | #44: bcp's PR shape (the work log and the linked-issue rule depend on `Closes #`), not a repo rule. |
| PR4 | Hard-coded `Generated with Claude Code` footer | shim | YES; see native-overlap.md, PR4 | retire | #44 removed it; the skill says to write none. |
| PR5 | Show proposal, wait for confirmation | process | None | keep | |
| PR6 | `cd` into the worktree, `gh pr create` | process | PARTIAL; see native-overlap.md, PR6 | slim | #44: the process's own command; only the `cd` guard is bcp-specific. |
| PR7 | "Issue cache — nothing to do" section | process | None | retire | Same as WX13. |
| PR8 | Append `## PR` to the work log | process | None | enforce | #31 |
| PR9 | Update mission file | process | None | keep | |
| PR10 | Final checklist sync, flag open items | process | None | keep | |
| PR11 | Confirm says "Issue cache updated" | process | None | slim | Contradicts PR7; nothing is updated. |
| PR12 | Issue linked in the PR (`Closes #`) | convention | None | enforce | #46 as CI. Prose only today. |
| PR13 | Trigger: phrases ("pushed") | process | None | enforce | #43 |

## `review`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| RV1 | Skip rule for trivial batches | process | None | keep | |
| RV2 | Phase 1: read the full diff | process | YES; see native-overlap.md, RV2 | keep |  |
| RV3 | Phase 2: Rich Hickey lens | process | None | keep | Personal process; stays. |
| RV4 | Phase 3: recommendations with effort | process | None | keep | |
| RV5 | Phase 4: one final line | process | None | keep | |
| RV6 | Name and invocation (`/review`, self-invoked before commit) | process | NO collision; see native-overlap.md, RV6 | keep | #39 decides rename. Nothing makes the member run it. |

## `setup-contribution`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| SC1 | Detect upstream repo | process | None | keep | Manual only (`disable-model-invocation`). |
| SC2 | Detect GitHub identity and fork owner | process | None | keep | |
| SC3 | Fetch our open PRs | process | None | keep | |
| SC4 | List worktrees, match to PRs | process | None | keep | |
| SC5 | Fetch open issues | process | None | keep | |
| SC6 | Assess and categorise issues | process | None | keep | |
| SC7 | Locate memory directory, merge existing `MEMORY.md` | process | None | keep | |
| SC8 | Write `project_open_prs.md`, `project_issues.md`, `MEMORY.md` | process | None | move | Writes `project_issues.md` as a hand-kept store in a different format from `issues`, which rebuilds it wholesale. Also writes the shared `MEMORY.md` the issue skills avoid. #40 decided the work-log location only; this stays open. |
| SC9 | Hard-coded conventions in the `MEMORY.md` template (`npm install --legacy-peer-deps`, "write failing test first", `master`) | convention | None | move | #42 |
| SC10 | Report summary | process | None | keep | |

## Commands

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| MS1 | `/missions`: report by workforce member, all repos | process | None | keep | |
| MY1 | `/missions-sync`: fetch label events, rewrite `Started` / `Completed` | process | None | keep | |
| MY2 | `DEFAULT_REPO="BANCS-Norway/home"` fallback | convention | None | move | A personal repo name in a global plugin. Drop the fallback and warn instead. |
| WF1 | `/workforce` status, list | process | None | keep | |
| WF2 | `/workforce` set (bundled), update, reset | process | None | keep | |
| WF3 | `/workforce` set `<owner/repo>` (fetch external roster) | process | None | keep | Validation checks shape only; a remote `style` becomes instructions the agent adopts. |

## Hook

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| HK1 | `SessionStart`: seed `~/.claude/bcp/workforce.json` from the bundled default | shim | NO; see native-overlap.md, HK1 | keep | #28 ports it to `.mjs`; #35 extends it with the version compare. |
| HK2 | Drain the stdin payload | shim | NO; see native-overlap.md, HK2 | keep | #28 replaces it with a shared payload helper. No retirement condition, so outside the shim review (#36). |

## Not steps, but missing

These are rules the brief wants enforced that no skill or hook performs today:

- Tests before commit (#45)
- `review` run before a non-trivial commit (RV6)
- Work-log update after each batch, as a check rather than a prose instruction (#31)
- `issues` at session start (IS8, #47)
