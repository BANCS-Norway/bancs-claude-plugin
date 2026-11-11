// Shared helpers for bcp hooks. Convention: docs/hook-conventions.md.
import { readFileSync } from 'node:fs';

/**
 * Parse the hook event payload Claude Code delivers on stdin. Never throws.
 * Empty input yields `{}` (a valid payload with no fields); input that is not JSON, or
 * not a JSON object, yields `null`, which `shouldRun` rejects.
 */
export function readPayload(fd = 0) {
  let text;
  try {
    text = readFileSync(fd, 'utf8');
  } catch {
    return null;
  }
  if (text.trim() === '') return {};
  try {
    const payload = JSON.parse(text);
    return payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

/** The file a tool call targets, with Windows backslashes turned into `/`. */
export function toolPath(payload) {
  const input = payload?.tool_input ?? {};
  const p = input.file_path ?? input.path ?? input.notebook_path;
  return typeof p === 'string' ? p.replaceAll('\\', '/') : undefined;
}

/** The shell command a Bash tool call runs, or undefined when the payload has none. */
export function toolCommand(payload) {
  const c = payload?.tool_input?.command;
  return typeof c === 'string' ? c : undefined;
}

/**
 * The early filter. Call it first and exit 0 when it returns false.
 *
 * - A `null` payload (see `readPayload`) never runs.
 * - `event`: skip when the payload names a different `hook_event_name`. A payload
 *   that names none still passes; hooks.json already registers the hook per event.
 * - `path`: a RegExp tested against `toolPath(payload)`. A payload with no path fails.
 * - `command`: a RegExp tested against `toolCommand(payload)`. A payload with no command fails.
 */
export function shouldRun(payload, { event, path, command } = {}) {
  if (!payload) return false; // unreadable payload: do nothing
  if (event && payload.hook_event_name && payload.hook_event_name !== event) return false;
  if (path) {
    const p = toolPath(payload);
    if (p === undefined || !path.test(p)) return false;
  }
  if (command) {
    const c = toolCommand(payload);
    if (c === undefined || !command.test(c)) return false;
  }
  return true;
}
