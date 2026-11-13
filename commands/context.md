---
description: Show the project facts bcp detected once (release, direnv, CI directory, default branch, test command, repo, PR title format, commit types, in-progress label), confirm one, correct one, or reset one.
argument-hint: [show | get <fact> | confirm <fact> [value] | reset <fact>]
allowed-tools: Bash
kind: process
checked: 2026-11
---

# /bcp:context — the facts every gate reads

The gates (the skills) used to guess what kind of project they ran in, and repeated a wrong guess
on every run. bcp now detects nine facts once per project and records them in the project's memory
folder (`project_context.md`), where every gate reads the same answer:

`release` (`semantic-release`, `release-please`, `vitepress`, `none` or `unknown`, and which commit types bump a
version), `direnv`, `ci_dir`, `default_branch`, `test_command`, `repo`, `pr_title`, `commit_types` and
`in_progress_label`.

A fact that cannot be detected is `unknown`; it is never a guess. A detected fact is **unconfirmed**
and is detected again when the files it came from change. A **confirmed** fact is never touched by
detection: confirm one when you have checked it, or give the right value when detection is wrong.

Run this exactly as written. The script reads the arguments itself: none or `show` prints every
fact, `get <fact>` one, `confirm <fact> [value]` pins the detected value or sets yours,
`reset <fact>` forgets one so it is detected again. Do not edit, correct or translate the
arguments, and do not retry with a different fact or value if the script refuses one; it knows the
facts and the values each accepts, and says so.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/project-context.mjs" <<'ARGS'
$ARGUMENTS
ARGS
```

Show its output as it is. If a fact looks wrong, say how to correct it
(`/bcp:context confirm <fact> <value>`). If `${CLAUDE_PLUGIN_ROOT}` is unset (not run as an
installed plugin), say the command needs bcp installed and stop.
