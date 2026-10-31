# Experiment pull requests: write for the reviewer

Read this before you create a pull request, change its scope, or update its
description after a repair. It is about how a description reads. It never
removes a required check, a piece of evidence, a marker or a scope rule: what a
skill, `AGENTS.md` or a review asks the description to contain still has to be
there.

## The visible description

- **Title.** Say what behaviour changes, specifically. Keep every identifier or
  prefix the loop requires, such as `#<n>:` or `Visual repair: <route>`.
- **Opening.** Start with a few sentences on what changes for the player or the
  maintainer, and why.
- **Words.** Use familiar words and concrete verbs. When an internal term is
  needed, say what it means the first time.
- **Design choices.** Explain only the choices the diff does not make obvious.
  No account of how the work session went, and no list of files touched.
- **Checks.** Say briefly what you actually ran and what it showed.
- **Keep visible:** material failures, behaviour you did not test, anything
  simulated rather than real, security implications, recovery still pending,
  and limits on what is deployed. A build is not visual verification. Queued is
  not passed. Merged is not verified as deployed.
- **Trying it.** Where it helps, give a short way to try the change.
- No word limit, and no repeating the same point in different sections.

## Evidence

Put detailed commands, hashes, exhaustive case lists, run IDs, repeated
screenshots and investigation history in a collapsed block, or in a linked
artifact you have checked:

```md
<details><summary>Evidence</summary>

...

</details>
```

A compact before and after may stay visible.

Always keep: findings, before and after evidence, results for the exact head,
source links, machine markers (`<!-- tessl-... -->` lines), the `Closes #<n>`
line and attribution, intentional human edits, and review history that still
helps. Never delete evidence to make a description shorter, and never publish
private source examples or data.

## Refreshing after a repair

1. Read the current pull request and its diff first.
2. Rewrite the explanation so it describes the change as it is now. Do not
   append a diary of each round.
3. Keep intentional human edits.
4. Make every claim match the commit it covers. Label older evidence with the
   commit it covered, and flag any material gap.
5. If an earlier write may or may not have landed, read the pull request back
   and reconcile before you retry.

## Cold-reader pass

Before you post, read the description as someone who was not involved:

- Do they know what changed and why, without the run history?
- Does every sentence earn its place?
- Are the risks, the missing checks and the remaining actions obvious?
- Is the evidence reachable, and is it accurate?

Rewrite until every answer is yes. Prefer plain language to terms like
"hardening", "robustness", "coverage receipts" or "visual rubric", unless the
term is needed and explained. This is a test of the reader's understanding,
not a list of banned words.

## Examples

These are sanitized illustrations of tone. They are not proof that any test
passes.

- **Visual repair:** The wind-up toy felt lost in a mostly empty screen. This
  puts the duck and its controls together in a wood-framed stall, with clearer
  buttons and a sharper drawing. On phones, the controls sit below the toy.
  Gameplay, scores and copy are unchanged.
- **Factory change:** Stop incomplete reviews from being recorded as complete.
  A review must now list what it read before it can move the checkpoint
  forward. Earlier mistakes can be corrected without deleting the original
  record. Any correction, replay, migration or verification still pending
  stays visible in the description.

## Where this applies

- `AGENTS.md` asks every agent to read this file before it creates or edits a
  pull request description.
- `tessl.json` gives the `implement-github-issue`, `shepherd` and
  `visual-repair` actions an `instructions` line pointing here, and
  `tessl-factory/skills/visual-repair/SKILL.md` names it directly. The published
  factory skills are used as they are, not forked.
- Action instructions take effect from the default branch, so they apply only
  after the change that adds them is merged and synced.
- `tessl action trigger --instructions <text>` replaces the action's declared
  instructions rather than adding to them. A manual run must repeat the
  requirement in its own `--instructions` text, for example: "Before creating
  or editing a pull request description, read docs/pr-writing.md and apply its
  cold-reader pass."
- `docs/pr-writing-fixtures/` holds a fresh and a repaired sample description
  that follow this file, and `scripts/factory/pr-writing.test.mjs` checks that
  they keep what must survive.
