// Tests for the project context (#24). Run: npm run test:context
// Detection runs on real temporary repos; the CLI runs as the commands run it: node, arguments on
// stdin, a temporary HOME. The network is never used: "origin" is a local bare repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTEXT_FILE, FACTS, checkoutRoots, confirm, ensure, memoryDir } from './lib/project-context.mjs';

const cli = resolve(dirname(fileURLToPath(import.meta.url)), 'project-context.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'bcp-context-'));
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repo with one commit, in its own temp dir. `files` maps path to text. */
function repo(files = {}, { origin } = {}) {
  const dir = tmp();
  git(dir, 'init', '-q', '-b', 'main');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, 'add', '-A', '-f');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  if (origin) git(dir, 'remote', 'add', 'origin', origin);
  return dir;
}

const pkg = (extra = {}) => JSON.stringify({ name: 'x', ...extra });
const releaseOf = (files) => {
  const dir = repo(files);
  const inputs = FACTS.release.inputs(dir);
  return FACTS.release.detect(inputs, dir);
};
const factOf = (name, dir) => FACTS[name].detect(FACTS[name].inputs(dir), dir);

function run(args, { cwd, home } = {}) {
  const r = spawnSync(process.execPath, [cli], {
    cwd, input: args, encoding: 'utf8',
    env: { ...GIT_ENV, HOME: home, USERPROFILE: home },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const fileFor = (dir, home) => join(memoryDir(checkoutRoots(dir).main, home), CONTEXT_FILE);
const stored = (dir, home) => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(readFileSync(fileFor(dir, home), 'utf8'))[1]);

// ---- release: the four cases the issue names ------------------------------------------------

test('release: VitePress, by dependency or by directory', () => {
  const byDep = releaseOf({ 'package.json': pkg({ devDependencies: { vitepress: '1.0.0' } }) });
  assert.equal(byDep.value, 'vitepress');
  assert.deepEqual(byDep.bumps, { feat: 'minor', fix: 'patch', style: 'patch' });
  assert.equal(releaseOf({ 'docs/.vitepress/config.mjs': 'export default {}' }).value, 'vitepress');
});

test('release: semantic-release, by dependency, release key or config file', () => {
  const byDep = releaseOf({ 'package.json': pkg({ devDependencies: { 'semantic-release': '^24' } }) });
  assert.equal(byDep.value, 'semantic-release');
  assert.equal(byDep.bumps.feat, 'minor');
  assert.equal(byDep.bumps['BREAKING CHANGE'], 'major');
  assert.equal(releaseOf({ 'package.json': pkg({ release: { branches: ['main'] } }) }).value, 'semantic-release');
  assert.equal(releaseOf({ '.releaserc.json': '{}' }).value, 'semantic-release');
});

test('release: none when there is nothing to find, with or without a package.json', () => {
  assert.equal(releaseOf({ 'README.md': 'x' }).value, 'none');
  const bare = releaseOf({ 'package.json': pkg({ dependencies: { left: '1' } }) });
  assert.equal(bare.value, 'none');
  assert.equal(bare.bumps, undefined);
});

test('release: unknown when package.json cannot be parsed, and no guess is stored as a fact', () => {
  assert.equal(releaseOf({ 'package.json': '{ not json' }).value, 'unknown');
  assert.equal(releaseOf({ 'package.json': '[]' }).value, 'unknown');
  // other evidence still counts: a release config is a fact even beside a broken package.json
  assert.equal(releaseOf({ 'package.json': '{ not json', '.releaserc': '{}' }).value, 'semantic-release');
});

test('release: semantic-release wins when both are present', () => {
  const both = releaseOf({ 'package.json': pkg({ devDependencies: { 'semantic-release': '1', vitepress: '1' } }) });
  assert.equal(both.value, 'semantic-release');
});

// ---- the other facts ------------------------------------------------------------------------

test('direnv and ci_dir', () => {
  const dir = repo({ '.envrc': 'use flake', '.github/workflows/ci.yml': 'on: push' });
  assert.equal(factOf('direnv', dir).value, true);
  assert.equal(factOf('ci_dir', dir).value, '.github/workflows');
  const empty = repo({ 'README.md': 'x' });
  assert.equal(factOf('direnv', empty).value, false);
  assert.equal(factOf('ci_dir', empty).value, 'none');
  assert.equal(factOf('ci_dir', repo({ '.gitlab-ci.yml': 'x' })).value, '.gitlab-ci.yml');
});

test('test_command: package manager by lockfile, then Makefile, Cargo, go.mod, else unknown', () => {
  const test = (files) => factOf('test_command', repo(files)).value;
  assert.equal(test({ 'package.json': pkg({ scripts: { test: 'node --test' } }) }), 'npm test');
  assert.equal(test({ 'package.json': pkg({ scripts: { test: 'vitest' } }), 'pnpm-lock.yaml': '' }), 'pnpm test');
  assert.equal(test({ 'package.json': pkg({ scripts: { test: 'vitest' } }), 'yarn.lock': '' }), 'yarn test');
  assert.equal(test({ 'package.json': pkg({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }), 'unknown');
  assert.equal(test({ Makefile: 'build:\n\tx\ntest:\n\ty\n' }), 'make test');
  assert.equal(test({ 'Cargo.toml': '[package]' }), 'cargo test');
  assert.equal(test({ 'go.mod': 'module x' }), 'go test ./...');
  assert.equal(test({ 'README.md': 'x' }), 'unknown');
  assert.equal(test({ 'package.json': '{ broken' }), 'unknown');
});

test('repo: owner/name from a host URL; a local path or no remote is unknown, not a guess', () => {
  const of = (origin) => factOf('repo', repo({}, { origin }));
  assert.equal(of('https://github.com/BANCS-Norway/bancs-claude-plugin.git').value, 'BANCS-Norway/bancs-claude-plugin');
  assert.equal(of('https://github.com/BANCS-Norway/bancs-claude-plugin.git').github, true);
  assert.equal(of('git@github.com:o/n.git').value, 'o/n');
  assert.equal(of('ssh://git@gitlab.com/group/sub/proj.git').value, 'group/sub/proj');
  assert.equal(of('ssh://git@gitlab.com/group/sub/proj.git').github, false);
  assert.equal(of('/tmp/some/origin.git').value, 'unknown');
  assert.equal(factOf('repo', repo()).value, 'unknown');
});

test('default_branch: origin/HEAD, else the remote is asked, else unknown and not stored', () => {
  const bare = tmp();
  git(bare, 'init', '-q', '--bare', '-b', 'trunk');
  const work = repo({ 'a.txt': 'a' }, { origin: bare });
  git(work, 'branch', '-m', 'trunk');
  git(work, 'push', '-q', 'origin', 'trunk');
  assert.equal(factOf('default_branch', work).value, 'trunk'); // via ls-remote: origin/HEAD is not set
  git(work, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
  assert.equal(factOf('default_branch', work).from, 'origin/HEAD');

  const lost = repo({}, { origin: join(tmp(), 'nowhere.git') });
  const answer = factOf('default_branch', lost);
  assert.equal(answer.value, 'unknown');
  assert.equal(answer.transient, true);
  assert.equal(factOf('default_branch', repo()).value, 'unknown');
});

// ---- storing, confirming, fingerprints -------------------------------------------------------

test('the file lives in the main checkout\'s memory folder, also from a linked worktree', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg() });
  const linked = join(tmp(), 'wt');
  git(dir, 'worktree', 'add', '-q', linked, '-b', 'side');
  const fromLinked = ensure(linked, ['release'], { home });
  const fromMain = ensure(dir, ['release'], { home });
  assert.equal(fromLinked.file, fromMain.file);
  assert.equal(fromMain.file, join(home, '.claude', 'projects', checkoutRoots(dir).main.replace(/[^a-zA-Z0-9]/g, '-'), 'memory', CONTEXT_FILE));
  assert.equal(fromMain.entries.release.value, 'none');
  assert.equal(existsSync(fromMain.file), true);
});

test('once the file exists, an unchanged project is not detected again', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg() });
  let detections = 0;
  const counting = { release: { ...FACTS.release, detect: (...a) => (detections++, FACTS.release.detect(...a)) } };
  ensure(dir, ['release'], { home, facts: counting });
  ensure(dir, ['release'], { home, facts: counting });
  ensure(dir, ['release'], { home, facts: counting });
  assert.equal(detections, 1);
});

