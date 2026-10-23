# Local factory lifecycle cost accounting

`npm run factory:costs -- --input <local-observations.json>` reads one local JSON
file and prints a deterministic JSON report. It does not call a service, launch
work, cancel a run, change a label, use credentials or predict savings. The
report is in **credits**, not USD or tokens. It rejects unrecognized fields rather
than silently mixing units.

## Reproducible synthetic demonstration

```sh
npm run factory:costs -- --input scripts/factory/cost-fixtures/before-late-billing.json
npm run factory:costs -- --input scripts/factory/cost-fixtures/after-late-billing.json
node scripts/factory/cost-demo.mjs
```

Both snapshots contain five unique synthetic operations. The first has 37 known
credits and one missing bill. The second adds the later 50-credit review bill and
a duplicate implementation observation: the result is **87 credits, still five
operations**, with no missing bill. This is newly computed synthetic accounting,
not a historical factory cost or an achieved reduction. Neither fixture claims
final settlement, so all five operations remain unsettled under this schema.

The full `npm run check` includes the decimal, duplicate, missing/partial bill,
status, effects, relationship and invalid-input regressions.

## Input and scope

See the two committed fixtures for the complete schema. All fixture operation
IDs, issue/PR relationships, times, amounts and effects are invented. The one real
public identity is the fixed repository:
`guypod/carnival-factory-lab-20261022`. Other repositories are rejected.

- `schemaVersion: 1`, `repository`, `relationships` and `observations` are required.
- Unknown operation status is explicitly `unknown`, not invented from billing.
  A cancelled status still counts when the separate outcome field is null.
- Every observation has an explicit `operationId`, category, issue and/or PR
  number, status, outcome, observation time and billing (explicitly `null` when
  unavailable). Positive identifiers must be safe integers.
- Categories are implementation, shepherd, bookkeeping, review or other. These
  are supplied facts, never guessed from titles or number offsets.
- PR-to-issue grouping uses only explicit relationships or an observation that
  names both. A PR with no mapping stays in an `unmapped-pr:<n>` bucket. Multiple
  PRs may explicitly map to the same issue; conflicting mappings reject.
- Repeated operation IDs count once. A later observation can enrich missing
  issue/PR attribution but cannot replace a different non-null identity/category.
  Conflicting observations at the same instant reject rather than trusting array
  order. Input ordering does not alter results.
- Times must be valid UTC ISO timestamps ending in `Z`, with optional three-digit
  milliseconds. No timezone-free or impossible dates.
- `billing` is null or has `total`, `platform`, `ai`, `usage` and `finality`.
  Each credit field is explicitly null or a **decimal string**, not a JSON number.
  Keep the original decimal spelling when preparing input. Up to 60 integer and
  30 fractional digits are supported. BigInt arithmetic does not round totals.
- A complete category split must equal the reported total. A partial known split
  cannot exceed it. A missing reported total is not fabricated by adding columns.
- `finality` is `unknown` unless an authoritative observation explicitly reports
  `final`. A terminal run or a populated bill is not proof of settlement. The
  currently inspected service responses did not include a finality flag; do not
  infer one. A final bill requires all amounts and terminal operation status.
- Optional `effects` is `none`, `observed` or `unknown`. Missing effects stay
  unknown. Only explicit `none` is counted as semantically idle; a succeeded
  outcome alone does not establish an effect or the absence of one.

## Interpretation and limitations

Each total/split contains `known` and `missingOperations`. A zero known subtotal
with missing operations is **not** zero spend. Missing or partially populated
latest bills count as pending even for a completed run. Unsettled includes any
operation without explicit final billing, including active work with accrued cost.

The latest nonempty bill is used as a unit. Its fields are never filled in from
an older bill. If the latest read is missing altogether, the prior known bill is
retained but marked `billingStale` and pending. Amounts can rise or be corrected
in later observations; the report is a snapshot, not an immutable invoice.

Failed, cancelled and no_action operations remain in lifecycle totals. The
no_action, cancelled, failed and semantic-effects views are overlapping subsets,
not extra spend to add to totals. Missing effects and absent review-operation
coverage must not be treated as zero or silently guessed. There is no service
collector here: coverage and source evidence remain the operator's responsibility.

## Supplying real observations

An authorized operator can separately read the existing scoped schedule/run and
operation-billing tools, retain operation IDs and explicit issue/PR links, and
normalize only those observations into this schema. Keep private input and output
under the ignored `.factory-local/` directory, not committed fixtures. Never paste
credentials, environment dumps, customer logs or unrelated account records.
Preserve missing bills as null, observation times, failed/cancelled outcomes and
unknown finality. Re-run the same local report when later billing arrives.

Token/cache telemetry and model USD estimates belong in separate datasets with
separate units. Do not convert them into this credit ledger or claim that an
observed idle/cancelled subtotal is an achieved saving.
