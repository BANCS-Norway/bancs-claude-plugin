# Native overlap note

For each shim row in [skill-step-audit.md](skill-step-audit.md): the native Claude Code feature it overlaps, a docs link, a verdict, and a proposed `retire-when`. Output of
[#26](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/26), point 2 of the bcp review.

**Every row under Shim rows carries `retire-when` and `checked: YYYY-MM`** (`npm run validate` enforces both, [#36](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/36)). After a Claude Code update, a session in the bcp repo lists the rows checked before that month; `/bcp:shim-review` walks them and sets `checked` whatever the decision.

**Method.** Each claim comes from the Claude Code docs and changelog, read 2026-11-09 by a research subagent that had to cite a URL per claim and mark anything the docs don't state as `CANNOT-CONFIRM`. Afterwards the author had a second reader re-read, verbatim, the whole worktrees guide and the settings-reference sections for `attribution`, `attribution.commit`, `attribution.pr`, `worktree.baseRef` and `worktree.symlinkDirectories`; those claims are confirmed and the settings headings exist (anchor slugs come from the page's own index links). Everything else rests on the first report only. Re-check a link before acting on a verdict that retires a step.

**Verdicts.** `YES` native covers it · `PARTIAL` native covers part of it · `NO` no native equivalent · `CANNOT-CONFIRM` the docs don't say.

Docs base: `https://code.claude.com/docs/en/`

## Shim rows

### WC6a — `git worktree add` (worktree-create)

- **Native:** `claude --worktree <name>` and subagent `isolation: worktree`. [worktrees](https://code.claude.com/docs/en/worktrees.md#start-claude-in-a-worktree) (2.1.49, 2.1.50)
- **Verdict:** PARTIAL. Native creates `.claude/worktrees/<name>/` on a branch named `worktree-<name>`. `worktree.baseRef` accepts only `"fresh"` (origin's default branch) or `"head"`; the docs say "You can't set `worktree.baseRef` to a branch name." [baseRef](https://code.claude.com/docs/en/worktrees.md#choose-the-base-branch)
- **Gap it fills:** bcp's `{type}/{NNN}_{slug}` branch names and a chosen base branch cannot be expressed natively.
- **retire-when:** native worktrees accept a caller-chosen branch name, or bcp adopts `worktree-<name>` naming and the `fresh` base.
- **checked:** 2026-11

### WC9 — `node_modules` symlink or `npm ci` (worktree-create)

- **Native:** `.worktreeinclude` copies gitignored files that match its patterns. [worktrees](https://code.claude.com/docs/en/worktrees.md#copy-gitignored-files-into-worktrees) The separate setting `worktree.symlinkDirectories` symlinks listed directories into each worktree. [settings](https://code.claude.com/docs/en/settings-reference.md#worktree-symlinkdirectories)
- **Verdict:** PARTIAL. `.worktreeinclude` copies; it has no `# link:` or `## links` syntax. The brief's symlink-in-`.worktreeinclude` idea would be a bcp invention, not a native feature. `worktree.symlinkDirectories` is the native symlink route.
- **CANNOT-CONFIRM:** whether either mechanism applies to a worktree made by plain `git worktree add`, which is how bcp creates them: neither the worktrees guide nor the settings page says. The introduction version of both is also unconfirmed.
- **retire-when:** bcp creates worktrees through the native path (see WC6a), or the docs confirm `worktree.symlinkDirectories` applies to worktrees made with git.
- **checked:** 2026-11

### WC5b — preflight before creating a worktree (worktree-create, #42)

- **Native:** `--worktree` reuses a worktree of the same name instead of creating a second, refuses a worktree "leftover" or one that belongs to a different repository, and starts from origin's default branch, falling back to local HEAD when origin/HEAD is neither cached nor fetchable. [reuse](https://code.claude.com/docs/en/worktrees.md#reuse-a-worktree-name), [base](https://code.claude.com/docs/en/worktrees.md#choose-the-base-branch) The changelog adds default-branch fixes for bare repositories (2.1.300, 2.1.305).
- **Verdict:** PARTIAL. The docs do not describe a check for a branch name that already exists locally or on origin, an open PR already covering the issue, a missing default branch (the fallback to local HEAD is silent, so the base can be a feature branch), or an unauthenticated `gh`. Checked against the worktrees page and the changelog through 2.1.322; the cli-reference and tools-reference pages were only partly readable.
- **Gap it fills:** `scripts/worktree-preflight.mjs` runs those four checks and the path check before any worktree, branch or label is created, and says which base to use.
- **retire-when:** native worktree creation refuses a taken branch name and reports an existing PR for the issue, and no longer falls back silently to local HEAD.
- **checked:** 2026-11

### WX5a — warn about uncommitted changes before removal (worktree-cleanup)

- **Native:** on exit, Claude checks for "changed or untracked files, uncommitted work inside checked-out submodules, and new commits", and a dirty worktree prompts keep or remove. [clean up](https://code.claude.com/docs/en/worktrees.md#clean-up-worktrees)
- **Verdict:** PARTIAL. The docs say "These rules apply to worktrees Claude created with git", and that a worktree you made yourself with `git worktree add` is kept by the sweep. bcp creates its worktrees with `git worktree add` and removes them after a merge, from a session that is usually in the main checkout, so the native exit check does not reach them.
- **retire-when:** bcp creates its worktrees natively (see WC6a) and works inside them until exit, or the docs extend the exit check to git-made worktrees.
- **checked:** 2026-11

### WX6, WX7 — `git worktree remove`, `git branch -d` (worktree-cleanup)

- **Native:** removing on exit deletes "the worktree directory and its branch". Subagent worktrees with no changes are removed automatically, and a periodic sweep removes old ones after `cleanupPeriodDays`. [clean up](https://code.claude.com/docs/en/worktrees.md#clean-up-worktrees), [subagents](https://code.claude.com/docs/en/worktrees.md#clean-up-subagent-and-background-session-worktrees)
- **Verdict:** PARTIAL. Nothing in the docs removes a worktree when its PR merges. The sweep removes stale agent worktrees whose PR was squash-merged (2.1.105), which covers subagent and background worktrees only. [reuse](https://code.claude.com/docs/en/worktrees.md#reuse-a-worktree-name)
- **retire-when:** native removes a session worktree and its branch when the linked PR merges.
- **checked:** 2026-11

### CG6, PR4 — hard-coded `Generated with Claude Code` and `Co-Authored-By` footers (commit-guide, pr-create)

- **Native:** the `attribution` setting. `attribution.commit` defaults to `Co-Authored-By: <model name> <noreply@anthropic.com>`; `attribution.pr` defaults to the `Generated with Claude Code` line; an empty string hides either. `includeCoAuthoredBy` is deprecated (2.0.62). [attribution](https://code.claude.com/docs/en/settings-reference.md#attribution)
- **Verdict:** YES. Both footers are redundant with the native lines.
- **Caveat:** the docs don't say how a footer written into a skill's text interacts with `attribution`. Removing the footer from the skill text and setting `attribution` is the clean route.
- **retire-when:** now.
- **checked:** 2026-11

### PR6 — `cd` into the worktree, `gh pr create` (pr-create)

- **Native:** PR creation is documented as asking Claude to "create a pr". [common workflows](https://code.claude.com/docs/en/common-workflows.md#create-pull-requests)
- **Verdict:** PARTIAL. The docs don't confirm that `gh` is used. The `cd` guard against working-directory drift is bcp-specific.
- **retire-when:** only the `cd` guard remains; retire it if Claude Code keeps the shell in the session's worktree.
- **checked:** 2026-11

### HK1 — SessionStart seeds `~/.claude/bcp/workforce.json` (hook)

- **Native:** `${CLAUDE_PLUGIN_DATA}` is a directory that survives updates, created on first reference (2.1.78). The docs' own first-run pattern is a SessionStart hook that copies files into it. There is no post-install hook; a `Setup` hook fires only with `--init-only`, `--init` or `--maintenance`. [plugin paths](https://code.claude.com/docs/en/plugins/components.md#reference-plugin-paths-and-store-data), [setup](https://code.claude.com/docs/en/hooks.md#setup)
- **Verdict:** NO equivalent that removes the hook. The hook is the documented pattern. bcp writes to `~/.claude/bcp/` instead of `${CLAUDE_PLUGIN_DATA}`; moving the active workforce there is an option, not a requirement.
- **fills-gap:** plugins have no post-install step to seed user-level data.
- **retire-when:** Claude Code adds a post-install hook or a plugin default-data mechanism.
- **checked:** 2026-11

### HK3 — SessionStart notices a new Claude Code version (hook, #35)

- **Native:** none for hooks. The SessionStart input carries no version ([sessionstart input](https://code.claude.com/docs/en/hooks.md#sessionstart-input); a real 2.1.322 payload had only `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `source`), and no documented hook environment variable holds it ([command hook fields](https://code.claude.com/docs/en/hooks.md#command-hook-fields)). Claude Code shows its own release notes after an update, but nothing tells a plugin which version it ran under last time.
- **Verdict:** NO equivalent. The hook runs `$CLAUDE_CODE_EXECPATH --version` (undocumented variable, seen in 2.1.322: the path of the running binary), else `claude --version`.
- **fills-gap:** hooks receive no Claude Code version.
- **retire-when:** the hook input or a documented environment variable carries the Claude Code version; then read it instead of spawning the binary.
- **checked:** 2026-11

## Other native-relevant rows

Rows that touch a native feature but can never retire. CG1/CG8 and HK2 were shim rows until #36 moved them here: they have no retirement condition, so the monthly shim review would only ask about them again.

### CG1, CG8 — read the diff, `git add` and `git commit` (commit-guide)

- **Native:** built-in commit and PR instructions, which the `includeGitInstructions` setting can remove. [common workflows](https://code.claude.com/docs/en/common-workflows.md#create-pull-requests), [setting](https://code.claude.com/docs/en/settings-reference.md#includegitinstructions)
- **Verdict:** PARTIAL. The docs confirm built-in git instructions exist. They don't confirm the exact status/diff steps.
- **retire-when:** not a retirement candidate while the human approves every commit. The slim is to keep only the approval step and rely on native for the mechanics.

### HK2 — drain the stdin payload (hook)

- **Native:** none. **Verdict:** NO equivalent. Handled by #28's shared payload helper.
- **retire-when:** not applicable.

### WC6b, WC7 — `.worktrees/` location and the `main` base

- **bcp (#42):** the base is no longer hard-coded; `worktree-create` takes it from the preflight (`default_branch` in the project context), and the other skills read the same fact.

- Native location is `.claude/worktrees/`, and the native base is origin's default branch (`fresh`) or local HEAD (`head`). #37 decides the location. WC7 can use `fresh` natively only when bcp uses the native path.

### RV2, RV6 — `review` and native `/review`

- **Native:** `/review` is a built-in alias of the bundled `/code-review` skill (2.1.223). [commands](https://code.claude.com/docs/en/commands.md) A project skill named `code-review` replaces `/code-review`, but "the bundled alias `/review` never runs your skill". [skills](https://code.claude.com/docs/en/skills.md#resolve-skills-that-share-a-name)
- **Plugin skills** are namespaced `/<plugin>:<skill>`, so bcp's skill is `/bcp:review` and does not take over `/review`. [components](https://code.claude.com/docs/en/plugins/components.md#skills)
- **Verdict:** the name collision the brief worried about does not occur for a plugin skill. Whether the model confuses the two in practice is still open (#39).
- **CANNOT-CONFIRM:** what a user skill named bare `review` does.

### IS8 — SessionStart running the `issues` skill

- **Native:** none. A SessionStart hook can return `additionalContext`, `sessionTitle`, `watchPaths` and `reloadSkills`. `initialUserMessage` becomes a first message only in non-interactive `-p` mode. The docs warn that imperative text framed as system commands may trigger prompt-injection defenses, so context should read as facts. [SessionStart](https://code.claude.com/docs/en/hooks.md#sessionstart-decision-control)
- **Verdict:** NO. A hook cannot invoke a skill. #47 has to inject context that makes the member run `issues`, not call it.

### WC17, WR8 — phrase triggers and `--resume`

- **Native:** skills auto-load from their `description`, and `disable-model-invocation: true` stops that. [skills](https://code.claude.com/docs/en/skills.md) `--resume` and `--continue` restore the conversation, model and permission mode, and return a session that ended in a worktree to it (2.1.81). They do not restore issue or work-log state. [sessions](https://code.claude.com/docs/en/sessions.md#what-a-resumed-session-restores), [worktrees](https://code.claude.com/docs/en/worktrees.md#resume-a-worktree-session)
- **Verdict:** `worktree-resume` is not a shim; it rebuilds the state native resume does not carry.
