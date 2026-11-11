# Hook conventions

Rules for every hook bcp ships. They keep hooks portable, cheap on every tool call, and
consistent with each other. `npm run validate` enforces the first rule.

## Rules

0. **Native check first.** Run the [native check](native-check.md) and record the hook's
   `fills-gap` in [native-overlap.md](native-overlap.md) before writing it.

1. **Node `.mjs`, invoked through `node`.** A hook is a script under `scripts/` registered in
   `hooks/hooks.json` as:

   ```json
   { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs\"" }
   ```

   No bash. Node is already required (`engines`), needs no `jq`, and handles paths the same on
   every platform.

2. **Filter first, then work.** The first statement of a hook decides whether it applies and
   exits `0` if not. Hooks on tool events (`PreToolUse`, `PostToolUse`) run on every tool call,
   so anything before the filter is paid for each time.

3. **One payload parser.** Read the payload with `readPayload()` from `scripts/lib/hook.mjs`;
   never parse stdin by hand. It returns `{}` for empty input and `null` for anything unreadable;
   `shouldRun` rejects `null`, so a hook does nothing on a payload it cannot read.

4. **Never fail the session.** Exit `0` when something needed is missing. A hook blocks a
   tool call only on purpose, through the documented exit code or decision output.

5. **Test it.** Add cases to `scripts/hooks.test.mjs` (`npm run test:hooks`, run in CI). Run the hook as Claude Code
   does: `node`, payload on stdin, `CLAUDE_PLUGIN_ROOT` and a temporary `HOME` in the environment.

## Shape of a hook

```js
#!/usr/bin/env node
import { readPayload, shouldRun } from './lib/hook.mjs';

const payload = readPayload();
if (!shouldRun(payload, { event: 'PreToolUse', path: /\/MEMORY\.md$/ })) process.exit(0);

// ... the actual work
```

`shouldRun(payload, { event, path })`:

- `event` skips a payload that names a different `hook_event_name`. A payload that names none
  passes, because `hooks.json` already registers the hook per event.
- `path` is a RegExp tested against the file the tool call targets
  (`tool_input.file_path`, `path` or `notebook_path`), with Windows backslashes turned into `/`.
  A payload with no path fails.
- `command` is a RegExp tested against the shell command of a Bash tool call
  (`tool_input.command`). A payload with no command fails. Use it as a cheap first cut, then
  check the command properly in the hook; `hooks.json` can pre-filter too with
  `"if": "Bash(git commit *)"`, which the docs call best-effort.
