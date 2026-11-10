// Shims and their review dates. A shim is either a `### ` row under `## Shim rows` in
// docs/native-overlap.md or a skill/command with `kind: shim` (docs/skill-frontmatter.md).
// Pure functions (text in, data or new text out), plus `loadShims` and `bcpCheckout`, which read
// a checkout. Used by the SessionStart hook (#36) and /bcp:shim-review.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './repo.mjs';
import { parseFrontmatter } from './skill-frontmatter.mjs';

export const OVERLAP_FILE = 'docs/native-overlap.md';
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const RETIRE = /^- \*\*retire-when:\*\*\s*(.*)$/;
const CHECKED = /^- \*\*checked:\*\*\s*(.*)$/;

/** The rows under `## Shim rows`: { id, ids, retireWhen, checked, start, end } (line indexes). */
export function parseOverlapShims(text) {
  const lines = text.split('\n');
  const begin = lines.findIndex((l) => l.trim() === '## Shim rows');
  if (begin < 0) return [];
  let end = lines.findIndex((l, i) => i > begin && l.startsWith('## '));
  if (end < 0) end = lines.length;
  const rows = [];
  for (let i = begin + 1; i < end; i++) {
    const h = /^### (.+?) — /.exec(lines[i]);
    if (!h) continue;
    if (rows.length) rows.at(-1).end = i;
    const ids = h[1].split(',').map((s) => s.trim()).filter(Boolean);
    rows.push({ id: ids.join('/'), ids, retireWhen: undefined, checked: undefined, start: i, end });
  }
  for (const row of rows) {
    for (let i = row.start; i < row.end; i++) {
      row.retireWhen ??= RETIRE.exec(lines[i])?.[1];
      row.checked ??= CHECKED.exec(lines[i])?.[1];
    }
  }
  return rows;
}

/** Validation for native-overlap.md: every shim row carries `retire-when` and `checked: YYYY-MM`. */
export function checkOverlapShims(rel, text) {
  const errors = [];
  for (const row of parseOverlapShims(text)) {
    if (!row.retireWhen) errors.push(`${rel}: shim row ${row.id} missing "retire-when"`);
    if (!MONTH.test(row.checked ?? '')) {
      errors.push(`${rel}: shim row ${row.id} "checked" must be YYYY-MM (got ${JSON.stringify(row.checked)})`);
    }
  }
  return errors;
}

/** A `kind: shim` skill or command as a shim, or null. `id` is its name (or the given fallback). */
export function frontmatterShim(rel, text, fallbackId) {
  const fm = parseFrontmatter(text);
  if (fm?.kind !== 'shim') return null;
  const id = fm.name || fallbackId;
  return { id, ids: [id], rel, retireWhen: fm['retire-when'], checked: fm.checked };
}

/** Stale = not checked in or after `since` (YYYY-MM). A missing or malformed date is stale. */
export const isStale = (shim, since) => !MONTH.test(shim.checked ?? '') || shim.checked < since;

/** The shim whose ids include `name` (case-insensitive), or undefined. Accepts `WX6/WX7` too. */
export function findShim(shims, name) {
  const want = name.toLowerCase();
  return shims.find((s) => s.id.toLowerCase() === want || s.ids.some((i) => i.toLowerCase() === want));
}

/** native-overlap.md with `checked` set to `month` on the given rows (ids as parsed). */
export function setOverlapChecked(text, rowIds, month) {
  const lines = text.split('\n');
  // Bottom-up, so inserting a line never shifts a row still to be edited.
  const rows = parseOverlapShims(text).filter((r) => rowIds.includes(r.id)).sort((a, b) => b.start - a.start);
  for (const row of rows) {
    const line = `- **checked:** ${month}`;
    let at = -1;
    let retire = -1;
    for (let i = row.start; i < row.end; i++) {
      if (CHECKED.test(lines[i])) at = i;
      if (RETIRE.test(lines[i])) retire = i;
    }
    if (at >= 0) lines[at] = line;
    else lines.splice((retire >= 0 ? retire : row.start) + 1, 0, line);
  }
  return lines.join('\n');
}

/** A skill or command file with its frontmatter `checked` set to `month`. */
export function setFrontmatterChecked(text, month) {
  return text.replace(/^(---\r?\n[\s\S]*?^checked:)[^\r\n]*/m, `$1 ${month}`);
}

/** The top of the bcp checkout `cwd` is in, or undefined. bcp = `.claude-plugin/plugin.json` named `bcp`. */
export function bcpCheckout(cwd) {
  const top = cwd && git(cwd, 'rev-parse', '--show-toplevel');
  if (!top) return undefined;
  try {
    return JSON.parse(readFileSync(join(top, '.claude-plugin', 'plugin.json'), 'utf8')).name === 'bcp' ? top : undefined;
  } catch {
    return undefined;
  }
}

/** Every shim in a checkout: native-overlap rows (rel = OVERLAP_FILE), then `kind: shim` files. */
export function loadShims(root) {
  const read = (rel) => {
    try {
      return readFileSync(join(root, rel), 'utf8');
    } catch {
      return undefined;
    }
  };
  const list = (rel) => {
    try {
      return readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return [];
    }
  };
  const shims = parseOverlapShims(read(OVERLAP_FILE) ?? '').map((r) => ({ ...r, rel: OVERLAP_FILE }));
  const files = [
    ...list('skills').filter((d) => d.isDirectory()).map((d) => [`skills/${d.name}/SKILL.md`, d.name]),
    ...list('commands').filter((d) => d.name.endsWith('.md')).map((d) => [`commands/${d.name}`, d.name.slice(0, -3)]),
  ];
  for (const [rel, name] of files) {
    const text = read(rel);
    const shim = text && frontmatterShim(rel, text, name);
    if (shim) shims.push(shim);
  }
  return shims;
}
