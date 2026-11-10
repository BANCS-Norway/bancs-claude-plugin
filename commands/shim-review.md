---
description: Review the bcp shims that have not been checked since the last Claude Code update, against their retire-when, and mark each one checked whatever the outcome.
argument-hint: [all]
allowed-tools: Bash, Read
kind: process
checked: 2026-11
---

# /bcp:shim-review — recheck the shims after a Claude Code update

A **shim** fills a gap in Claude Code and should go once Claude Code covers it. Each one has a
`retire-when` and a `checked` month: a row under `## Shim rows` in `docs/native-overlap.md`, or a
skill or command with `kind: shim`. A shim is **stale** when its `checked` month is before the
last Claude Code version change. Run this in the bcp repo; it edits that checkout.

## 1. List

Run this exactly as written. The script reads the arguments itself (none: the stale shims;
`all`: every shim). Do not edit or correct them.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/shim-review.mjs" <<'ARGS'
$ARGUMENTS
ARGS
```

If it reports none, say so and stop. If `${CLAUDE_PLUGIN_ROOT}` is unset (not run as an
installed plugin), say the command needs bcp installed and stop.

## 2. Review each shim, one at a time

For each listed shim, follow [docs/native-check.md](../docs/native-check.md): check the Claude
Code docs and changelog for whether its `retire-when` now holds, citing what you found. Then
ask the user for one decision:

- **keep**: still needed as it is;
- **slim**: native now covers part of it;
- **retire**: native covers it.

For slim or retire, offer to open an issue for the change; do not edit the skill or hook here.
If the finding changes the shim's row or frontmatter text (a new native feature, a new
`retire-when`), propose that edit to the user.

## 3. Mark

Reviewing a shim updates its `checked` month whatever the decision. After the user has decided
on a shim, mark it, using the id exactly as the list printed it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/shim-review.mjs" <<'ARGS'
mark <id>
ARGS
```

Do not mark a shim the user has not decided on. At the end, sum up each shim's decision and
leave the changed files for the user to commit.
