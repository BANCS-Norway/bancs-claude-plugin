// Tests for the version-check SessionStart hook. Run: npm run test:version
// The hook runs as Claude Code runs it: node, payload on stdin, a temporary HOME, and a fake
// `claude` binary (a node script) named by CLAUDE_CODE_EXECPATH or found on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = resolve(dirname(fileURLToPath(import.meta.url)), 'version-check.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'bcp-version-'));
const stateFile = (home) => join(home, '.claude', 'bcp', 'claude-version.json');

/** A fake Claude Code binary that prints `out` for --version and exits with `code`. */
function fakeClaude(out, code = 0, name = 'claude') {
  const dir = tmp();
  const bin = join(dir, name);
  writeFileSync(bin, `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(out)});\nprocess.exit(${code});\n`);
  chmodSync(bin, 0o755);
  return bin;
}

function run(home, { payload = { hook_event_name: 'SessionStart', source: 'startup' }, env = {}, cwd = tmp() } = {}) {
  const r = spawnSync(process.execPath, [hook], {
    cwd, // never this checkout: it is a bcp repo, and its shims would join the output
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { PATH, HOME: home, USERPROFILE: home, ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

// The real PATH (git is needed) minus any directory holding a real `claude`, so tests control it.
const PATH = [dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter)]
  .filter((d) => d && !existsSync(join(d, 'claude')) && !existsSync(join(d, 'claude.exe')))
  .join(delimiter);

const at = (bin) => ({ env: { CLAUDE_CODE_EXECPATH: bin } });
const stored = (home) => JSON.parse(readFileSync(stateFile(home), 'utf8'));

test('first run records the version silently', () => {
  const home = tmp();
  assert.equal(run(home, at(fakeClaude('2.1.322 (Claude Code)\n'))), null);
  assert.equal(stored(home).seen, '2.1.322');
  assert.match(stored(home).at, /^\d{4}-\d{2}-\d{2}$/);
});

test('same version stays silent and leaves the file alone', () => {
  const home = tmp();
  const bin = fakeClaude('2.1.322 (Claude Code)\n');
  run(home, at(bin));
  writeFileSync(stateFile(home), '{"seen":"2.1.322","at":"2026-01-01"}');
  assert.equal(run(home, at(bin)), null);
  assert.equal(stored(home).at, '2026-01-01');
});

test('a new version is shown once and stored straight away', () => {
  const home = tmp();
  run(home, at(fakeClaude('2.1.321 (Claude Code)\n')));
  const bin = fakeClaude('2.1.322 (Claude Code)\n');
  assert.deepEqual(run(home, at(bin)), { systemMessage: 'bcp: Claude Code updated 2.1.321 → 2.1.322' });
  assert.equal(stored(home).seen, '2.1.322');
  assert.equal(run(home, at(bin)), null); // only once
});

test('falls back to claude on PATH when CLAUDE_CODE_EXECPATH is unset', () => {
  const home = tmp();
  const bin = fakeClaude('2.2.0 (Claude Code)\n');
  run(home, { env: { PATH: [dirname(bin), PATH].join(delimiter) } });
  assert.equal(stored(home).seen, '2.2.0');
});

test('does nothing when the version cannot be read', () => {
  for (const env of [
    { CLAUDE_CODE_EXECPATH: fakeClaude('2.1.322\n', 1) }, // non-zero exit
    { CLAUDE_CODE_EXECPATH: fakeClaude('not a version\n') }, // unparseable
    { CLAUDE_CODE_EXECPATH: join(tmp(), 'missing') }, // no such binary
    {}, // no claude on PATH either
  ]) {
    const home = tmp();
    assert.equal(run(home, { env }), null);
    assert.equal(existsSync(stateFile(home)), false);
  }
});

test('an unreadable state file is treated as a first run', () => {
  const home = tmp();
  mkdirSync(dirname(stateFile(home)), { recursive: true });
  writeFileSync(stateFile(home), 'garbage');
  assert.equal(run(home, at(fakeClaude('2.1.322 (Claude Code)\n'))), null);
  assert.equal(stored(home).seen, '2.1.322');
});

test('skips clear and compact, another event, and an unreadable payload', () => {
  const bin = fakeClaude('2.1.322 (Claude Code)\n');
  for (const payload of [
    { hook_event_name: 'SessionStart', source: 'clear' },
    { hook_event_name: 'SessionStart', source: 'compact' },
    { hook_event_name: 'Stop' },
    'not json',
  ]) {
    const home = tmp();
    assert.equal(run(home, { payload, ...at(bin) }), null);
    assert.equal(existsSync(stateFile(home)), false, JSON.stringify(payload));
  }
});

test('runs on resume', () => {
  const home = tmp();
  run(home, { payload: { hook_event_name: 'SessionStart', source: 'resume' }, ...at(fakeClaude('2.1.322 (Claude Code)\n')) });
  assert.equal(stored(home).seen, '2.1.322');
});

// --- #36: stale shims, in a bcp checkout only ---

/** A git checkout named `name` in plugin.json, with shim rows checked in the given months. */
function checkout(name, months) {
  const dir = tmp();
  spawnSync('git', ['init', '-q', dir]);
  mkdirSync(join(dir, '.claude-plugin'));
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name }));
  mkdirSync(join(dir, 'docs'));
  const rows = months.map((m, i) => `### S${i + 1} — shim ${i + 1}\n\n- **retire-when:** never.\n- **checked:** ${m}\n`);
  writeFileSync(join(dir, 'docs', 'native-overlap.md'), `# x\n\n## Shim rows\n\n${rows.join('\n')}\n## Other\n`);
  return dir;
}

