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
// A commit that ran prints git's summary line, `[branch abc1234] subject`. One that was refused (a hook,
// a guard, nothing staged) does not, and says why. The exit status cannot tell: `git commit ... | tail`
// ends in 0 either way (#89). Output that shows neither (empty, or `-q`) counts as a commit.
const COMMITTED = /^\[[^\]\n]+ [0-9a-f]{7,}\]/m;
const REFUSED = /\bscript failed\b|\bhook (?:failed|exited)\b|\bAborting commit\b|^(?:error|fatal): |\bcommit guard:|\bRefusing to commit\b/m;
// `git status` prints these too, so they count only when the command does not run it.
const NOTHING_STAGED = /\bnothing (?:added )?to commit\b|\bno changes added to commit\b/;

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

/** The text of a tool result: a string, or the text blocks of an array. */
function resultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('\n');
}

/** Flatten transcript entries to `prompt` and `tool` events, marking tool calls that errored and keeping their output. */
export function toEvents(entries) {
  const failed = new Set();
  const outputs = new Map();
  for (const e of entries) {
    const c = e.message?.content;
    if (e.type === 'user' && Array.isArray(c)) {
      for (const b of c) {
        if (b?.type !== 'tool_result') continue;
        if (b.is_error) failed.add(b.tool_use_id);
        outputs.set(b.tool_use_id, resultText(b.content));
      }
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
          output: outputs.get(b.id) ?? '',
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

// A refused attempt is not a commit: it neither ends a batch nor starts the next one, so the retry
// is judged on the whole batch since the last commit that went through.
function refused(ev, cmd) {
  const out = ev.output ?? '';
  if (!out || COMMITTED.test(out)) return false;
  return REFUSED.test(out) || (!/\bgit\s+status\b/.test(cmd) && NOTHING_STAGED.test(out));
}

// The command is tested first: it is cheap, and most events are not commits, so their (possibly
// large) output is never scanned.
function isCommit(ev) {
  const cmd = bash(ev);
  return COMMIT.test(bare(cmd)) && !/--dry-run/.test(cmd) && !ev.failed && !refused(ev, cmd);
}

function wroteWorkLog(ev) {
  if (['Edit', 'Write', 'NotebookEdit'].includes(ev.name)) {
    const p = ev.input.file_path ?? ev.input.notebook_path;
    return typeof p === 'string' && WORK_LOG.test(p.replaceAll('\\', '/'));
  }
  const cmd = bash(ev);
  return WORK_LOG.test(cmd) && /(?:>>?|\btee\b)\s*\S*(?:issue-\d+\.md|issues\/\d+\/log\.md)/.test(cmd);
}

/** The steps `checkBatch` can report, in the order it reports them (a test keeps the two in step). */
export const STEPS = ['tests', 'work-log', 'checklist-sync', 'commit-guide', 'issue-link'];

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
