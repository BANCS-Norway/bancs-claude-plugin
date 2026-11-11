// Per-project context (#24): facts about a repo that every gate needs and that do not change
// between gates, detected once and kept in the project's memory folder. One implementation of
// detect-and-read, so a skill asks instead of guessing, and the user has one place to correct it.
//
// Rules (docs/project-context.md):
//   - Unknown is unknown: a fact that cannot be detected is `unknown`, never a guess.
//   - A `confirmed` fact is never overwritten by detection.
//   - An unconfirmed fact is detected again only when its fingerprint (what it was detected from)
//     changes. Reading the fingerprint is cheap; detecting happens only on a miss.
//   - A failure that may pass (the remote did not answer) is returned but not stored.
//   - Writes go through a temp file and `rename`, and merge with what is on disk at that moment.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { git } from './repo.mjs';

export const CONTEXT_FILE = 'project_context.md';

const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
const today = () => new Date().toISOString().slice(0, 10);

/** File text, `null` when absent, `undefined` when it is there but cannot be read. */
function read(root, rel) {
  try {
    return readFileSync(join(root, rel), 'utf8');
  } catch (err) {
    return err.code === 'ENOENT' ? null : undefined;
  }
}

/** package.json: { present, unreadable, pkg } where `pkg` is the parsed object or null. */
function readPackage(root) {
  const text = read(root, 'package.json');
  if (text === null) return { present: false, unreadable: false, pkg: null };
  try {
    const pkg = JSON.parse(text);
    if (pkg && typeof pkg === 'object' && !Array.isArray(pkg)) return { present: true, unreadable: false, pkg };
  } catch {
    // falls through: unreadable
  }
  return { present: true, unreadable: true, pkg: null };
}

/** `git`, but with a time limit and never asking for credentials: it talks to the network. */
function gitRemote(root, ms, ...args) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: ms,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }).trim();
  } catch {
    return undefined;
  }
}

// ---- where things live --------------------------------------------------------------------

/**
 * `top` is this checkout (the files to detect from); `main` is the main checkout, which names the
 * project. A linked worktree has its own path, so the memory folder must come from `main`, or each
 * worktree would write a second file.
 */
export function checkoutRoots(cwd) {
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  if (!top) return null;
  const common = git(cwd, 'rev-parse', '--git-common-dir');
  const gitDir = common ? resolve(cwd, common) : null;
  const main = gitDir && basename(gitDir) === '.git' ? dirname(gitDir) : top;
  return { top, main };
}

/** Claude Code names a project's memory folder after its path, every other character a `-`. */
export function memoryDir(main, home = homedir()) {
  return join(home, '.claude', 'projects', main.replace(/[^a-zA-Z0-9]/g, '-'), 'memory');
}

// ---- the facts ----------------------------------------------------------------------------
// Each fact has `inputs(root)` (cheap, offline: what it is detected from, as plain data) and
// `detect(inputs, root)` (the answer). The fingerprint is a hash of `inputs`, so detection runs only
// when the inputs change. `parse(text)` validates a value the user sets by hand.

const BUMPS = {
  'semantic-release': { feat: 'minor', fix: 'patch', perf: 'patch', 'BREAKING CHANGE': 'major' },
  vitepress: { feat: 'minor', fix: 'patch', style: 'patch' },
  none: undefined,
};
const SEMANTIC_NOTE = 'semantic-release defaults; a releaseRules entry in the release config overrides them';
const RELEASERC = [
  '.releaserc', '.releaserc.json', '.releaserc.yaml', '.releaserc.yml', '.releaserc.js', '.releaserc.cjs',
  '.releaserc.mjs', 'release.config.js', 'release.config.cjs', 'release.config.mjs', 'release.config.ts',
];
const VITEPRESS_DIRS = ['.vitepress', 'docs/.vitepress'];
const CI_PATHS = ['.github/workflows', '.gitlab-ci.yml', '.circleci', 'azure-pipelines.yml', 'Jenkinsfile', '.buildkite'];

const releaseExtras = (value) => (BUMPS[value] ? { bumps: BUMPS[value] } : {});

function releaseInputs(root) {
  const { unreadable, pkg } = readPackage(root);
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  return {
    unreadable,
    semanticDep: 'semantic-release' in deps,
    releaseKey: Boolean(pkg && 'release' in pkg),
    rc: RELEASERC.filter((f) => existsSync(join(root, f))),
    vitepressDep: 'vitepress' in deps,
    vitepressDir: VITEPRESS_DIRS.filter((d) => existsSync(join(root, d))),
  };
}