const seed = (home, seen, at) => {
  mkdirSync(dirname(stateFile(home)), { recursive: true });
  writeFileSync(stateFile(home), JSON.stringify({ seen, at }));
};

test('a bcp checkout lists the shims checked before the month of the last version change', () => {
  const home = tmp();
  seed(home, '2.1.322', '2026-12-03');
  const cwd = checkout('bcp', ['2026-11', '2026-12', '2026-10']);
  const out = run(home, { ...at(fakeClaude('2.1.322 (Claude Code)\n')), cwd });
  assert.deepEqual(out, { systemMessage: 'bcp: 2 shims last checked before 2026-12: S1, S3 — run /bcp:shim-review' });
  assert.deepEqual(run(home, { ...at(fakeClaude('2.1.322 (Claude Code)\n')), cwd }), out); // every session until reviewed
});

test('the payload cwd decides the checkout', () => {
  const home = tmp();
  seed(home, '2.1.322', '2026-12-03');
  const cwd = checkout('bcp', ['2026-11']);
  const payload = { hook_event_name: 'SessionStart', source: 'startup', cwd };
  assert.match(run(home, { payload, ...at(fakeClaude('2.1.322 (Claude Code)\n')) }).systemMessage, /1 shim last checked before 2026-12: S1/);
});

test('an update and stale shims go out as one message', () => {
  const home = tmp();
  seed(home, '2.1.321', '2026-11-20');
  const cwd = checkout('bcp', ['2026-01']);
  const out = run(home, { ...at(fakeClaude('2.1.322 (Claude Code)\n')), cwd });
  const month = new Date().toISOString().slice(0, 7);
  assert.equal(out.systemMessage, `bcp: Claude Code updated 2.1.321 → 2.1.322\nbcp: 1 shim last checked before ${month}: S1 — run /bcp:shim-review`);
});

test('no stale list outside bcp, when all are current, or before any version is recorded', () => {
  const bin = at(fakeClaude('2.1.322 (Claude Code)\n'));
  let home = tmp();
  seed(home, '2.1.322', '2026-12-03');
  assert.equal(run(home, { ...bin, cwd: checkout('other-plugin', ['2026-01']) }), null);
  assert.equal(run(home, { ...bin, cwd: checkout('bcp', ['2026-12']) }), null);
  home = tmp(); // first run: `at` is today, and a shim checked this month is current
  const month = new Date().toISOString().slice(0, 7);
  assert.equal(run(home, { ...bin, cwd: checkout('bcp', [month]) }), null);
});
