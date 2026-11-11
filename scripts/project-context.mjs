#!/usr/bin/env node
// /bcp:context and the gates — read, confirm or reset the project facts (#24).
//
// The arguments arrive on stdin as one line:
//   (empty) | show           every fact, detecting what is missing
//   get <fact>               one fact (what the gates call)
//   confirm <fact> [value]   pin the detected value, or set one by hand
//   reset <fact>             forget a fact; it is detected again at next use
//
// The first line of `get` and each fact in `show` is `<fact>: <value>`, so a caller can read it
// without parsing the rest. Exit 1 on a usage error or outside a git repository.
import { readFileSync } from 'node:fs';
import { confirm, ensure, factNames, reset } from './lib/project-context.mjs';

const fail = (msg) => {
  console.error(`project-context: ${msg}`);
  process.exit(1);
};

let args = '';
if (!process.stdin.isTTY) {
  try {
    args = readFileSync(0, 'utf8');
  } catch {
    // no stdin: no arguments, so show
  }
}
const [verb = 'show', ...rest] = args.trim().split(/\s+/).filter(Boolean);

function describe(key, e) {
  const lines = [`${key}: ${e.value}`];
  if (e.bumps) {
    const bumps = Object.entries(e.bumps).map(([type, bump]) => `${type}: ${bump}`).join(', ');
    lines.push(`  bumps: ${bumps} (every other type: no bump)`);
  }
  if (e.note) lines.push(`  note: ${e.note}`);
  const state = e.confirmed ? `confirmed ${e.at}` : `unconfirmed, detected ${e.at}`;
  lines.push(`  from: ${e.from} (${state})`);
  return lines.join('\n');
}

const known = (name) => (factNames.includes(name) ? name : fail(`unknown fact ${JSON.stringify(name)}. Facts: ${factNames.join(', ')}`));
const warn = (found) => {
  if (found.corrupt) console.error('project-context: the context file did not parse; moved to project_context.md.corrupt and detected again');
  if (found.writeError) console.error(`project-context: could not save the context file: ${found.writeError}`);
};

if (verb === 'show' || verb === 'get') {
  if (verb === 'show' && rest.length) fail('show takes no arguments');
  if (verb === 'get' && rest.length !== 1) fail('get needs one fact');
  const keys = verb === 'get' ? [known(rest[0])] : factNames;
  const found = ensure(process.cwd(), keys);
  if (!found) fail('not in a git repository');
  warn(found);
  console.log(keys.map((key) => describe(key, found.entries[key])).join('\n'));
} else if (verb === 'confirm') {
  if (!rest.length) fail('confirm needs a fact');
  const key = known(rest[0]);
  try {
    console.log(describe(key, confirm(process.cwd(), key, rest.slice(1).join(' '))));
  } catch (err) {
    fail(err.message);
  }
} else if (verb === 'reset') {
  if (rest.length !== 1) fail('reset needs one fact');
  const key = known(rest[0]);
  try {
    reset(process.cwd(), key);
  } catch (err) {
    fail(err.message);
  }
  console.log(`${key} forgotten; it is detected again at next use.`);
} else {
  fail(`unknown command ${JSON.stringify(verb)}. Use show, get <fact>, confirm <fact> [value] or reset <fact>`);
}
