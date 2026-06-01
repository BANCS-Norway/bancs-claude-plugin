# Workforces

A **workforce** is a roster of agent personas the bcp engine assigns to issues and
adopts as a working style. The engine is theme-agnostic: it reads whichever workforce
is *active* and never hardcodes specific names.

- **Active workforce:** `~/.claude/bcp/workforce.json` (seeded on first session from the
  bundled default; switch it with `/bcp:workforce`).
- **Bundled workforces:** `workforces/*.json` in this plugin, catalogued by
  `workforces/index.json`.
- **Schema:** `workforces/workforce.schema.json`.

## Switching workforces

```text
/bcp:workforce                      show the active workforce + bundled options
/bcp:workforce set neutral          activate a bundled workforce
/bcp:workforce set you/repo cf99    pull a workforce from any GitHub repo
/bcp:workforce update               re-fetch the active one from its source
/bcp:workforce reset                restore the bundled default
```

Bundled switches need no network or external tools. Pulling from a public repo uses
Claude's `WebFetch`; private repos use `gh` if it's installed and authenticated.

## Bundled workforces

| id | name | notes |
| --- | --- | --- |
| `clone-force-99` | Clone Force 99 | Default. Star Wars / *The Bad Batch* novelty theme — Disney/Lucasfilm IP, see [DISCLAIMER.md](./DISCLAIMER.md). |
| `neutral` | Default Agents | IP-free, same role coverage. |

## Authoring a workforce

A workforce file is JSON:

```jsonc
{
  "id": "my-team",                 // kebab-case, unique
  "name": "My Team",
  "description": "…",
  "private": false,                // hint: contains restricted content?
  "members": [
    {
      "id": "fixer",               // kebab-case → mission directory name
      "label": "🎯 Fixer",          // emoji + name, shown in reports
      "designation": "",           // optional badge (e.g. CT-9904)
      "role": "Precision",         // optional
      "bestFor": "precision bug fixes, surgical changes",   // used for assignment
      "deployPhrase": "Fixer, take the shot.",              // optional flavor
      "motto": "Smallest change that works.",               // optional flavor
      "style": "Surgical, minimal blast radius, one precise change at a time"
    }
  ]
}
```

Required per member: `id`, `label`, `bestFor`, `style`. The engine assigns the member
whose `bestFor` best matches an issue, writes missions under
`~/.claude/missions/{id}/`, and adopts `style` for the session.

## Publishing a workforce repo

Any GitHub repo can host workforces so `/bcp:workforce set owner/repo [name]` can pull
them. Layout the command understands:

```text
your-workforces-repo/
  workforces/
    index.json          # optional catalog (default + list), same shape as ours
    my-team.json
  workforce.json        # optional single roster at repo root
```

Keep private/themed rosters in a private repo; `gh` auth handles access.

## Switching mid-stream

Changing the workforce does **not** rename existing `~/.claude/missions/{id}/`
directories. `/bcp:missions` lists whatever directories exist, labelling known member
ids from the active workforce and showing unknown ones by their raw id.
