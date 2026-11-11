#!/usr/bin/env node
// CI check: a pull request links an issue (#46). Run by .github/workflows/linked-issue.yml.
//
// The pull request number arrives on stdin as one line. Needs `gh` and GH_TOKEN. A PR counts as linked
// when GitHub links an issue to it (`closingIssuesReferences`: a closing keyword in the description, or the
// sidebar), when the description has a closing keyword (`Closes`, `Fixes`, `Resolves` and their forms) before an
// issue, or when it says `Part of #N`, for work that spans PRs.
// The description is read directly, not only GitHub's `closingIssuesReferences`: GitHub fills that field in a moment
// after a description is saved, and the check re-runs on `edited`, so it could read the old value and fail a
// description that was just fixed. A link made only in the sidebar fires no event; re-run the check for it.
// Prints `ok:` or `FAIL:` and exits 1 on a missing link, a bad argument or a `gh` error.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ISSUE = String.raw`(?:[\w.-]+\/[\w.-]+)?#\d+`;
// GitHub's closing keywords, each followed by an issue (`Closes #7`, `fixes: owner/repo#7`), or `Part of #N`
const LINK = new RegExp(String.raw`\b(?:(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?[ \t]+|part[ \t]+of[ \t]+)${ISSUE}`, 'i');

/** True when the PR is linked: GitHub reports a closing issue, or the description has a closing keyword or `Part of` and an issue. */
export function hasLinkedIssue({ body = '', closingIssuesReferences = [] }) {
  if (closingIssuesReferences.length) return true;
  // an HTML comment is template text the author never sees rendered, not a link
  return LINK.test(String(body ?? '').replace(/<!--[\s\S]*?-->/g, ''));
}

function main() {
  const fail = (msg) => {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  };
  let input = '';
  if (!process.stdin.isTTY) {
    try {
      input = readFileSync(0, 'utf8');
    } catch {
      // no stdin: no arguments
    }
  }
  const [number, ...extra] = input.trim().split(/\s+/).filter(Boolean);
  if (!/^\d+$/.test(number ?? '') || extra.length) fail('expected one pull request number on stdin');

  let pr;
  try {
    pr = JSON.parse(execFileSync('gh', ['pr', 'view', number, '--json', 'body,closingIssuesReferences'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (err) {
    fail(`could not read pull request #${number} with gh: ${String(err.stderr || err.message).trim().split('\n').pop()}`);
  }
  if (hasLinkedIssue(pr)) {
    const via = pr.closingIssuesReferences?.length ? `closes #${pr.closingIssuesReferences.map((i) => i.number).join(', #')}` : 'an issue named in the description';
    console.log(`ok: pull request #${number} is linked (${via})`);
    return;
  }
  fail(`pull request #${number} links no issue. Add \`Closes #N\` (the issue is done when this merges) or \`Part of #N\` (it is not) to the description; editing the description re-runs this check. A link made only in the sidebar fires no event, so re-run the check after it.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
