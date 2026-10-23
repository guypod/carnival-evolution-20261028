# Offline factory replay and preflight

A repeatable local workflow exercise derived from the original factory replay
adapter. Requires Python 3.10+, Git 2.28+, and a POSIX shell. Python code uses only
the standard library. No pip, npm, registry access, credentials, browser, model,
paid evaluation, or external service is needed or invoked by the supplied demo
and tests. Git is a required executable, not a bundled dependency.

## Try it

From the repository root:

```sh
python3 tools/offline-replay/self_test.py
python3 tools/offline-replay/demo.py
```

The first command prints test progress to stderr and one machine-readable JSON
summary to stdout. The second prints a compact JSON before/after demonstration.
Both use disposable local directories and clean them up. The demo takes several
seconds; the contract suite takes roughly half a minute on a typical development
machine. No historical fixture, result, or installed factory skill is modified.

For an inspectable run, create a fresh local project fixture:

```sh
WORK=$(mktemp -d)
python3 tools/offline-replay/prepare.py "$WORK/project"
SRC="$WORK/project/bundle/scenarios/offline-greeting"
python3 tools/offline-replay/preflight.py \
  --project-root "$WORK/project" \
  --source "$SRC" \
  --plugin "$WORK/project/bundle/plugin" \
  --manifest "$WORK/project/review-manifest.json"
python3 "$SRC/resources/replay/adapter.py" setup "$SRC"
python3 "$SRC/resources/replay/adapter.py" refs "$SRC"
sh "$SRC/resources/replay/enter.sh" 'git ls-remote --heads origin'
```

Setup refuses existing replay state or Git history and known ambient service
credential variables, reporting the variable name without its value. Do not
provide credentials or run this on an account-bearing or untrusted fixture.
The scripts do not request, configure, transmit, or save service credentials.

Preflight runs **before setup**. Setup adds runtime files and a fresh repository;
that mutated working directory is no longer an approved source package. Start
with a new staged directory to validate packaging again. The test project and
plugin are visibly synthetic and cannot establish real project linkage or skill
activation. No command in this guide submits an evaluation.

## What changed

- The exact read-only command `git ls-remote --heads origin` now lists branches
  of the fixed fixture-local bare repository. Existing exact-branch and symref
  probes remain supported. External targets, global Git flags, upload-pack
  injection, unexpected options, changed fetch/push URLs, and redirected local
  remote paths fail closed.
- `adapter.py refs` and `.cloud-launch/replay-refs.json` distinguish fresh
  operational Git refs from source provenance. Only the replay base SHA and
  local refs are offered for operations. A source SHA describes the exported
  source tree; original commits are not imported or represented as usable refs.
- A read-only preflight checks exact reviewed source/plugin paths, full file
  inventories and SHA-256 hashes, provenance consistency, and the nearest
  `tessl.json` ancestor against the expected local project and manifest hash.
  Repository roots, scenario collections, seed subdirectories, symlinks, extra
  files, and missing or shadowing project manifests are rejected.
- This portable edition supports only the tiny synthetic fixture. All npm
  commands fail closed instead of installing dependencies or attempting real
  Carnival acceptance. The historical npm-capable adapter remains untouched.

The original audit **already rejected unsupported-operation events**. This is
not a new feature. A regression test now explicitly continues a scripted valid
workflow after an unsupported operation and verifies that the audit still fails.
The process can continue; the audit must not call that continuation a pass.

## Short before/after demo

The `before` object in the demo is a description of the historical limitations,
not a rerun or reconstructed trace:

| Before                                             | After, checked by the current demo                               |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Broad heads probe was unsupported                  | Exact broad probe succeeds against the local bare remote         |
| Original source SHA was absent from replay history | Explicit operational replay base resolves successfully           |
| Local lint did not check source project discovery  | Exact local ancestor and packaging checks pass; broad root fails |

The script also performs real local commits, local bare-remote pushes, a base
merge, and post-merge Python checks/build. GitHub comments, PRs, and launch links
are **local simulations** using `.invalid` URLs. Its successful endpoint is
`LOCAL_REFERENCE_PASS`, not model performance or a real factory PR.

## Result semantics

See [result-semantics.json](result-semantics.json) for machine-readable meanings.

- `LOCAL_PREFLIGHT_PASS`: local reviewed boundaries, hashes, provenance, and
  project ancestor match. It does not verify server-side project state, price,
  permissions, runtime availability, skill loading, or submission eligibility.
- `LOCAL_REFERENCE_PASS`: scripted synthetic feature and workflow checks pass
  using mutable local replay state. This is not independent model evidence.
- `FAIL`: at least one applicable check failed. Preflight includes errors; audit
  includes checks and recorded unsupported/policy events. Missing check keys do
  not mean success.
- Command exit `97`: operation denied or unsupported by the local adapter.
  Other Git/check exit codes are preserved, including `2` for an absent exact
  branch with `ls-remote --exit-code`. Preflight/audit use `0` for their respective
  pass and `1` for failure. Setup/argument errors are nonzero.

The legacy `WORKFLOW_PASS_ACCEPTANCE_PENDING` audit label remains documented in
the schema, but is not reachable through this edition's supported miniature
setup. It must never substitute for independent feature acceptance.

## Provenance and coverage

[PROVENANCE.md](PROVENANCE.md) records the inspected original public factory
package, selected skill hash, and the distinction between loading and invocation.
[coverage.json](coverage.json) names all 18 preserved original contracts, the two
not ported, and all 26 historical source-specific oracle outcomes not ported.

There are currently 34 deterministic contract tests: 18 preserved plus 16 new
tests. Matrix rows are not counted as independent tests. None of the five real
Carnival feature oracles is bundled or rerun here. Those require their original
stacked source bases, references, evaluator tools, and runtime dependencies.

## Limits that remain unchanged

The historical task artifact was independently verified, but strict
skill/workflow calibration remained incomplete. This update does not rerun or
retroactively repair it, compare models, establish safety, or justify changing a
factory model.

The replay ledger and state are mutable. Checking their agreement does not make
them trusted evidence. Shell wrappers and disabled hooks are process conventions,
**not a security sandbox**. Absolute executables, direct writes, or networking
outside the wrapper can bypass it. A reviewed manifest detects accidental drift
only while its expected hashes remain independently trusted; changing both files
and their manifest defeats that comparison. Do not execute hostile code here.

The original public factory skill is not vendored, installed, edited, or invoked.
The staged plugin contains only a synthetic packaging README. Reading or loading
skill files would not by itself prove explicit invocation. Local project matching
does not call remote project validation or repair.

## Integration

The repository appends `replay:check` to its existing `npm run check`, so CI
runs this suite on a runner with Python, Git, and a POSIX shell. `replay:demo`
runs the local demonstration. The test/demo harness passes only a minimal
allowlisted child environment; it does not copy or log service credential values.
Direct adapter setup still refuses ambient credentials, and the explicit
synthetic-token refusal regression remains tested.
Keep `tools/offline-replay/resources/**` out of automatic formatters because the
reviewed fixture inventory hashes every byte. Review intentional fixture edits
and regenerate the manifest in the same reviewed change, not during test runs.
