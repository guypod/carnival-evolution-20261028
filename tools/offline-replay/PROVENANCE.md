# Provenance and historical limits

This directory is a portable derivative of the original local workflow replay
adapter, contract suite, and snapshot-assembly design. It is not a replacement
factory skill. No historical frozen bundles, result files, or evaluation
artifacts were modified to produce it.

The original inspected public package was `tessl-labs/factory` version `0.6.0`.
The selected skill was `implement-github-issue`.

- Selected `SKILL.md` SHA-256:
  `c6173ce2374b31d134a66ffd354299306e4f07f921576bbd1005dceb5bf2682d`
- Inspected plugin-tree SHA-256:
  `70fbbfb30c802b5f7ae2a12b134d94cf1e55fbfeb1eac65bc90076161035d026`
- Provenance scope: inspected public package, not verified live-factory
  resolution or verified hosted-runtime installed bytes.

These identifiers are retained for provenance only. No download, install, model
execution, or claim of explicit skill invocation is made here. The plugin used by
the local packaging fixture is synthetic and is not those factory bytes.

The source Git SHA in the supplied miniature fixture consists of forty `1`
characters and is explicitly synthetic. It is deliberately absent from the
fresh replay history. Real snapshot designs should retain their source SHA as
provenance while using the replay's separately reported local base for Git
operations. Reinitializing an exported tree does not preserve original history,
ownership, branch state, or concurrency.

Historical calibration found a correct independently checked artifact, but did
not establish a strict skill/workflow pass: the available mutable ledger recorded
an unsupported broad heads probe followed by continuation, and an absent original
SHA lookup followed by a local-base lookup. Available loading metadata did not
prove explicit skill invocation; an independent complete transcript and runtime
skill hash were not available. That historical result remains incomplete.

The original adapter already made unsupported events fail its audit. The present
change supports one precise read-only command, clarifies operational refs, and
adds packaging/project preflight and regressions. It does not turn mutable state
into trusted evidence, claim hooks enforce isolation, reinterpret loading as
invocation, or treat scripted contracts as model performance.
