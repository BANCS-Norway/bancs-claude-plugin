---
description: List, switch, or update the active bcp workforce (the roster of agent personas the engine assigns to issues). Bundled packs need no network; you can also pull a workforce from any GitHub repo.
argument-hint: [list | set <name> | set <owner/repo> [name] | update | reset] 
allowed-tools: Bash, Read, Write, WebFetch
---

# /bcp:workforce — manage the active workforce

A **workforce** is a roster of agent personas (`members[]`) that the bcp engine
assigns to issues and adopts as a working style. The **active** workforce lives at
`~/.claude/bcp/workforce.json`. **Bundled** workforces ship with the plugin under
`${CLAUDE_PLUGIN_ROOT}/workforces/`.

Parse `$ARGUMENTS` and run the matching action. With no arguments, run **status**.

## Resolve paths first

```bash
WF_DIR="${CLAUDE_PLUGIN_ROOT}/workforces"
ACTIVE="$HOME/.claude/bcp/workforce.json"
mkdir -p "$HOME/.claude/bcp"
```

If `${CLAUDE_PLUGIN_ROOT}` is unset (not run as an installed plugin), tell the user
the command must run from within Claude Code with bcp installed, and stop.

## status  (no arguments)

1. Read `$ACTIVE` if it exists; report its `name` and list each member as
   `label — bestFor`. If it records a `_source`, show where it came from.
2. If `$ACTIVE` is missing, say so and seed it (same as `reset`).
3. Read `$WF_DIR/index.json` and list the **bundled** workforces (`id` — `description`),
   marking the active one.
4. Remind the user of the verbs: `set <name>`, `set <owner/repo> [name]`, `update`, `reset`.

## list [owner/repo]

- **No repo:** list bundled workforces from `$WF_DIR/index.json`.
- **With `owner/repo`:** fetch that repo's `workforces/index.json` (see *Fetching from
  a repo* below) and list its entries. If it has no index, list any `workforces/*.json`
  files you can discover, or fall back to a single `workforce.json` at the repo root.

## set <name>   (bundled)

When the argument is a bare name (no `/`):

1. Look it up in `$WF_DIR/index.json` → resolve to `$WF_DIR/<file>`.
2. Read the JSON, validate it has `id`, `name`, and a non-empty `members[]`.
3. Write it to `$ACTIVE`, adding `"_source": {"type": "bundled", "id": "<name>"}`.
4. Confirm: print the new active workforce name and its member labels.

## set <owner/repo> [name]   (external)

When the first argument contains `/`:

1. Fetch the roster from the repo (see *Fetching from a repo*). If `[name]` is given,
   fetch `workforces/<name>.json`; otherwise try `workforces/index.json`'s default,
   then `workforce.json` at the repo root.
2. Validate the JSON as above. Refuse anything without a valid `members[]`.
3. Write it to `$ACTIVE` with
   `"_source": {"type": "repo", "repo": "<owner/repo>", "name": "<name|default>", "ref": "<branch-or-default>"}`.
4. Confirm as above.

## update

Re-fetch the active workforce from its recorded `_source` and overwrite `$ACTIVE`:

- `bundled` → re-copy from `$WF_DIR/<id>.json`.
- `repo` → re-fetch from the same repo/name/ref.
- no `_source` → tell the user there's nothing to update from; suggest `set`.

## reset

Seed the bundled default: read `index.json`'s `default`, copy that file to `$ACTIVE`
with `_source: {type:"bundled", id:"<default>"}`. Confirm.

## Fetching from a repo (graceful, dependency-light)

Try these in order and stop at the first that works:

1. **Public via WebFetch** — fetch
   `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` (default `ref`:
   `main`, then `master`). This needs no external tools. Use the WebFetch tool and
   parse the returned JSON.
2. **Private via gh** — if WebFetch fails (404/private) and `gh` is available
   (`command -v gh`), run:

   ```bash
   gh api "repos/<owner>/<repo>/contents/<path>?ref=<ref>" --jq '.content' | base64 -d
   ```

   This reuses the user's existing GitHub auth.
3. **Neither worked** — explain clearly: the repo may be private and `gh` isn't
   installed/authenticated, or the path doesn't exist. Do **not** overwrite `$ACTIVE`.

Never write a partial or invalid roster to `$ACTIVE`. Validate before writing, and
on any failure leave the current active workforce untouched.

## Note on members

Changing the workforce changes the **names, labels, and working styles** the engine
uses going forward. It does **not** rename existing mission directories under
`~/.claude/missions/` — those stay under whatever member id created them. If you
switch workforces mid-stream, `/bcp:missions` will simply list the directories it
finds, labelling known ids and showing unknown ones by their raw id.
