// #42's "done when", as a test: no global skill hard-codes the base branch, the in-progress label or
// the PR title format, and (#44) none writes an attribution footer. The first three come from the project context
// (docs/project-context.md), so a skill that writes one back in is wrong in every repo that does it
// differently. Run: npm run test:literals
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills');

/** Skills that may keep a literal, and why. */
const EXEMPT = {
  // Works on a fork against its upstream and filters `master`/`main` worktrees by name. It also writes the fork's
  // MEMORY.md from the cwd (step 7); that is not an issue work log, and it is outside #69's six skills.
  'setup-contribution': ['branch', 'work-log'],
};

// `main` as a branch name. "main checkout", "main repo" and "main-repo-path" mean the primary clone.
const RULES = [
  { name: 'branch', pattern: /\bmain\b(?!-repo|\s+(?:checkout|repo|repository|worktree))/, hint: 'use {base}, from `get default_branch` or the preflight' },
  { name: 'label', pattern: /status: in progress/, hint: 'use `get in_progress_label`' },
  // The harness adds the attribution from the `attribution` setting (#44); a footer in a skill is a second one.
  { name: 'footer', pattern: /^(?:🤖 )?Generated with|^Co-Authored-By:/, hint: 'write no attribution footer; Claude Code adds it' },
  // #69: where the work logs live is computed by scripts/work-log.mjs from the main checkout; a skill that spells the
  // path derives it from the cwd, which is a different folder inside a worktree.
  { name: 'work-log', pattern: /\{project-slug\}|memory\/issues?\b|issue-(?:\{NNN\}|\d+)\.md|~\/\.claude\/projects/, hint: 'call scripts/work-log.mjs (memory | path | create | active | remove)' },
  // pr-create only: commit-guide's message format is the commit's, not the PR's (#41).
  { name: 'pr-title', pattern: /\{type\}\(\{scope\}\)/, only: ['pr-create'], hint: 'use `get pr_title`' },
];

/** The literals `text` of skill `skill` should not contain: [{ rule, line, text }]. */
export function findLiterals(skill, text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.only && !rule.only.includes(skill)) continue;
      if (EXEMPT[skill]?.includes(rule.name)) continue;
      if (rule.pattern.test(line)) found.push({ rule: rule.name, line: i + 1, text: line.trim(), hint: rule.hint });
    }
  });
  return found;
}