function detectRelease(i) {
  const semantic = [
    i.semanticDep && 'semantic-release in the package.json dependencies',
    i.releaseKey && 'a "release" key in package.json',
    ...i.rc,
  ].filter(Boolean);
  if (semantic.length) {
    return { value: 'semantic-release', from: semantic.join('; '), ...releaseExtras('semantic-release'), note: SEMANTIC_NOTE };
  }
  const vitepress = [i.vitepressDep && 'vitepress in the package.json dependencies', ...i.vitepressDir.map((d) => `${d}/`)].filter(Boolean);
  if (vitepress.length) return { value: 'vitepress', from: vitepress.join('; '), ...releaseExtras('vitepress') };
  if (i.unreadable) return { value: 'unknown', from: 'package.json exists but cannot be read or parsed' };
  return { value: 'none', from: 'no semantic-release or VitePress marker found' };
}

function detectRepo(i) {
  const m = i.remote && /^(?:[a-z+]+:\/\/(?:[^@/]+@)?|[^@/\s]+@)([^/:]+)[:/](.+?)(?:\.git)?\/?$/i.exec(i.remote);
  if (!m || !m[2].includes('/')) {
    return { value: 'unknown', from: i.remote ? 'the origin remote is not a host URL' : 'no origin remote' };
  }
  return { value: m[2], from: 'origin remote', host: m[1], github: m[1].toLowerCase() === 'github.com' };
}

function testInputs(root) {
  const { unreadable, pkg } = readPackage(root);
  const script = pkg?.scripts?.test;
  const pm = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(join(root, 'yarn.lock')) ? 'yarn'
      : existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb')) ? 'bun' : 'npm';
  return {
    unreadable,
    pkgTest: typeof script === 'string' && !/no test specified/i.test(script) ? script : null,
    pm,
    makeTest: /^test:/m.test(read(root, 'Makefile') ?? ''),
    cargo: existsSync(join(root, 'Cargo.toml')),
    go: existsSync(join(root, 'go.mod')),
  };
}

function detectTest(i) {
  if (i.pkgTest) return { value: `${i.pm} test`, from: `scripts.test in package.json (${i.pm})` };
  if (i.makeTest) return { value: 'make test', from: 'a test target in the Makefile' };
  if (i.cargo) return { value: 'cargo test', from: 'Cargo.toml' };
  if (i.go) return { value: 'go test ./...', from: 'go.mod' };
  return { value: 'unknown', from: i.unreadable ? 'package.json cannot be read' : 'no package.json test script, Makefile test target, Cargo.toml or go.mod' };
}

const anyText = (text) => {
  if (!text) throw new Error('a value is needed');
  return text;
};

export const FACTS = {
  release: {
    inputs: releaseInputs,
    detect: detectRelease,
    parse: (text) => {
      if (!Object.hasOwn(BUMPS, text)) throw new Error(`release is one of: ${Object.keys(BUMPS).join(', ')}`);
      return text;
    },
    extras: releaseExtras,
  },
  direnv: {
    inputs: (root) => ({ envrc: existsSync(join(root, '.envrc')) }),
    detect: (i) => ({ value: i.envrc, from: i.envrc ? '.envrc' : 'no .envrc' }),
    parse: (text) => {
      if (text !== 'true' && text !== 'false') throw new Error('direnv is true or false');
      return text === 'true';
    },
  },
  ci_dir: {
    inputs: (root) => ({ found: CI_PATHS.filter((p) => existsSync(join(root, p))) }),
    detect: (i) => (i.found.length
      ? { value: i.found[0], from: i.found.join(', ') }
      : { value: 'none', from: `none of ${CI_PATHS.join(', ')}` }),
    parse: anyText,
  },
  default_branch: {
    inputs: (root) => ({
      remote: git(root, 'remote', 'get-url', 'origin') ?? null,
      head: git(root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD') ?? null,
    }),
    detect: (i, root) => {
      if (i.head) return { value: i.head.replace(/^origin\//, ''), from: 'origin/HEAD' };
      if (!i.remote) return { value: 'unknown', from: 'no origin remote' };
      // origin/HEAD is not set in a repo made with `git init` and `git remote add`; ask the remote.
      const out = gitRemote(root, 5000, 'ls-remote', '--symref', 'origin', 'HEAD');
      const m = out && /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(out);
      return m
        ? { value: m[1], from: 'git ls-remote origin' }
        : { value: 'unknown', from: 'origin did not answer; asked again next time', transient: true };
    },
    parse: anyText,
  },
  test_command: {
    inputs: testInputs,
    detect: detectTest,
    parse: anyText,
  },
  repo: {
    inputs: (root) => ({ remote: git(root, 'remote', 'get-url', 'origin') ?? null }),
    detect: detectRepo,
    parse: (text) => {
      if (!/^[^\s/]+(?:\/[^\s/]+)+$/.test(text)) throw new Error('repo is owner/name');
      return text;
    },
  },
};

// ---- the file -----------------------------------------------------------------------------

const POINTER = '- [Project context](project_context.md) — release, direnv, CI, default branch, test command and repo, detected once for every bcp gate; /bcp:context to confirm or correct';

function render(facts) {
  return [
    '---',
    'name: project_context',
    'description: Project facts bcp detected once (release, direnv, CI, default branch, test command, repo); every gate reads them. Confirm or correct with /bcp:context.',
    'type: project',
    '---',
    '',
    'Written by bcp (scripts/project-context.mjs). Edit with `/bcp:context`, not by hand: a hand edit that breaks the JSON moves this file aside as `project_context.md.corrupt`.',
    '',
    '```json',
    JSON.stringify(facts, null, 2),
    '```',
    '',
  ].join('\n');
}

/** { facts, corrupt }. A file that does not parse is moved aside, never overwritten in place. */
function load(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { facts: {} };
  }
  try {
    const facts = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)[1]);
    if (facts && typeof facts === 'object' && !Array.isArray(facts)) return { facts };
  } catch {
    // falls through: corrupt
  }
  try {
    renameSync(file, `${file}.corrupt`);
  } catch {
    // leave it
  }
  return { facts: {}, corrupt: true };
}

