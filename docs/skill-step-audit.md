# Skill step audit

One row per step across the 8 skills, 3 commands and the hook (bcp v1.0.3). Output of
[#25](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/25), point 1 of the bcp review.

## How to read this

**Owner** — who should maintain the step:

- **shim** — fills a gap in Claude Code. Should be retired once native covers it.
- **process** — personal workflow (workforce, work logs, missions, the Hickey review). Stays; only how it is triggered may change.
- **convention** — a rule that belongs to the repo (base branch, commit types, label names, PR format, direnv). Should be read from the repo, not hard-coded here.

A step that mixes owners is split into separate rows. Each row has exactly one owner.

**Native overlap** — what Claude Code already does. A claim prefixed `unverified:` is recalled, not checked; #26 checks every shim claim against the docs and adds links and `retire-when`. Unprefixed claims come from the review brief or are plain absence.

**Action** — `keep` · `slim` (shorten or replace part) · `retire` · `move` (to repo conventions) · `enforce` (hook or CI instead of prose).

The last column names the issue that carries the change, where one exists.

## `worktree-create`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| WC1 | Load issue from `project_issues.md`, fall back to `gh issue view` | process | None | slim | Cache holds only `#`, `Updated`, `Title`, `PR?`. Labels and member are never there, so this always falls through to `gh`. |
| WC2 | Assign a member from the active workforce | process | None | keep | |
| WC3 | Map labels to branch type; `.github/` override | convention | None | move | #42 |
| WC4 | Slug rules, `{type}/{NNN}_{slug}` naming | convention | None | move | #42 |
| WC5 | Confirm names with the user | process | None | keep | |
| WC6a | `git worktree add` | shim | `--worktree`, subagent `isolation: worktree` | slim | #37 |
| WC6b | Worktree location `.worktrees/` | convention | `.claude/worktrees/` is the native location | move | #37 decides `.worktrees/` vs native path |
| WC7 | Branch from hard-coded `main` | convention | Default branch is available from git | move | #42 |
| WC8 | `direnv allow` in the new worktree | convention | None | move | #42. Only applies where `.envrc` exists. |
| WC9 | Symlink `node_modules` or `npm ci` | shim | `.worktreeinclude` (copy of ignored files; symlinks via `# link:` per the brief) | slim | #37. Node-only. |
| WC10 | Add label `status: in progress` | convention | None | move | #42. Label name is repo-specific. |
| WC11 | Create mission file | process | None | keep | Overlaps WC12 in content (objective, progress). Revisit with #40. |
| WC12 | Create `memory/issues/{NNN}/log.md` | process | Claude Code project memory shares the same folder | move | #40 |
| WC13 | Seed `CHECKLIST.md`, add worktree-local exclude | process | None | keep | |
| WC14 | Wrap issue-body checklist in markers (`checklist-sync.mjs`) | process | None | keep | |
| WC15 | Activate member style | process | None | keep | |
| WC16 | "Ready" confirmation | process | None | keep | |
| WC17 | Trigger: phrases ("let's do #215") | process | unverified: skill descriptions load natively | keep | #43 tags the skill |

## `worktree-resume`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| WR1 | Load work log, fall back to legacy `issue-{NNN}.md` | process | None | move | #40. Legacy fallback must keep working. |
| WR2 | `git -C` status, log, diff, stash | process | None | keep | #23: `git -C` is blocked by permission rules; use `cd`. |
| WR3 | Check GitHub for comments, labels, state | process | None | keep | |
| WR4 | Reconcile local `CHECKLIST.md` with issue body | process | None | keep | |
| WR5 | Activate member (cache as fallback) | process | None | slim | Cache never holds the member; drop the fallback. |
| WR6 | Brief the user | process | None | keep | |
| WR7 | Update `Current State` in the work log | process | None | enforce | #31 |
| WR8 | Trigger: phrases ("resume #NNN") | process | unverified: native `--resume` / `--continue` restore a conversation, not issue state | keep | #43 |

## `worktree-cleanup`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| WX1 | Identify the merged PR (`gh pr list --state merged`) | process | None | keep | |
| WX2 | Load work log, legacy fallback | process | None | move | #40. Legacy fallback must keep working. |
| WX3 | Verify issue and PR state on inconsistency | process | None | keep | |
| WX4 | Detect resume mode (worktree/branch already gone) | process | None | keep | |
| WX5a | Warn about uncommitted changes before removal | shim | unverified: native exit prompt covers dirty-worktree removal | slim | #38 |
| WX5b | Audit `CHECKLIST.md` for unresolved items, wait for confirmation | process | None | keep | |
| WX6 | `git worktree remove` | shim | unverified: native worktree cleanup (partial) | slim | #38 |
| WX7 | `git branch -d`, `-D` after PR check | shim | unverified: native worktree cleanup (partial) | slim | #38 |
| WX8 | Remove label `status: in progress` | convention | None | move | #42 |
| WX9 | Verify the issue closed, leave it open if not | process | None | keep | |
| WX10 | Complete mission and move to `done/` | process | None | keep | |
| WX11 | Tick PR test-plan boxes | process | None | keep | |
| WX12 | Remove `memory/issues/{NNN}/` (and legacy file) | process | None | move | #40 |
| WX13 | "Issue cache — nothing to do" section | process | None | retire | A step that says do nothing. Keep one line in the design note. |
| WX14 | Confirm summary | process | None | keep | |
| WX15 | Trigger: phrases ("merged", "cleanup") | process | None | enforce | #43 tags it; a merged-PR check could replace the phrase. |

## `commit-guide`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| CG1 | `git diff`, `git diff --staged`, `git status` | shim | unverified: native commit flow reads the same | slim | |
| CG2 | Commit types (`feat`, `fix`, `style`, ...) | convention | None | move | #41 reads commitlint / release config |
| CG3 | Version-bump table "VitePress site changes only" | convention | None | move | #41, closes #22. Describes another repo's site; bcp uses semantic-release. |
| CG4 | Optional scope | convention | None | move | #41 |
| CG5 | Message body, `Part of #{NNN}` trailer | convention | None | move | #41 |
| CG6 | Hard-coded `Generated with Claude Code` / `Co-Authored-By` footer | shim | unverified: native attribution setting | retire | Conflicts with the attribution the harness supplies. |
| CG7 | Show proposal, wait for approval | process | None | keep | Human approves every commit. |
| CG8 | `git add` and `git commit` | shim | unverified: native commit flow | slim | |
| CG9 | Append batch to the work log | process | None | enforce | #31 |
| CG10 | Ask which checklist items resolved, sync to issue body | process | None | keep | |
| CG11 | Comment on the issue for descoped items | process | None | enforce | #32 |
| CG12 | Trigger: phrases ("looks good", "approve") | process | None | enforce | #43; #45 for the commit-time rules |

## `issues`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| IS1 | Derive project slug and memory path | process | Mirrors Claude Code's own project-folder scheme | keep | #40 decides whether the folder stays shared. |
| IS2 | Regenerate `project_issues.md` from `gh` (two calls, atomic write) | process | None | keep | |
| IS3 | Scan `memory/issues/*/log.md`, run `git worktree list` | process | None | move | #40 |
| IS4 | Assess and prioritise a 3–5 item shortlist | process | None | keep | Judgment; stays prose. |
| IS5 | Present shortlist, wait for the pick | process | None | keep | |
| IS6 | New issue: regenerate the render, leave `Last synced` | process | None | keep | |
| IS7 | Member roster (hard-coded Clone Force 99 list) | process | None | slim | Duplicates `workforces/clone-force-99.json`; the two can drift. |
| IS8 | Trigger: "auto-trigger at session start" | process | unverified: `SessionStart` hook can run it | enforce | #47. Today it is prose only. |

## `pr-create`

| ID | Step | Owner | Native overlap | Action | Issue / note |
| --- | --- | --- | --- | --- | --- |
| PR1 | Load work log; read labels and description from the cache | process | None | slim | The cache holds neither. Read from `gh`. |
| PR2 | Title `{type}({scope}): ...` and type precedence | convention | None | move | #42 |
| PR3 | Body: `Closes #`, Summary, Test plan | convention | None | move | #42 |
| PR4 | Hard-coded `Generated with Claude Code` footer | shim | unverified: native attribution setting | retire | |
| PR5 | Show proposal, wait for confirmation | process | None | keep | |
| PR6 | `cd` into the worktree, `gh pr create` | shim | unverified: native PR creation via `gh` | slim | Only the `cd` guard is bcp-specific. |
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
| RV2 | Phase 1: read the full diff | process | unverified: native `/review` reads a diff | keep | |
| RV3 | Phase 2: Rich Hickey lens | process | None | keep | Personal process; stays. |
| RV4 | Phase 3: recommendations with effort | process | None | keep | |
| RV5 | Phase 4: one final line | process | None | keep | |
| RV6 | Name and invocation (`/review`, self-invoked before commit) | process | Name collides with native `/review` | keep | #39 decides rename. Nothing makes the member run it. |

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
| SC8 | Write `project_open_prs.md`, `project_issues.md`, `MEMORY.md` | process | None | move | Writes `project_issues.md` as a hand-kept store in a different format from `issues`, which rebuilds it wholesale. Also writes the shared `MEMORY.md` the issue skills avoid. #40 |
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
| HK1 | `SessionStart`: seed `~/.claude/bcp/workforce.json` from the bundled default | shim | Verify in #26 whether plugin data storage covers this | keep | #28 ports it to `.mjs`; #35 extends it with the version compare. |
| HK2 | Drain the stdin payload | shim | None | keep | #28 replaces it with a shared payload helper. |

## Not steps, but missing

These are rules the brief wants enforced that no skill or hook performs today:

- Tests before commit (#45)
- `review` run before a non-trivial commit (RV6)
- Work-log update after each batch, as a check rather than a prose instruction (#31)
- `issues` at session start (IS8, #47)
