# Factory contract check

`tessl.json` decides which GitHub events start Tessl's factory. This folder
pins that file to an approved contract and tests the routes offline.

- `contract.mjs`: the exact actions (skill `tessl-labs/factory@0.6.0`, agent
  `claude-code`, model `claude-opus-5-5`, environment, timeouts) and the eleven
  triggers, with their guards, concurrency keys (the existing 90s shepherd
  debounce, and replies sharing the implement lock) and actions.
- `check-contract.mjs`: fails when `tessl.json` differs from the contract.
- `matcher.mjs`: an offline model of how a trigger's `when` block matches a
  payload. It supports only the predicates this manifest uses (equality,
  `matches`, `exists`, `in`, `any.equals` over `*`, `isPullRequest`) and throws
  on anything else. Local fixture validation also rejects missing or malformed
  ticket numbers, subject objects, PR markers, and trigger shapes. This extra
  input validation is not a claim about the platform's payload validation.
  It is not the production scheduler and not a security
  boundary; online validation is still required.
- `factory.test.mjs`: positive fixtures for all eleven routes, negative
  fixtures, and unsafe mutants.

`npm run check` runs `npm run factory:check` after its other steps.

## Demo

```sh
git show 56c1e19:tessl.json > /tmp/original-tessl.json
node scripts/factory/check-contract.mjs /tmp/original-tessl.json  # fails 13 checks: guards/states and two action instructions differ
node scripts/factory/check-contract.mjs                           # factory contract: tessl.json holds
node --test scripts/factory/factory.test.mjs                      # mutants fail; cancellation and dependency routes still match
```

Changing the factory on purpose means changing `contract.mjs` in the same pull
request.

## Current-source verification receipts

Run `npm run factory:verify` from the repository root after the final source
change, base merge **and commit**. It runs the full `npm run check`, then
`npm run build`, sequentially, even if the first command fails. Each command
has a 180-second timeout; a timeout terminates its process group on POSIX
systems. Neither command is replaced by a narrower check. A failed command,
timeout or source change produces an unsuccessful receipt and exit status.
The suite uses fake npm scripts in disposable repositories, never this real
verifier or this repository's check/build recursively.

The ignored `.factory-artifacts/verification.json` records the exact commands,
exit codes, signals, timeout results, timestamps, measured durations, Git HEAD,
source fingerprint before/after, runner-code digest and basic local runtime
provenance. It contains no captured command output, credentials or environment
dump. Only this local artifact is written; the verifier does not call an API,
launch Tessl work, push a branch or alter runtime configuration. The repository's
check/build scripts are still ordinary local programs, not a sandbox.

Run `npm run factory:verify -- --validate` to validate without executing checks.
Validation rejects missing/malformed receipts, changed HEAD or source, changed
runner/runtime provenance, altered integrity digests, missing/reordered commands,
invalid timestamps and unsuccessful outcomes. Any new commit, including one
with an identical source tree, requires a fresh run. The two factory action
instructions require exact current-head check/build outcomes in the completion
report while retaining every published-skill invariant and fresh-read rule.
The optional nonempty `instructions` string is supported by the installed
Tessl CLI 0.117.0 action schema and its factory-customization guidance.

### Disposable before/after demonstration

This demonstration clones only local Git objects and copies already installed
`node_modules`; it performs no install, fetch, push or Tessl launch. Run it from
a clean repository root after committing the desired source. The commands run
the real checks in the temporary copy, not a simulated success. The original
checkout and its receipt stay untouched. Output is local evidence only: action
instructions are not activated, and no hosted CI or merge authority is implied.

```sh
(
  set -eu
  source_repo="$PWD"
  verified_head="$(git rev-parse HEAD)"
  demo="$(mktemp -d)"
  trap 'rm -rf "$demo"' EXIT
  git clone --quiet --no-hardlinks --no-checkout "$source_repo" "$demo/repo"
  git -C "$demo/repo" checkout --quiet --detach "$verified_head"
  cp -a "$source_repo/node_modules" "$demo/repo/node_modules"
  cd "$demo/repo"
  npm run factory:verify                         # expected exit 0
  npm run factory:verify -- --validate            # expected exit 0
  printf 'local source change\n' > receipt-demo-source.txt
  if npm run factory:verify -- --validate; then
    echo 'ERROR: the stale receipt was accepted'
    exit 1
  else
    echo 'Expected rejection: the source tree changed'
  fi
  rm receipt-demo-source.txt
  npm run factory:verify -- --validate            # expected exit 0 again
)
```

For a screen recording, run under an allowlisted environment with an empty
home/config/cache rather than exposing ambient account settings or credentials.
The demonstration is disposable, but the npm scripts are ordinary local
programs and not a sandbox.

### Fingerprint boundaries

The deterministic SHA-256 tree measures root-relative paths, regular-file
contents, executable bits and missing tracked files. It includes untracked
source and ignored files outside this explicit generated-directory allowlist:

- `.git`, `node_modules`, `dist`, `coverage`, `.factory-artifacts`
- `.tessl/plugins`, `.agents/skills`, `.claude/skills`, `.codex/skills`
- `.cursor/skills`, `.github/skills`

All paths are rooted at the repository, not patterns matched at any depth.
Tracked files under these directories are still measured. Git ignore rules do
not otherwise exempt a file. New exclusions need a reviewed code change; keep
source out of generated directories. Symlinks, special files and submodules
fail closed instead of silently measuring something outside this tree. The
receipt directory and receipt itself cannot be symlinks. Dependency contents,
Git metadata and generated build outputs are not covered by the fingerprint.

### Limits and interpretation

This is **mutable local evidence, not a signed attestation or a security
boundary**. Its SHA-256 checksum catches accidental edits, not a deliberate
forger who rewrites all claims and recomputes the checksum. Strict validation
rejects malformed or internally inconsistent forged claims, but cannot prove
that a coherent forged receipt's commands actually ran. Do not treat local
receipts as CI, code review, authorization to push/mark ready/merge, or proof of
a trusted environment. The measurement checks the tree before and after the
commands; it cannot detect a change reverted between those snapshots. Changes
to Node/platform invalidate a receipt; dependency reinstallations and other
unmeasured environment changes should also be followed by a fresh run.
