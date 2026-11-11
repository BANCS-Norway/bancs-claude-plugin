// #42's "done when", as a test: no global skill hard-codes the base branch, the in-progress label or
// the PR title format. They come from the project context (docs/project-context.md), so a skill that
// writes one back in is wrong in every repo that does it differently. Run: npm run test:literals
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills');

/** Skills that may keep a literal, and why. */
const EXEMPT = {
  // Works on a fork against its upstream and filters `master`/`main` worktrees by name.
  'setup-contribution': ['branch'],
};

// `main` as a branch name. "main checkout", "main repo" and "main-repo-path" mean the primary clone.
const RULES = [
  { name: 'branch', pattern: /\bmain\b(?!-repo|\s+(?:checkout|repo|repository|worktree))/, hint: 'use {base}, from `get default_branch` or the preflight' },
  { name: 'label', pattern: /status: in progress/, hint: 'use `get in_progress_label`' },
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
  for (const fine of ['symlink the main checkout\'s node_modules', 'cd {main-repo-path} && git x', 'the main repo root', 'Back in the main checkout.']) {
    assert.deepEqual(flagged('worktree-cleanup', fine), [], fine);
  }
});

test('the exemptions and the pr-title scope are what they say', () => {
  assert.deepEqual(findLiterals('setup-contribution', 'non-master/main worktrees'), []);
  assert.deepEqual(findLiterals('setup-contribution', 'status: in progress').map((f) => f.rule), ['label']);
  assert.deepEqual(findLiterals('commit-guide', '{type}({scope}): {description}'), []);
});
