// Tests for the shim library and /bcp:shim-review. Run: npm run test:shims
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkOverlapShims, findShim, isStale, loadShims, parseOverlapShims, setFrontmatterChecked, setOverlapChecked,
} from './lib/shims.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'bcp-shims-'));
const month = new Date().toISOString().slice(0, 7);

const OVERLAP = `# Native overlap

## Shim rows

### WC6a — \`git worktree add\` (worktree-create)

- **Native:** something.
- **retire-when:** native takes a branch name.
- **checked:** 2026-10

### WX6, WX7 — remove (worktree-cleanup)

- **retire-when:** native removes it.

### HK1 — seed (hook)

- **retire-when:** a post-install hook.
- **checked:** 2026-11

## Other native-relevant rows

### RV2 — not a shim

- **retire-when:** ignored, outside the section.
`;

test('parseOverlapShims reads the rows under Shim rows only', () => {
  const rows = parseOverlapShims(OVERLAP);
  assert.deepEqual(rows.map((r) => [r.id, r.ids, r.retireWhen, r.checked]), [
    ['WC6a', ['WC6a'], 'native takes a branch name.', '2026-10'],
    ['WX6/WX7', ['WX6', 'WX7'], 'native removes it.', undefined],
    ['HK1', ['HK1'], 'a post-install hook.', '2026-11'],
  ]);
  assert.deepEqual(parseOverlapShims('# no section\n'), []);
});

test('checkOverlapShims requires retire-when and a YYYY-MM checked on every row', () => {
  assert.deepEqual(checkOverlapShims('n.md', OVERLAP), ['n.md: shim row WX6/WX7 "checked" must be YYYY-MM (got undefined)']);
  const bad = OVERLAP.replace('- **retire-when:** a post-install hook.\n', '').replace('2026-10', '2026-13');
  assert.deepEqual(checkOverlapShims('n.md', bad), [
    'n.md: shim row WC6a "checked" must be YYYY-MM (got "2026-13")',
    'n.md: shim row WX6/WX7 "checked" must be YYYY-MM (got undefined)',
    'n.md: shim row HK1 missing "retire-when"',
  ]);
});

test('isStale compares months; a missing or malformed date is stale', () => {
  assert.equal(isStale({ checked: '2026-10' }, '2026-11'), true);
  assert.equal(isStale({ checked: '2026-11' }, '2026-11'), false);
  assert.equal(isStale({ checked: '2026-12' }, '2026-11'), false);
  assert.equal(isStale({}, '2026-11'), true);
  assert.equal(isStale({ checked: 'soon' }, '2026-11'), true);
});

test('findShim matches the printed id or any one id, case-insensitively', () => {
  const rows = parseOverlapShims(OVERLAP);
  assert.equal(findShim(rows, 'wx7').id, 'WX6/WX7');
  assert.equal(findShim(rows, 'WX6/WX7').id, 'WX6/WX7');
  assert.equal(findShim(rows, 'RV2'), undefined);
});

test('setOverlapChecked replaces or inserts checked on the named rows only', () => {
  const out = setOverlapChecked(OVERLAP, ['WC6a', 'WX6/WX7'], '2026-12');
  const rows = parseOverlapShims(out);
  assert.deepEqual(rows.map((r) => r.checked), ['2026-12', '2026-12', '2026-11']);
  assert.match(out, /- \*\*retire-when:\*\* native removes it\.\n- \*\*checked:\*\* 2026-12\n/);
  assert.equal(out.split('\n').length, OVERLAP.split('\n').length + 1); // one inserted line, nothing else
});

test('setFrontmatterChecked changes only the frontmatter checked line', () => {
  const text = '---\nname: x\nkind: shim\nchecked: 2026-10\n---\n\nchecked: 2026-10 in the body\n';
  assert.equal(setFrontmatterChecked(text, '2026-12'), '---\nname: x\nkind: shim\nchecked: 2026-12\n---\n\nchecked: 2026-10 in the body\n');
});

// --- a fake bcp checkout, and the CLI run in it ---

