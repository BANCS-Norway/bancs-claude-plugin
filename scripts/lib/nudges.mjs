// Manual corrections ("you skipped the tests"), recorded per step and repo by /nudge.
// Format and rules: docs/process-steps.md. The CLI is scripts/nudge.mjs.
import { STEPS } from './process-steps.mjs';

/** Steps a nudge can name: the ones the Stop hook detects, plus two it cannot (see decay-baseline.md). */
export const NUDGE_STEPS = [...STEPS, 'review', 'issues'];

/** This many nudges on one step in one repo marks the step as withered. */
export const WITHER_AT = 3;

/** The canonical step name, or null when it is not one we know (a typo would split the counts). */
export function normaliseStep(step) {
  const s = String(step ?? '').trim().toLowerCase();
  return NUDGE_STEPS.includes(s) ? s : null;
}

/**
 * The arguments of `/nudge`, as one line: empty means report; otherwise the first word is the
 * step (as typed, not yet checked) and the rest is the note.
 */
export function parseInvocation(text) {
  const line = String(text ?? '').trim();
  if (!line) return { mode: 'report' };
  const [, step, note = ''] = /^(\S+)\s*([\s\S]*)$/.exec(line);
  return { mode: 'record', step, note: note.trim() };
}

/** Records from the log text. Blank and torn lines are skipped. */
export function parseNudges(text) {
  const records = [];
  for (const line of text.split('\n')) {
    try {
      const r = JSON.parse(line);
      if (r && typeof r.step === 'string') records.push(r);
    } catch {
      // blank or torn line
    }
  }
  return records;
}

/** One row per repo and step: the count, and whether it has withered. Withered first, then by count. */
export function tally(records) {
  const rows = new Map();
  for (const r of records) {
    const key = `${r.repo}\0${r.step}`;
    const row = rows.get(key) ?? { repo: r.repo ?? null, step: r.step, count: 0, withered: false };
    row.count++;
    row.withered = row.count >= WITHER_AT;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) => Number(b.withered) - Number(a.withered) || b.count - a.count || `${a.repo}`.localeCompare(`${b.repo}`) || a.step.localeCompare(b.step),
  );
}

/** The report /nudge prints with no arguments. */
export function formatReport(rows) {
  if (!rows.length) return 'No nudges recorded.';
  const repoW = Math.max(...rows.map((r) => `${r.repo}`.length));
  const stepW = Math.max(...rows.map((r) => r.step.length));
  const lines = rows.map((r) => `${`${r.repo}`.padEnd(repoW)}  ${r.step.padEnd(stepW)}  ${r.count}${r.withered ? '  WITHERED' : ''}`);
  return [`Nudges (${WITHER_AT} on a step in a repo = withered)`, ...lines].join('\n');
}