test('an unconfirmed fact is detected again when its fingerprint changes', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg() });
  assert.equal(ensure(dir, ['release'], { home }).entries.release.value, 'none');
  writeFileSync(join(dir, 'package.json'), pkg({ devDependencies: { 'semantic-release': '1' } }));
  assert.equal(ensure(dir, ['release'], { home }).entries.release.value, 'semantic-release');
  // a version bump alone does not change what release was detected from
  const before = stored(dir, home).release.fingerprint;
  writeFileSync(join(dir, 'package.json'), pkg({ version: '9.9.9', devDependencies: { 'semantic-release': '1' } }));
  ensure(dir, ['release'], { home });
  assert.equal(stored(dir, home).release.fingerprint, before);
});

test('a confirmed fact survives a run, even when the project changes under it', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg() });
  assert.equal(run('confirm release none', { cwd: dir, home }).code, 0);
  writeFileSync(join(dir, 'package.json'), pkg({ devDependencies: { 'semantic-release': '1' } }));
  const got = run('get release', { cwd: dir, home });
  assert.match(got.out, /^release: none$/m);
  assert.match(got.out, /confirmed/);
  assert.equal(stored(dir, home).release.confirmed, true);
});

test('a confirmed fact is not even detected again', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg() });
  confirm(dir, 'release', 'vitepress', { home });
  let detections = 0;
  const counting = { release: { ...FACTS.release, detect: (...a) => (detections++, FACTS.release.detect(...a)) } };
  const got = ensure(dir, ['release'], { home, facts: counting });
  assert.equal(detections, 0);
  assert.equal(got.entries.release.value, 'vitepress');
});

