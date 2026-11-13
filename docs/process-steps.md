# Process-step check

The `Stop` hook (`scripts/stop-check.mjs`, [#31](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/31)) looks at the turn that just ended. If it made a `git commit`, it checks the work since the previous commit in the session for the steps below, which [the decay baseline](decay-baseline.md) shows are skipped per batch. It records and shows what was skipped. It never blocks.

A commit that was refused (a failing hook, a guard's denial, nothing staged) is not a commit: it does not end a batch, and the retry is checked against everything since the last commit that went through ([#89](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/89)). The hook tells the two apart from the commit's output, because a pipe such as `| tail` hides the exit status: a commit that went through prints git's `[branch abc1234] subject` line, and one that did not says why (`script failed`, `Aborting commit`, `nothing to commit`, `error:`, a guard denial). Output that shows neither, such as an empty result from `git commit -q`, counts as a commit.

| Step | Counts as done when the batch has | Baseline step |
| --- | --- | --- |
| `tests` | a test run: `npm test`, `node --test`, `pytest`, `vitest`, `jest`, `go test`, `cargo test`, `scripts/test-*.sh`, `validate.mjs`. Not required for `docs` and `style` commits. | tests before commit |
| `work-log` | a write to `issue-{NNN}.md` or `issues/{NNN}/log.md` | CG9 |
| `checklist-sync` | `checklist-sync` or `gh issue edit` | CG10 |
| `commit-guide` | a `commit-guide` skill call | CG12 |
| `issue-link` | a branch named `type/NNN_slug`, which gives the issue number | PR12 |

Each commit that skipped a step is appended once to `~/.claude/bcp/skipped-steps.jsonl`:

```json
{"ts":"2026-11-09T14:02:11.000Z","session":"…","repo":"BANCS-Norway/bancs-claude-plugin","issue":31,"branch":"feat/31_x","commitId":"toolu_…","skipped":["tests","work-log"]}
```

`issue` is `null` when the branch carries no number. Counting a step over time gives the follow rate the baseline measured once by hand.

## Comment on the issue

Off by default. Set `BCP_COMMENT_SKIPPED=1` and the hook also posts each newly recorded commit as one comment on its issue, with `gh issue comment <issue> --repo <owner/name>`:

> bcp: a batch on `feat/32_x` was committed without tests, work-log.

A comment is visible to everyone who can read the repo, which is why it is opt-in. Rules:

- One comment per recorded commit. A commit already in the log is not posted again, even if the hook runs twice.
- An entry with no issue number is recorded but not posted. So is one whose `origin` remote is not on `github.com` (no remote at all, GitLab, self-hosted, GitHub Enterprise): `gh` would post to github.com, where `acme/app` may be an unrelated repo.
- The issue may be closed; the comment is still posted.
- If `gh` is missing, unauthenticated or offline, the commit is still recorded, the hook exits `0`, and the notice says `could not comment on #N`. The post is not retried, because the commit is already in the log and no longer counts as new.

## Manual nudges

`/bcp:nudge <step> [note]` records a correction you had to give by hand ("you skipped the tests"), and `/bcp:nudge` with no arguments reports them. The command passes its arguments to `scripts/nudge.mjs` untouched, so the step check is code, not something a model has to remember. It catches what the Stop hook cannot see, and the hook's findings and your nudges can be read side by side because they use the same step names and repo.

- **Steps:** the five above, plus `review` and `issues`, which [the decay baseline](decay-baseline.md) shows decaying but the hook cannot detect. Anything else is refused with the list, so a typo such as `test` cannot split the counts.
- **Repo:** the current directory's, `owner/name` from `origin`, else the folder name. Outside a git repository there is nothing to record against and the command refuses.
- **Log:** `~/.claude/bcp/nudges.jsonl`, one line per nudge, apart from `skipped-steps.jsonl` because one is a human report and the other a machine finding:

  ```json
  {"ts":"2026-11-10T14:02:11.000Z","repo":"BANCS-Norway/bancs-claude-plugin","step":"tests","note":"committed without running them"}
  ```

- **Withered:** three nudges on one step in one repo, counted over the whole log. The mark never clears by itself; there is no reset yet.

## Limits

- Detection reads tool calls in the transcript. A step done another way (a test run in a terminal outside the session) counts as skipped.
- The branch is read with `git` in the session's working directory, so a commit made after a `cd` or `git -C` into another checkout is attributed to the session's directory.
- A step is a check in `checkBatch` in `scripts/lib/process-steps.mjs`; add the check there and a row above.
- The transcript's own branch field is the branch the session started on. It is used only when git cannot be asked and the field names a feature branch; otherwise `branch` is `null` and `issue-link` is flagged.