function checkout() {
  const dir = tmp();
  spawnSync('git', ['init', '-q', dir]);
  mkdirSync(join(dir, '.claude-plugin'));
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), '{"name":"bcp"}');
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'native-overlap.md'), OVERLAP);
  mkdirSync(join(dir, 'skills', 'shimmy'), { recursive: true });
  writeFileSync(join(dir, 'skills', 'shimmy', 'SKILL.md'), '---\nname: shimmy\nkind: shim\nfills-gap: g\nretire-when: native does it.\nchecked: 2026-09\n---\nbody\n');
  mkdirSync(join(dir, 'skills', 'plain'));
  writeFileSync(join(dir, 'skills', 'plain', 'SKILL.md'), '---\nname: plain\nkind: process\nchecked: 2026-01\n---\n');
  mkdirSync(join(dir, 'commands'));
  writeFileSync(join(dir, 'commands', 'cmd.md'), '---\nkind: shim\nfills-gap: g\nretire-when: soon.\nchecked: 2026-11\n---\n');
  return dir;
}

test('loadShims reads the rows and the kind: shim skills and commands', () => {
  assert.deepEqual(loadShims(checkout()).map((s) => [s.id, s.rel]), [
    ['WC6a', 'docs/native-overlap.md'],
    ['WX6/WX7', 'docs/native-overlap.md'],
    ['HK1', 'docs/native-overlap.md'],
    ['shimmy', 'skills/shimmy/SKILL.md'],
    ['cmd', 'commands/cmd.md'], // no name: the file name
  ]);
});

function review(cwd, args, home = tmp()) {
  return spawnSync(process.execPath, [resolve(scripts, 'shim-review.mjs')], {
    cwd, input: args, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home },
  });
}

test('with no arguments it lists the shims checked before the last version change', () => {
  const home = tmp();
  mkdirSync(join(home, '.claude', 'bcp'), { recursive: true });
  writeFileSync(join(home, '.claude', 'bcp', 'claude-version.json'), '{"seen":"2.1.322","at":"2026-11-02"}');
  const r = review(checkout(), '', home);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^3 shims last checked before 2026-11:/);
  assert.match(r.stdout, /WC6a \(docs\/native-overlap\.md\) checked 2026-10\n {2}retire-when: native takes a branch name\./);
  assert.match(r.stdout, /WX6\/WX7 \(docs\/native-overlap\.md\) checked never/);
  assert.match(r.stdout, /shimmy \(skills\/shimmy\/SKILL\.md\) checked 2026-09/);
  assert.doesNotMatch(r.stdout, /HK1|cmd/);
});

test('without a recorded version it compares with this month; all lists everything', () => {
  const dir = checkout();
  assert.match(review(dir, '').stdout, new RegExp(`shims last checked before ${month}:`));
  assert.match(review(dir, 'all\n').stdout, /^5 shims:/);
});

test('mark sets this month on rows and frontmatter, and nothing else', () => {
  const dir = checkout();
  const r = review(dir, 'mark wx7 shimmy WX6\n');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), `Marked checked ${month}: WX6/WX7, shimmy`);
  const rows = parseOverlapShims(readFileSync(join(dir, 'docs', 'native-overlap.md'), 'utf8'));
  assert.deepEqual(rows.map((s) => s.checked), ['2026-10', month, '2026-11']);
  assert.match(readFileSync(join(dir, 'skills', 'shimmy', 'SKILL.md'), 'utf8'), new RegExp(`\nchecked: ${month}\n`));
  assert.match(readFileSync(join(dir, 'commands', 'cmd.md'), 'utf8'), /checked: 2026-11/);
});

test('an unknown id marks nothing; bad arguments and a non-bcp directory fail', () => {
  const dir = checkout();
  const before = readFileSync(join(dir, 'docs', 'native-overlap.md'), 'utf8');
  const r = review(dir, 'mark WC6a nope\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown shim "nope"\. Shims: WC6a, WX6\/WX7, HK1, shimmy, cmd/);
  assert.equal(readFileSync(join(dir, 'docs', 'native-overlap.md'), 'utf8'), before);
  assert.match(review(dir, 'mark\n').stderr, /mark needs at least one shim id/);
  assert.match(review(dir, 'list\n').stderr, /unknown argument "list"/);
  assert.match(review(tmp(), '').stderr, /not in a bcp checkout/);
});
