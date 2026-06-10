// Tests for the shared hook helper and the SessionStart hook. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPayload, shouldRun, toolPath } from './lib/hook.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'bcp-hook-'));

test('readPayload parses JSON from a file descriptor', () => {
  const f = join(tmp(), 'payload.json');
  writeFileSync(f, '{"hook_event_name":"SessionStart","source":"startup"}');
  assert.deepEqual(readPayload(openSync(f, 'r')), { hook_event_name: 'SessionStart', source: 'startup' });
});

test('readPayload returns {} for empty input and null for anything unreadable', () => {
  const dir = tmp();
  const read = (name, text) => {
    writeFileSync(join(dir, name), text);
    return readPayload(openSync(join(dir, name), 'r'));
  };
  assert.deepEqual(read('empty', ''), {});
  assert.deepEqual(read('blank', ' \n'), {});
  assert.equal(read('bad', 'not json'), null);
  assert.equal(read('array', '[1]'), null);
  assert.equal(read('scalar', '"x"'), null);
  assert.equal(readPayload(99999), null); // not an open descriptor
});

test('toolPath reads file_path, path or notebook_path and normalises backslashes', () => {
  assert.equal(toolPath({ tool_input: { file_path: 'C:\\repo\\memory\\MEMORY.md' } }), 'C:/repo/memory/MEMORY.md');
  assert.equal(toolPath({ tool_input: { path: '/a/b' } }), '/a/b');
  assert.equal(toolPath({ tool_input: { notebook_path: '/n.ipynb' } }), '/n.ipynb');
  assert.equal(toolPath({}), undefined);
});

test('shouldRun never runs on an unreadable payload', () => {
  assert.equal(shouldRun(null), false);
  assert.equal(shouldRun(null, { event: 'SessionStart' }), false);
  assert.equal(shouldRun({}), true);
});

test('shouldRun filters by event', () => {
  assert.equal(shouldRun({ hook_event_name: 'SessionStart' }, { event: 'SessionStart' }), true);
  assert.equal(shouldRun({ hook_event_name: 'Stop' }, { event: 'SessionStart' }), false);
  assert.equal(shouldRun({}, { event: 'SessionStart' }), true); // payload names no event
});

test('shouldRun filters by path, including Windows paths', () => {
  const memory = { path: /\/MEMORY\.md$/ };
  assert.equal(shouldRun({ tool_input: { file_path: '/p/memory/MEMORY.md' } }, memory), true);
  assert.equal(shouldRun({ tool_input: { file_path: 'C:\\p\\memory\\MEMORY.md' } }, memory), true);
  assert.equal(shouldRun({ tool_input: { file_path: '/p/README.md' } }, memory), false);
  assert.equal(shouldRun({}, memory), false);
});

// --- session-start.mjs, run as Claude Code runs it: node, payload on stdin ---

function fixture({ index } = {}) {
  const root = join(tmp(), 'plugin');
  mkdirSync(join(root, 'workforces'), { recursive: true });
  writeFileSync(join(root, 'workforces', 'index.json'), index ?? '{"default":"alpha","workforces":[]}');
  writeFileSync(join(root, 'workforces', 'alpha.json'), '{"id":"alpha"}');
  return { root, home: tmp() };
}

function runHook({ root, home }, payload = { hook_event_name: 'SessionStart' }, env = {}) {
  return spawnSync(process.execPath, [resolve(scripts, 'session-start.mjs')], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: root, ...env },
  });
}

const activeFile = (home) => join(home, '.claude', 'bcp', 'workforce.json');

test('session-start seeds the default workforce on first run', () => {
  const fx = fixture();
  const r = runHook(fx);
  assert.equal(r.status, 0);
  assert.equal(readFileSync(activeFile(fx.home), 'utf8'), '{"id":"alpha"}');
  assert.match(r.stderr, /seeded default workforce 'alpha'/);
});

test('session-start never overwrites an existing active workforce', () => {
  const fx = fixture();
  mkdirSync(join(fx.home, '.claude', 'bcp'), { recursive: true });
  writeFileSync(activeFile(fx.home), '{"id":"mine"}');
  assert.equal(runHook(fx).status, 0);
  assert.equal(readFileSync(activeFile(fx.home), 'utf8'), '{"id":"mine"}');
});

test('session-start does nothing for another event', () => {
  const fx = fixture();
  assert.equal(runHook(fx, { hook_event_name: 'Stop' }).status, 0);
  assert.equal(existsSync(activeFile(fx.home)), false);
});

