#!/usr/bin/env node
// Finds the issue work logs (#69); the one place the folder is computed, so no skill spells it.
//
// The arguments arrive on stdin as one line:
//   memory            the shared memory folder (from the main checkout, the same inside a worktree);
//                     it holds the work logs and the issue cache, project_issues.md
//   path <issue>      the log file to read or append to, or `none`; reads log.md, work-log.md and the
//                     flat issue-<issue>.md, in that order
//   create <issue>    makes issues/<issue>/ and prints the log to use: the existing one, else where a new
//                     log.md goes (it writes no log)
//   active            one `<issue> <file>` line per issue that has a log, in issue order
//   remove <issue>    deletes the issue's folder and its flat file; one line per path removed
//
// The first line of each answer is `<verb>: <value>` where there is one value. Exit 1 on a usage
// error or outside a git repository.
import { readFileSync } from 'node:fs';
import { activeLogs, createLogFolder, findLog, memoryFolder, removeLogs } from './lib/work-log.mjs';

const fail = (msg) => {
  console.error(`work-log: ${msg}`);
  process.exit(1);
};

let args = '';
if (!process.stdin.isTTY) {
  try {
    args = readFileSync(0, 'utf8');
  } catch {
    // no stdin: no arguments
  }
}
const [verb, ...rest] = args.trim().split(/\s+/).filter(Boolean);
const memory = memoryFolder(process.cwd());
if (!memory) fail('not in a git repository');

const needIssue = () => {
  if (rest.length !== 1 || !/^\d+$/.test(rest[0])) fail(`${verb} needs one issue number`);
  return Number(rest[0]);
};

if (verb === 'memory') {
  if (rest.length) fail('memory takes no arguments');
  console.log(`memory: ${memory}`);
} else if (verb === 'path') {
  console.log(`path: ${findLog(memory, needIssue()) ?? 'none'}`);
} else if (verb === 'create') {
  console.log(`path: ${createLogFolder(memory, needIssue())}`);
} else if (verb === 'active') {
  if (rest.length) fail('active takes no arguments');
  for (const { issue, file } of activeLogs(memory)) console.log(`${issue} ${file}`);
} else if (verb === 'remove') {
  const removed = removeLogs(memory, needIssue());
  console.log(removed.length ? removed.map((p) => `removed: ${p}`).join('\n') : 'removed: nothing');
} else {
  fail('expected memory | path <issue> | create <issue> | active | remove <issue>');
}
