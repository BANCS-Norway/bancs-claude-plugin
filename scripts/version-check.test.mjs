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

function run(home, { payload = { hook_event_name: 'SessionStart', source: 'startup' }, env = {} } = {}) {
  const r = spawnSync(process.execPath, [hook], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { PATH: dirname(process.execPath), HOME: home, USERPROFILE: home, ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

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
  run(home, { env: { PATH: [dirname(bin), dirname(process.execPath)].join(delimiter) } });
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
