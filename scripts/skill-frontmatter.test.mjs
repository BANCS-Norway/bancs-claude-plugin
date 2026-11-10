// Tests for the skill frontmatter contract. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFrontmatter, parseFrontmatter } from './lib/skill-frontmatter.mjs';

const skill = (fields) => `---\n${fields}\n---\n\nbody\n`;
const check = (fields) => checkFrontmatter('skills/x/SKILL.md', skill(fields));

const SHIM = [
  'name: x',
  'kind: shim',
  'fills-gap: native cannot name branches',
  'retire-when: native accepts a branch name',
  'checked: 2026-11',
].join('\n');

test('parseFrontmatter reads flat fields and strips quotes', () => {
  assert.deepEqual(parseFrontmatter(skill('name: x\ndescription: "a: b"')), { name: 'x', description: 'a: b' });
  assert.equal(parseFrontmatter('no frontmatter'), null);
});

test('a complete shim passes', () => {
  assert.deepEqual(check(SHIM), []);
});

test('a shim with no fills-gap fails', () => {
  const errs = check(SHIM.replace(/fills-gap:.*\n/, ''));
  assert.equal(errs.length, 1);
  assert.match(errs[0], /shim missing "fills-gap"/);
});

test('a shim with no retire-when fails', () => {
  assert.match(check(SHIM.replace(/retire-when:.*\n/, ''))[0], /shim missing "retire-when"/);
});

test('an unknown kind fails', () => {
  assert.match(check(SHIM.replace('kind: shim', 'kind: gadget'))[0], /unknown kind "gadget"/);
});

test('a missing or malformed checked fails', () => {
  assert.match(check(SHIM.replace(/\nchecked:.*/, ''))[0], /"checked" must be YYYY-MM/);
  assert.match(check(SHIM.replace('2026-11', '2026-13'))[0], /"checked" must be YYYY-MM/);
  assert.match(check(SHIM.replace('2026-11', 'Nov 2026'))[0], /"checked" must be YYYY-MM/);
});

test('process and convention need only kind and checked', () => {
  assert.deepEqual(check('name: x\nkind: process\nchecked: 2026-11'), []);
  assert.deepEqual(check('name: x\nkind: convention\nchecked: 2026-11'), []);
  assert.match(check('name: x\nkind: process')[0], /"checked"/);
});

test('an untagged skill or command fails', () => {
  assert.deepEqual(check('name: x'), ['skills/x/SKILL.md: missing "kind" (expected shim, process, convention)']);
  assert.match(checkFrontmatter('commands/y.md', skill('description: y'))[0], /^commands\/y\.md: missing "kind"/);
});

test('a block scalar value fails instead of passing as non-empty', () => {
  assert.match(check(SHIM.replace(/fills-gap:.*/, 'fills-gap: >'))[0], /"fills-gap" must be a single-line value/);
  assert.match(check(SHIM.replace(/retire-when:.*/, 'retire-when: |-'))[0], /"retire-when" must be a single-line value/);
});

test('a skill with no frontmatter block fails', () => {
  assert.match(checkFrontmatter('skills/x/SKILL.md', 'just text')[0], /missing frontmatter/);
});

// --- validate.mjs reaches every skill and command ---

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A copy of the plugin tree: validate.mjs finds its root from its own path, so the copy judges itself.
function pluginCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'bcp-validate-'));
  for (const d of ['.claude-plugin', 'hooks', 'skills', 'commands', 'workforces', 'scripts']) {
    cpSync(join(repo, d), join(dir, d), { recursive: true });
  }
  return dir;
}
const validate = (dir) => spawnSync(process.execPath, [join(dir, 'scripts', 'validate.mjs')], { encoding: 'utf8' });
const untag = (file) => writeFileSync(file, readFileSync(file, 'utf8').replace(/^kind: .*\r?\n/m, ''));

test('validate passes on the plugin as shipped, with every skill and command tagged', () => {
  assert.equal(validate(pluginCopy()).status, 0);
});

test('validate fails on an untagged command and an untagged skill, and names both', () => {
  const dir = pluginCopy();
  untag(join(dir, 'commands', 'nudge.md'));
  untag(join(dir, 'skills', 'review', 'SKILL.md'));
  const r = validate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /commands\/nudge\.md: missing "kind"/);
  assert.match(r.stderr, /skills\/review\/SKILL\.md: missing "kind"/);
});
