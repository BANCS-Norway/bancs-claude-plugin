// Where the issue work logs live, and which layouts are readable (#69, decided in #40; see
// docs/work-log-location.md). The folder comes from the main checkout, so a session started inside a
// worktree and one started in the primary clone see the same logs.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutRoots, memoryDir } from './project-context.mjs';

/** The log file names inside `issues/{NNN}/`, current layout first. */
const IN_FOLDER = ['log.md', 'work-log.md'];

/** The shared memory folder for the repo `cwd` is in, or null outside a git repository. */
export function memoryFolder(cwd, home) {
  const roots = checkoutRoots(cwd);
  return roots ? memoryDir(roots.main, home) : null;
}

const folderOf = (memory, issue) => join(memory, 'issues', String(issue));
const flatOf = (memory, issue) => join(memory, `issue-${issue}.md`);

/** The log file to read for `issue`, preferring the current layout; null when none exists. */
export function findLog(memory, issue) {
  for (const name of IN_FOLDER) {
    const file = join(folderOf(memory, issue), name);
    if (existsSync(file)) return file;
  }
  const flat = flatOf(memory, issue);
  return existsSync(flat) ? flat : null;
}

/** The issues that have a log, as [{ issue, file }] in issue order, across every layout. */
export function activeLogs(memory) {
  const issues = new Set();
  const read = (dir) => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  };
  for (const e of read(join(memory, 'issues'))) if (e.isDirectory() && /^\d+$/.test(e.name)) issues.add(Number(e.name));
  for (const e of read(memory)) {
    const m = /^issue-(\d+)\.md$/.exec(e.name);
    if (e.isFile() && m) issues.add(Number(m[1]));
  }
  return [...issues]
    .sort((a, b) => a - b)
    .map((issue) => ({ issue, file: findLog(memory, issue) }))
    .filter((e) => e.file);
}

/**
 * Makes `issues/{NNN}/` and returns the log to use: the one already there, in any layout (so a new log never
 * shadows a legacy one), else the path a new `log.md` goes to. Writes no log itself.
 */
export function createLogFolder(memory, issue) {
  mkdirSync(folderOf(memory, issue), { recursive: true });
  return findLog(memory, issue) ?? join(folderOf(memory, issue), IN_FOLDER[0]);
}

/** Removes the per-issue folder and the flat legacy file; returns what was there. */
export function removeLogs(memory, issue) {
  const removed = [];
  for (const target of [folderOf(memory, issue), flatOf(memory, issue)]) {
    if (!existsSync(target)) continue;
    rmSync(target, { recursive: true, force: true });
    removed.push(target);
  }
  return removed;
}
