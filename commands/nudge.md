---
description: Record a manual correction ("you skipped the tests") against a process step and this repo, or report the nudges so far. Three nudges on one step in a repo mark it as withered.
argument-hint: [<step> [note]]
allowed-tools: Bash
---

# /bcp:nudge — record or report manual corrections

A **nudge** is a correction you had to give by hand because a process step was skipped.
They are kept in `~/.claude/bcp/nudges.jsonl`, per step and repo. Three nudges on one step
in one repo mark that step as **withered**.

Steps: `tests`, `work-log`, `checklist-sync`, `commit-guide`, `issue-link`, `review`, `issues`.

Run this exactly as written. The script reads the arguments itself: with none it reports, with
`<step> [note]` it records. Do not edit, correct or translate the arguments, and do not retry with
a different step if the script refuses one; it knows the steps and says so.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/nudge.mjs" <<'ARGS'
$ARGUMENTS
ARGS
```

Show its output as it is. If `${CLAUDE_PLUGIN_ROOT}` is unset (not run as an installed plugin),
say the command needs bcp installed and stop.