test('a confirmation that lands while another clone is detecting is not overwritten', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg() });
  // `detect` runs after ensure has read the file and before it writes: the other clone confirms here
  const racing = {
    release: {
      ...FACTS.release,
      detect: (...a) => {
        confirm(dir, 'release', 'vitepress', { home });
        return FACTS.release.detect(...a);
      },
    },
  };
  const got = ensure(dir, ['release'], { home, facts: racing });
  assert.equal(got.entries.release.value, 'vitepress');
  assert.equal(got.entries.release.confirmed, true);
  assert.equal(stored(dir, home).release.value, 'vitepress');
});

test('confirm without a value pins the detected one; an unknown value cannot be pinned', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg({ devDependencies: { vitepress: '1' } }), '.envrc': 'x' });
  const pinned = run('confirm release', { cwd: dir, home });
  assert.equal(pinned.code, 0);
  assert.match(pinned.out, /^release: vitepress$/m);
  assert.equal(stored(dir, home).release.confirmed, true);
  const none = run('confirm default_branch', { cwd: dir, home }); // no origin: unknown
  assert.equal(none.code, 1);
  assert.match(none.err, /nothing to confirm/);
  assert.equal(stored(dir, home).default_branch?.confirmed ?? false, false);
});

test('confirm validates what it is given and writes nothing when it refuses', () => {
  const home = tmp();
  const dir = repo();
  for (const args of ['confirm release maven', 'confirm release constructor', 'confirm direnv maybe', 'confirm repo justaname', 'confirm nope x']) {
    assert.equal(run(args, { cwd: dir, home }).code, 1, args);
  }
  assert.equal(existsSync(fileFor(dir, home)), false);
  assert.match(run('confirm test_command make check', { cwd: dir, home }).out, /^test_command: make check$/m);
  assert.equal(run('confirm direnv true', { cwd: dir, home }).code, 0);
  assert.equal(stored(dir, home).direnv.value, true);
});

