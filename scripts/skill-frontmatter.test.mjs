// Tests for the skill frontmatter contract. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSkillFrontmatter, parseFrontmatter } from './lib/skill-frontmatter.mjs';

const skill = (fields) => `---\n${fields}\n---\n\nbody\n`;
const check = (fields) => checkSkillFrontmatter('skills/x/SKILL.md', skill(fields));

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

test('an untagged skill passes', () => {
  assert.deepEqual(check('name: x'), []);
});

test('a block scalar value fails instead of passing as non-empty', () => {
  assert.match(check(SHIM.replace(/fills-gap:.*/, 'fills-gap: >'))[0], /"fills-gap" must be a single-line value/);
  assert.match(check(SHIM.replace(/retire-when:.*/, 'retire-when: |-'))[0], /"retire-when" must be a single-line value/);
});

test('a skill with no frontmatter block fails', () => {
  assert.match(checkSkillFrontmatter('skills/x/SKILL.md', 'just text')[0], /missing frontmatter/);
});