test('session-start does nothing on an unreadable payload, and still seeds on an empty one', () => {
  const bad = fixture();
  assert.equal(runHook(bad, 'not json').status, 0);
  assert.equal(existsSync(activeFile(bad.home)), false);
  const empty = fixture();
  assert.equal(runHook(empty, '').status, 0);
  assert.equal(existsSync(activeFile(empty.home)), true);
});

test('session-start does nothing outside an installed plugin', () => {
  const fx = fixture();
  assert.equal(runHook(fx, undefined, { CLAUDE_PLUGIN_ROOT: '' }).status, 0);
  assert.equal(existsSync(activeFile(fx.home)), false);
});

test('session-start exits 0 on an unreadable or unsafe index', () => {
  for (const index of ['not json', '{"default":"../evil"}', '{"default":"missing"}', '{}']) {
    const fx = fixture({ index });
    assert.equal(runHook(fx).status, 0, index);
    assert.equal(existsSync(activeFile(fx.home)), false, index);
  }
});

// --- memory-lock.mjs: serialize MEMORY.md writes ---

function lockFixture() {
  const dir = tmp();
  return { dir, memory: join(dir, 'MEMORY.md'), lock: join(dir, 'MEMORY.md.lock') };
}

function runLock(mode, filePath, env = {}, extra = {}) {
  return spawnSync(process.execPath, [resolve(scripts, 'memory-lock.mjs'), mode], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's1', tool_input: { file_path: filePath }, ...extra }),
    encoding: 'utf8',
    env: { PATH: process.env.PATH, BCP_MEMORY_LOCK_TIMEOUT: '0', ...env },
  });
}

test('memory-lock acquire takes the lock and records the holder', () => {
  const fx = lockFixture();
  const r = runLock('acquire', fx.memory, { BCP_CLONE: 'echo' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  const holder = readFileSync(join(fx.lock, 'holder'), 'utf8');
  assert.match(holder, /clone=echo/);
  assert.match(holder, /session=s1/);
});

test('memory-lock release clears the lock', () => {
  const fx = lockFixture();
  runLock('acquire', fx.memory);
  assert.equal(runLock('release', fx.memory).status, 0);
  assert.equal(existsSync(fx.lock), false);
});

test('memory-lock asks the human when the lock is held past the timeout', () => {
  const fx = lockFixture();
  runLock('acquire', fx.memory, { BCP_CLONE: 'first' });
  const r = runLock('acquire', fx.memory);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /clone=first/);
  assert.equal(existsSync(fx.lock), true); // never broken without approval
});

test('memory-lock waits for a holder that releases within the timeout', async () => {
  const fx = lockFixture();
  runLock('acquire', fx.memory);
  const waiter = spawn(process.execPath, [resolve(scripts, 'memory-lock.mjs'), 'acquire'], {
    env: { PATH: process.env.PATH, BCP_MEMORY_LOCK_TIMEOUT: '5' },
  });
  let stdout = '';
  waiter.stdout.on('data', (d) => (stdout += d));
  waiter.stdin.end(JSON.stringify({ tool_input: { file_path: fx.memory } }));
  await new Promise((r) => setTimeout(r, 400));
  runLock('release', fx.memory);
  await new Promise((r) => waiter.on('close', r));
  assert.equal(stdout, ''); // acquired without asking
  assert.equal(existsSync(join(fx.lock, 'holder')), true); // the waiter now holds it
});

test('memory-lock ignores other files, other modes and unreadable payloads', () => {
  const fx = lockFixture();
  assert.equal(runLock('acquire', join(fx.dir, 'README.md')).status, 0);
  assert.equal(existsSync(fx.lock), false);
  assert.equal(runLock('bogus', fx.memory).status, 0);
  assert.equal(existsSync(fx.lock), false);
  const bad = spawnSync(process.execPath, [resolve(scripts, 'memory-lock.mjs'), 'acquire'], { input: 'not json', encoding: 'utf8' });
  assert.equal(bad.status, 0);
});

test('memory-lock matches Windows-style paths', () => {
  const fx = lockFixture();
  const r = runLock('acquire', fx.memory.replaceAll('/', '\\'));
  assert.equal(r.status, 0);
  // On POSIX the backslash path is one odd directory name; the point is it passed the filter.
  assert.equal(r.stdout, '');
});