test('no global skill hard-codes the base branch, the in-progress label or the PR title format', () => {
  const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.ok(skills.length >= 8, 'found the skills');
  const problems = skills.flatMap((skill) => findLiterals(skill, readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8'))
    .map((f) => `skills/${skill}/SKILL.md:${f.line} [${f.rule}] ${f.text}  -> ${f.hint}`));
  assert.deepEqual(problems, []);
});

test('the rule flags what it should and lets the primary clone be called main', () => {
  const flagged = (skill, text) => findLiterals(skill, text).map((f) => f.rule);
  assert.deepEqual(flagged('worktree-create', 'git worktree add .wt/x -b feat/1_x main'), ['branch']);
  assert.deepEqual(flagged('worktree-resume', 'git log --oneline main..HEAD'), ['branch']);
  assert.deepEqual(flagged('worktree-resume', 'git diff --stat main'), ['branch']);
  assert.deepEqual(flagged('worktree-cleanup', 'Back on main. What is next?'), ['branch']);
  assert.deepEqual(flagged('worktree-cleanup', 'gh issue edit 1 --remove-label "status: in progress"'), ['label']);
  assert.deepEqual(flagged('pr-create', '{type}({scope}): {description}'), ['pr-title']);
  assert.deepEqual(flagged('commit-guide', 'Co-Authored-By: Claude <noreply@anthropic.com>'), ['footer']);
  assert.deepEqual(flagged('pr-create', '🤖 Generated with [Claude Code](https://claude.com/claude-code)'), ['footer']);
  assert.deepEqual(flagged('pr-create', 'Write no attribution line (`Generated with Claude Code`).'), []);
  // #69: every spelling of the work-log path is flagged; the script call and prose about "the log" are not
  for (const spelled of ['~/.claude/projects/{project-slug}/memory/issues/{NNN}/log.md', 'rm -f memory/issue-{NNN}.md', 'scan `memory/issues/`', 'Read `issue-12.md`']) {
    assert.deepEqual(flagged('worktree-cleanup', spelled), ['work-log'], spelled);
  }
  for (const fine of ['node "${CLAUDE_PLUGIN_ROOT}/scripts/work-log.mjs" <<\'ARGS\'', 'path {NNN}', 'Append to the log file `path: <file>` printed', 'an issue with an active worktree']) {
    assert.deepEqual(flagged('commit-guide', fine), [], fine);
  }
  for (const fine of ['symlink the main checkout\'s node_modules', 'cd {main-repo-path} && git x', 'the main repo root', 'Back in the main checkout.']) {
    assert.deepEqual(flagged('worktree-cleanup', fine), [], fine);
  }
});

test('the exemptions and the pr-title scope are what they say', () => {
  assert.deepEqual(findLiterals('setup-contribution', 'non-master/main worktrees'), []);
  assert.deepEqual(findLiterals('setup-contribution', 'status: in progress').map((f) => f.rule), ['label']);
  assert.deepEqual(findLiterals('commit-guide', '{type}({scope}): {description}'), []);
});

// #69: a skill's work-log.mjs call must name a verb the script has, with an issue number where it needs one.
const WORK_LOG_VERBS = { memory: false, active: false, path: true, create: true, remove: true };

/** The argument lines of every `work-log.mjs` heredoc in `text`. */
export function workLogCalls(text) {
  return [...text.matchAll(/work-log\.mjs"? <<'ARGS'\n([^\n]*)\nARGS/g)].map((m) => m[1]);
}

const callProblem = (line) => {
  const [verb, ...rest] = line.trim().split(/\s+/);
  if (!(verb in WORK_LOG_VERBS)) return `unknown verb ${JSON.stringify(verb)}`;
  if (WORK_LOG_VERBS[verb] ? !(rest.length === 1 && /^(?:\{NNN\}|\d+)$/.test(rest[0])) : rest.length) return `bad arguments for ${verb}: ${rest.join(' ')}`;
  return null;
};

test('every work-log.mjs call in a skill names a real verb with the right arguments', () => {
  const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const calls = skills.flatMap((skill) => workLogCalls(readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8')).map((line) => ({ skill, line })));
  assert.ok(calls.length >= 9, 'found the calls');
  assert.deepEqual(calls.map(({ skill, line }) => [skill, line, callProblem(line)]).filter((c) => c[2]), []);
});

test('the work-log call check catches a typo, a missing issue and a stray argument', () => {
  const call = (args) => workLogCalls(`node "\${CLAUDE_PLUGIN_ROOT}/scripts/work-log.mjs" <<'ARGS'\n${args}\nARGS`).map(callProblem);
  assert.deepEqual(call('path {NNN}'), [null]);
  assert.deepEqual(call('active'), [null]);
  assert.match(call('paht {NNN}')[0], /unknown verb/);
  assert.match(call('path')[0], /bad arguments/);
  assert.match(call('active 3')[0], /bad arguments/);
  assert.match(call('remove 3 4')[0], /bad arguments/);
});

test('commit-guide asks the project context for the commit types and the release mechanism', () => {
  const text = readFileSync(join(skillsDir, 'commit-guide', 'SKILL.md'), 'utf8');
  for (const fact of ['commit_types', 'release']) assert.match(text, new RegExp(`^get ${fact}$`, 'm'), `get ${fact}`);
  // unknown is asked about, not defaulted (#41)
  assert.match(text, /do not propose a\s+type from memory/);
});