/** Read what is on disk now, apply `mutate`, write atomically. Returns the facts as written. */
function update(file, mutate) {
  const { facts } = load(file);
  const next = mutate(facts) ?? facts;
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, render(next));
  renameSync(tmp, file);
  indexInMemory(dirname(file));
  return next;
}

function indexInMemory(dir) {
  const index = join(dir, 'MEMORY.md');
  let text = '';
  try {
    text = readFileSync(index, 'utf8');
  } catch {
    // no index yet
  }
  if (text.includes(`(${CONTEXT_FILE})`)) return;
  appendFileSync(index, `${text ? (text.endsWith('\n') ? '' : '\n') : '# Memory Index\n\n'}${POINTER}\n`);
}

const valid = (entry) => entry && typeof entry === 'object' && 'value' in entry;

// ---- the API ------------------------------------------------------------------------------

export const factNames = Object.keys(FACTS);

/**
 * The facts named by `keys` for the project `cwd` is in, detecting what is missing or stale and
 * writing it. Returns { file, entries, corrupt, writeError }, or null outside a git repository.
 * Never throws: a write that fails still returns the entries.
 */
export function ensure(cwd, keys = factNames, { facts = FACTS, home } = {}) {
  const roots = checkoutRoots(cwd);
  if (!roots) return null;
  const file = join(memoryDir(roots.main, home), CONTEXT_FILE);
  const { facts: stored, corrupt } = load(file);
  const entries = {};
  const staged = {};
  for (const key of keys) {
    const fact = facts[key];
    const have = stored[key];
    if (valid(have) && have.confirmed) {
      entries[key] = have;
      continue;
    }
    const inputs = fact.inputs(roots.top);
    const fingerprint = sha(inputs);
    if (valid(have) && have.fingerprint === fingerprint) {
      entries[key] = have;
      continue;
    }
    const { transient, ...found } = fact.detect(inputs, roots.top);
    entries[key] = { ...found, at: today(), confirmed: false, fingerprint };
    if (!transient) staged[key] = entries[key];
  }
  let writeError;
  if (Object.keys(staged).length) {
    try {
      const written = update(file, (disk) => {
        for (const [key, entry] of Object.entries(staged)) {
          if (!(valid(disk[key]) && disk[key].confirmed)) disk[key] = entry;
        }
      });
      for (const key of Object.keys(staged)) if (valid(written[key])) entries[key] = written[key];
    } catch (err) {
      writeError = err.message;
    }
  }
  return { file, entries, corrupt, writeError };
}

/**
 * Pin a fact: `text` sets it by hand, none keeps what was detected. Throws an Error with a message
 * for the user when the fact or value is wrong. Returns the stored entry.
 */
export function confirm(cwd, key, text, { facts = FACTS, home } = {}) {
  const fact = facts[key];
  if (!fact) throw new Error(`unknown fact ${JSON.stringify(key)}. Facts: ${Object.keys(facts).join(', ')}`);
  const roots = checkoutRoots(cwd);
  if (!roots) throw new Error('not in a git repository');
  const file = join(memoryDir(roots.main, home), CONTEXT_FILE);
  let entry;
  if (text) {
    const value = fact.parse(text);
    entry = { value, from: 'set by hand', ...(fact.extras?.(value) ?? {}), at: today(), confirmed: true };
  } else {
    const found = ensure(cwd, [key], { facts, home }).entries[key];
    if (found.value === 'unknown') throw new Error(`${key} is unknown, so there is nothing to confirm; give a value: confirm ${key} <value>`);
    entry = { ...found, at: today(), confirmed: true };
  }
  update(file, (disk) => {
    disk[key] = entry;
  });
  return entry;
}

/** Forget a fact (confirmed or not); the next use detects it again. */
export function reset(cwd, key, { facts = FACTS, home } = {}) {
  if (!facts[key]) throw new Error(`unknown fact ${JSON.stringify(key)}. Facts: ${Object.keys(facts).join(', ')}`);
  const roots = checkoutRoots(cwd);
  if (!roots) throw new Error('not in a git repository');
  update(join(memoryDir(roots.main, home), CONTEXT_FILE), (disk) => {
    delete disk[key];
  });
}
