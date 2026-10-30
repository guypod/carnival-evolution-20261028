# Sample pull request descriptions

Synthetic descriptions written to `docs/pr-writing.md`, for people to read and
render. The issue numbers, commits and run IDs are made up. They are examples,
not proof that any test passed.

- `fresh.md`: a new pull request for an issue.
- `repaired-before.md`: the same pull request after its first round, with a
  line the owner added by hand.
- `repaired.md`: the description after a repair round, rewritten to describe
  the current change while keeping the owner's line, the markers, the visible
  limits and the older evidence labelled with its commit.

`scripts/factory/pr-writing.test.mjs` checks that what must survive does
survive. It does not grade the prose.