test('reset forgets a fact, confirmed or not, and it is detected again', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg() });
  run('confirm release vitepress', { cwd: dir, home });
  assert.match(run('get release', { cwd: dir, home }).out, /^release: vitepress$/m);
  assert.equal(run('reset release', { cwd: dir, home }).code, 0);
  assert.match(run('get release', { cwd: dir, home }).out, /^release: none$/m);
});

test('a failed network answer is shown but not stored, so the next gate asks again', () => {
  const home = tmp();
  const dir = repo({}, { origin: join(tmp(), 'nowhere.git') });
  const got = run('get default_branch', { cwd: dir, home });
  assert.match(got.out, /^default_branch: unknown$/m);
  assert.equal(existsSync(fileFor(dir, home)), false);
});

// ---- the file itself -------------------------------------------------------------------------

test('two clones writing at once leave one whole, parseable file with every fact', async () => {
  const home = tmp();
  const bare = tmp();
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const dir = repo({ 'package.json': pkg({ scripts: { test: 'x' } }) }, { origin: bare });
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'); // no network
  const runs = Array.from({ length: 8 }, () => new Promise((done) => {
    const child = spawn(process.execPath, [cli], { cwd: dir, env: { ...GIT_ENV, HOME: home, USERPROFILE: home } });
    child.stdin.end('show');
    child.on('close', done);
  }));
  const codes = await Promise.all(runs);
  assert.deepEqual(codes, Array(8).fill(0));
  assert.deepEqual(Object.keys(stored(dir, home)).sort(), Object.keys(FACTS).sort());
  assert.deepEqual(readFileSync(fileFor(dir, home), 'utf8').match(/^```json$/gm), ['```json']);
});

test('a file that does not parse is moved aside, not overwritten', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg() });
  run('show', { cwd: dir, home });
  const file = fileFor(dir, home);
  writeFileSync(file, '---\nname: project_context\n---\n```json\n{ broken\n```\n');
  const got = run('get release', { cwd: dir, home });
  assert.equal(got.code, 0);
  assert.match(got.err, /project_context\.md\.corrupt/);
  assert.match(readFileSync(`${file}.corrupt`, 'utf8'), /broken/);
  assert.equal(stored(dir, home).release.value, 'none');
});

test('the file is indexed once in MEMORY.md, keeping what is already there', () => {
  const home = tmp();
  const dir = repo();
  const memory = dirname(fileFor(dir, home));
  mkdirSync(memory, { recursive: true });
  writeFileSync(join(memory, 'MEMORY.md'), '# Memory Index\n\n- [Other](other.md) — keep me');
  run('show', { cwd: dir, home });
  run('reset repo', { cwd: dir, home });
  run('show', { cwd: dir, home });
  const index = readFileSync(join(memory, 'MEMORY.md'), 'utf8');
  assert.match(index, /- \[Other\]\(other\.md\) — keep me\n- \[Project context\]\(project_context\.md\)/);
  assert.equal(index.match(/project_context\.md/g).length, 1);
});

// ---- the command line ------------------------------------------------------------------------

test('show and get print `<fact>: <value>` first; arguments are checked by the script', () => {
  const home = tmp();
  const dir = repo({ 'package.json': pkg({ scripts: { test: 'x' } }) });
  const shown = run('', { cwd: dir, home });
  assert.equal(shown.code, 0);
  for (const key of Object.keys(FACTS)) assert.match(shown.out, new RegExp(`^${key}: `, 'm'));
  assert.match(run('get test_command', { cwd: dir, home }).out, /^test_command: npm test\n/);
  for (const args of ['get', 'get nope', 'get release extra', 'show release', 'reset', 'frobnicate']) {
    assert.equal(run(args, { cwd: dir, home }).code, 1, args);
  }
});

test('outside a git repository it says so and writes nothing', () => {
  const home = tmp();
  const got = run('show', { cwd: tmp(), home });
  assert.equal(got.code, 1);
  assert.match(got.err, /not in a git repository/);
  assert.equal(existsSync(join(home, '.claude')), false);
});
