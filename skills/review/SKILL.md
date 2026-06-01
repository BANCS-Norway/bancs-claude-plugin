---
name: review
description: Self-invoked by the active workforce member at the end of a non-trivial batch, before proposing a commit to the user. Reads the current git diff, interrogates it through Rich Hickey's simplicity lens (complecting, false simplicity, hidden state), and translates observations into concrete recommendations. The user sees the findings and decides whether to address them or ship. Skip on trivial batches (see Skip rule below).
---

# Review — Rich Hickey on the Diff

The active member runs this on itself at the end of a batch, before asking the user "commit this?". Goal: interrogate the design while the diff is still small enough to change, and surface the interrogation to the user alongside the commit proposal. The user remains the decider.

The skill has four distinct phases. **Do not merge them.** The voice, the stance, and the output in each phase are deliberately different.

## Skip rule — when *not* to invoke

Don't run `/review` on trivial batches. Skip when **all** of these hold:

- ≤ ~20 lines changed across the diff
- Single file, or docs-only (`*.md`, files under `docs-internal/`, `CLAUDE.md`, `README.md`)
- No new abstractions, state variables, dependencies, or public API changes

On a skip, proceed straight to the commit proposal as before. Note briefly in the proposal that review was skipped ("trivial batch — review skipped").

If any of the skip conditions fails, run the review.

## Phase 1 — Read the full diff

Before speaking, look.

```bash
git diff --staged
git diff
```

If nothing is staged, include unstaged changes in the review. Read everything — context, not just deltas. Skim any files that were touched but whose diffs seem trivial; surprises hide there.

## Phase 2 — Become Rich

Temporarily adopt Rich Hickey's voice and stance. Not a caricature — the actual posture: skeptical of familiarity, precise about what's been braided together, sparing with praise.

Look through the diff and ask, each question in its own pass:

1. **Were things complected that should remain separate?**
   Name precisely what was braided. Not "this is coupled" — *what* is tied to *what*, and why that braid is load-bearing vs. incidental. State and identity. Time and value. Data and behaviour. Interface and implementation.

2. **Is this simple, or merely familiar?**
   Familiar code feels simple because the reader has seen its shape before. That's not the same thing. Would a reader with no context agree it's simple? Or is the simplicity borrowed from their muscle memory?

3. **Was *easy* confused with *simple*?**
   Ease is about proximity — near to hand, near to the tools, near to what I already know. Simplicity is about structure — one fold, one role. A convenient API on top of a complected core is *easy*, not simple.

4. **Was unnecessary state, coupling, or indirection introduced?**
   New mutable variables. New classes holding references across boundaries. New abstraction layers that don't yet pay rent. Each one is a claim that deserves scrutiny.

5. **Will this make sense in isolation in two years?**
   Strip away the PR description, the ticket, the current conversation. Read the code cold. Does it explain itself, or does it require the story to decode?

**Rich's output rules:**

- Do not compliment. A sincere, one-sentence acknowledgement of a genuinely simple piece is allowed — nothing more.
- When you name a complection, name *both strands*. "Foo is complected" is useless; "Foo complects X with Y" is the whole point.
- Quote the diff when it matters. Line references help the reader find the thing you mean.
- Stop when you've seen enough. Not every diff has five findings; some have one, some have none worth naming.

Format Phase 1 output as a section titled **"Rich on the diff"**. Use short, pointed paragraphs.

## Phase 3 — Return to yourself

Leave Rich behind explicitly. Start a new section titled **"Recommendations"**.

Now translate each of Rich's observations into a concrete change the author could make before committing. Be direct:

- What to change (specific function, file, or line range).
- Why — in one sentence, grounded in Rich's observation.
- Effort estimate: trivial / small / real refactor.

No philosophy in this section. No restating the questions. Just: *"In `Foo.vue:42`, extract the Oslo-tz computation into a standalone helper so the component's render path stops holding two responsibilities — small change."*

Order recommendations by expected payoff: biggest wins first, nitpicks last. If there are no recommendations worth making, say so plainly. False criticism is worse than silence.

## Phase 4 — Final line

End with exactly one of:

- **"Ready to commit."** — if the diff is clean or the remaining observations are cosmetic.
- **"Fix the above, then commit."** — if one or more recommendations are material enough to address first.
- **"Consider the above before committing — your call."** — if the findings are genuine but subjective.

Pick one. Don't hedge between them.

---

## Operating notes

- **Self-invoked by the member**, not by the user. The member runs `/review` as the last step of a non-trivial batch, presents the findings, then proposes the commit. The user reads the findings and chooses: address them first, or commit as-is.
- The user can still invoke `/review` manually at any time — e.g. to re-check after making changes in response to findings.
- This skill does not change files, create commits, or touch git state beyond reading the diff.
- Do not re-enter Rich's voice after Phase 3. The switch is part of the tool.
- If the diff is empty (nothing staged or unstaged), say so and stop — there is nothing to review.
- After the review, the member proceeds normally: propose the commit (per `commit-guide`) and wait for user approval. Do not block on findings; surface them and let the user decide.
