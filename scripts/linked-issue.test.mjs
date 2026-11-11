// Tests for the linked-issue check (#46). Run: npm run test:linked
// The script runs as CI runs it (node, the PR number on stdin) against a fake `gh` that prints FAKE_GH_PR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasLinkedIssue } from './linked-issue.mjs';
import { tmp } from './lib/test-repo.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'linked-issue.mjs');
const ghDir = tmp();
writeFileSync(join(ghDir, 'gh'), `#!${process.execPath}
if (process.env.FAKE_GH_FAIL) { console.error('GraphQL: Could not resolve to a PullRequest'); process.exit(1); }
process.stdout.write(process.env.FAKE_GH_PR ?? '{}');
`);
chmodSync(join(ghDir, 'gh'), 0o755);

function check(input, pr = {}, env = {}) {
  const r = spawnSync(process.execPath, [script], {
    input, encoding: 'utf8',
    env: { ...process.env, PATH: `${ghDir}${delimiter}${process.env.PATH}`, FAKE_GH_PR: JSON.stringify(pr), ...env },
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

test('hasLinkedIssue: a closing issue from GitHub, or `Part of #N`, counts; nothing else does', () => {
  assert.equal(hasLinkedIssue({ body: '', closingIssuesReferences: [{ number: 7 }] }), true);
  assert.equal(hasLinkedIssue({ body: 'Part of #7' }), true);
  assert.equal(hasLinkedIssue({ body: 'part of #7' }), true);
  assert.equal(hasLinkedIssue({ body: 'Part of BANCS-Norway/bancs-claude-plugin#7' }), true);
  // a closing keyword in the body counts at once, without waiting for GitHub to fill in closingIssuesReferences
  for (const body of ['Closes #7', 'closes #7', 'Closed #7', 'Close #7', 'Fixes #7', 'fix #7', 'Fixed #7', 'Resolves #7', 'resolved #7', 'Closes: #7', 'Fixes BANCS-Norway/bancs-claude-plugin#7', '## Summary\n\nCloses #7\n']) {
    assert.equal(hasLinkedIssue({ body }), true, body);
  }
  for (const body of ['Summary\n\nSee also #7', 'Closes the loop', 'Closes #', 'Closes\n\n#7 is related', 'Disclosed #7', 'Prefixes #7', '<!-- Closes #7 -->', 'Refs #7']) {
    assert.equal(hasLinkedIssue({ body }), false, body);
  }
  assert.equal(hasLinkedIssue({ body: 'Summary\n\nSee also #7' }), false, 'a bare mention is not a link');
  assert.equal(hasLinkedIssue({ body: 'Part of the plan' }), false);
  assert.equal(hasLinkedIssue({ body: 'Part of #' }), false);
  assert.equal(hasLinkedIssue({ body: '<!-- Part of #7 -->' }), false, 'template text in a comment is not a link');
  assert.equal(hasLinkedIssue({ body: null }), false);
  assert.equal(hasLinkedIssue({}), false);
});

test('a PR GitHub links to an issue passes', () => {
  const r = check('12', { body: '', closingIssuesReferences: [{ number: 46 }] });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'ok: pull request #12 is linked (closes #46)');
});

test('a PR whose description says `Part of #N` passes', () => {
  const r = check('12\n', { body: 'Summary\n\nPart of #46', closingIssuesReferences: [] });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^ok: pull request #12 is linked \(an issue named in the description\)$/);
});

test('a PR whose description has a closing keyword passes before GitHub has filled in its own field', () => {
  const r = check('12', { body: 'Closes #46', closingIssuesReferences: [] });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^ok: pull request #12 is linked \(an issue named in the description\)$/);
});

test('a PR with no link fails and says how to fix it', () => {
  const r = check('12', { body: 'Just a change', closingIssuesReferences: [] });
  assert.equal(r.code, 1);
  assert.match(r.err, /^FAIL: pull request #12 links no issue\. Add `Closes #N`.*`Part of #N`.*sidebar/);
  assert.equal(r.out, '');
});

test('bad input and a gh error fail instead of passing', () => {
  for (const input of ['', 'abc', '12 13', '12; rm -rf /']) {
    const r = check(input, { body: 'Part of #1' });
    assert.equal(r.code, 1, JSON.stringify(input));
    assert.match(r.err, /expected one pull request number/);
  }
  const r = check('12', {}, { FAKE_GH_FAIL: '1' });
  assert.equal(r.code, 1);
  assert.match(r.err, /could not read pull request #12 with gh: GraphQL: Could not resolve/);
});
