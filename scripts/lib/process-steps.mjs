// Process-step checks for a finished batch. Used by the Stop hook (scripts/stop-check.mjs).
// Pure functions: transcript text in, findings out. Steps and ids: docs/process-steps.md.

// `git commit` as a command, not as text inside a grep, echo or heredoc argument.
const COMMIT = /(?:^|[;&|(\n])\s*(?:\w+=\S+\s+)*git\s+(?:-C\s+\S+\s+)?commit\b/;
const TEST_RUN =
  /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test|\bnode\s+(?:\S+\s+)*--test\b|\bpytest\b|\bvitest\b|\bjest\b|\bgo\s+test\b|\bcargo\s+test\b|\bdotnet\s+test\b|\bmake\s+test\b|scripts\/test[-\w]*\.sh|\bvalidate\.mjs\b/;
const WORK_LOG = /(?:issue-\d+\.md|issues\/\d+\/log\.md)/;
const CHECKLIST_SYNC = /\bchecklist-sync\b|\bgh\s+issue\s+edit\b/;
const ISSUE_BRANCH = /^[a-z]+\/(\d+)[_-]/;
const COMMIT_TYPE = /\b(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^)]*\))?!?:/;
const DEFAULT_BRANCHES = new Set(['main', 'master', 'HEAD']);
// Commit types that carry no code, so a test run is not expected.
const NO_TESTS = new Set(['docs', 'style']);

export function parseTranscript(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e && typeof e === 'object' && !e.isSidechain) entries.push(e);
    } catch {
      // a torn last line while the transcript is being written: skip it
    }
  }
  return entries;
}

/** Flatten transcript entries to `prompt` and `tool` events, marking tool calls that errored. */
export function toEvents(entries) {
  const failed = new Set();
  for (const e of entries) {
    const c = e.message?.content;
    if (e.type === 'user' && Array.isArray(c)) {
      for (const b of c) if (b?.type === 'tool_result' && b.is_error) failed.add(b.tool_use_id);
    }
  }
  const events = [];
  for (const e of entries) {
    const c = e.message?.content;
    if (e.type === 'user' && !e.isMeta) {
      const real = typeof c === 'string' ? c.trim() !== '' : Array.isArray(c) && c.some((b) => b?.type === 'text');
      if (real) events.push({ kind: 'prompt' });
    } else if (e.type === 'assistant' && Array.isArray(c)) {
      for (const b of c) {
        if (b?.type !== 'tool_use') continue;
        events.push({
          kind: 'tool',
          id: b.id,
          name: b.name,
          input: b.input ?? {},
          cwd: e.cwd,
          branch: e.gitBranch,
          failed: failed.has(b.id),
        });
      }
    }
  }
  return events;
}

const bash = (ev) => (ev.name === 'Bash' && typeof ev.input.command === 'string' ? ev.input.command : '');

// The command without heredoc bodies and quoted strings, so text that mentions `git commit` (a
// grep pattern, an echo, a file being written) is not mistaken for running it.
function bare(cmd) {
  return cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, '')
    .replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""');
}

function isCommit(ev) {
  const cmd = bash(ev);
  return !ev.failed && COMMIT.test(bare(cmd)) && !/--dry-run/.test(cmd);
}

function wroteWorkLog(ev) {
  if (['Edit', 'Write', 'NotebookEdit'].includes(ev.name)) {
    const p = ev.input.file_path ?? ev.input.notebook_path;
    return typeof p === 'string' && WORK_LOG.test(p.replaceAll('\\', '/'));
  }
  const cmd = bash(ev);
  return WORK_LOG.test(cmd) && /(?:>>?|\btee\b)\s*\S*(?:issue-\d+\.md|issues\/\d+\/log\.md)/.test(cmd);
}

/** The steps a batch skipped. `window` is the tool events since the previous commit, up to this one. */
export function checkBatch(window, commit, branch) {
  const skipped = [];
  const type = COMMIT_TYPE.exec(bash(commit))?.[1];
  if (!NO_TESTS.has(type) && !window.some((ev) => TEST_RUN.test(bash(ev)))) skipped.push('tests');
  if (!window.some(wroteWorkLog)) skipped.push('work-log');
  if (!window.some((ev) => CHECKLIST_SYNC.test(bash(ev)))) skipped.push('checklist-sync');
  if (!window.some((ev) => ev.name === 'Skill' && /(?:^|:)commit-guide$/.test(ev.input.skill ?? ''))) {
    skipped.push('commit-guide');
  }
  const issue = ISSUE_BRANCH.exec(branch ?? '')?.[1];
  if (!issue) skipped.push('issue-link');
  return { issue: issue ? Number(issue) : null, skipped };
}

/**
 * Check every commit made in the latest turn (after the last real user prompt).
 * Each commit is judged against the work since the previous commit in the session.
 * Returns one finding per commit that skipped at least one step.
 */
export function checkLastTurn(events, { branchOf = () => undefined } = {}) {
  let turnStart = events.map((e) => e.kind).lastIndexOf('prompt') + 1;
  const findings = [];
  let prev = -1;
  events.forEach((ev, i) => {
    if (ev.kind !== 'tool' || !isCommit(ev)) return;
    if (i >= turnStart) {
      const window = events.slice(prev + 1, i).filter((e) => e.kind === 'tool');
      // The transcript's gitBranch is the branch the session started on, stale after a `cd` into a
      // worktree. Ask git first; fall back to the field only when it names a feature branch, since
      // a default branch there is most likely the stale start value, not where the commit landed.
      const stale = DEFAULT_BRANCHES.has(ev.branch) ? undefined : ev.branch;
      const branch = branchOf(ev.cwd) ?? stale;
      const { issue, skipped } = checkBatch(window, ev, branch);
      if (skipped.length) findings.push({ commitId: ev.id, branch: branch ?? null, issue, skipped, cwd: ev.cwd });
    }
    prev = i;
  });
  return findings;
}
