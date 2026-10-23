// Local decimal accounting only. No network, model, or billing integration.
export const REPOSITORY = 'guypod/carnival-factory-lab-20261022';
const SCALE = 10n ** 30n;
const FIELDS = ['total', 'platform', 'ai', 'usage'];
const CATEGORIES = ['implementation', 'shepherd', 'bookkeeping', 'review', 'other'];
const STATUSES = ['queued', 'pending', 'running', 'completed', 'failed', 'cancelled', 'unknown'];
const OUTCOMES = ['succeeded', 'failed', 'cancelled', 'no_action'];
const TERMINAL = ['completed', 'failed', 'cancelled'];
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const positive = (x) => Number.isSafeInteger(x) && x > 0;
const timestamp = (x) => {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x))
    return false;
  const t = Date.parse(x);
  return (
    Number.isFinite(t) &&
    new Date(t).toISOString() === (x.includes('.') ? x : x.replace('Z', '.000Z'))
  );
};
const fail = (message) => {
  throw new Error(message);
};
function keys(x, allowed, label) {
  if (!object(x)) fail(`${label} must be an object`);
  for (const k of Object.keys(x)) if (!allowed.includes(k)) fail(`${label}: unknown field ${k}`);
}

// Decimal strings preserve service-reported decimal values without binary floats.
export function decimal(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,59})(?:\.\d{1,30})?$/.test(value))
    fail('credits must be nonnegative decimal strings (60 integer/30 fractional digits max)');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(30, '0'));
}
export function decimalText(value) {
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(30, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
function validateBilling(billing, label) {
  if (billing === null) return;
  keys(billing, [...FIELDS, 'finality'], label);
  for (const field of FIELDS) {
    if (!(field in billing)) fail(`${label}.${field} must be explicitly null or a decimal string`);
    if (billing[field] !== null) decimal(billing[field]);
  }
  if (!['unknown', 'final'].includes(billing.finality))
    fail(`${label}.finality must be unknown or final`);
  const complete = FIELDS.every((field) => billing[field] !== null);
  if (
    billing.total !== null &&
    ['platform', 'ai', 'usage'].reduce(
      (sum, field) => sum + (billing[field] === null ? 0n : decimal(billing[field])),
      0n,
    ) > decimal(billing.total)
  )
    fail(`${label}: known category amounts exceed total`);
  if (
    complete &&
    decimal(billing.total) !==
      decimal(billing.platform) + decimal(billing.ai) + decimal(billing.usage)
  )
    fail(`${label}: complete category split does not equal total`);
  if (billing.finality === 'final' && !complete)
    fail(`${label}: a final bill must have a complete split`);
}
function validateObservation(o, index) {
  const label = `observations[${index}]`;
  keys(
    o,
    [
      'repository',
      'operationId',
      'category',
      'issueNumber',
      'prNumber',
      'status',
      'outcome',
      'observedAt',
      'billing',
      'effects',
    ],
    label,
  );
  if (o.repository !== REPOSITORY) fail(`${label}: unrelated repository`);
  if (
    typeof o.operationId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(o.operationId)
  )
    fail(`${label}: invalid operationId`);
  if (!CATEGORIES.includes(o.category)) fail(`${label}: invalid category`);
  for (const field of ['issueNumber', 'prNumber'])
    if (o[field] !== null && !positive(o[field])) fail(`${label}: invalid ${field}`);
  if (o.issueNumber === null && o.prNumber === null)
    fail(`${label}: explicit issue or PR attribution is required`);
  if (!STATUSES.includes(o.status)) fail(`${label}: invalid status`);
  if (o.outcome !== null && !OUTCOMES.includes(o.outcome)) fail(`${label}: invalid outcome`);
  if (!TERMINAL.includes(o.status) && o.outcome !== null)
    fail(`${label}: active operation cannot have a terminal outcome`);
  if (o.status === 'failed' && o.outcome !== null && o.outcome !== 'failed')
    fail(`${label}: failed status needs failed outcome`);
  if (o.status === 'cancelled' && o.outcome !== null && o.outcome !== 'cancelled')
    fail(`${label}: cancelled status needs cancelled outcome`);
  if (!timestamp(o.observedAt)) fail(`${label}: observedAt must be a valid UTC ISO timestamp`);
  if (!Object.hasOwn(o, 'billing')) fail(`${label}: billing must be explicit, null when missing`);
  validateBilling(o.billing, `${label}.billing`);
  if (o.billing?.finality === 'final' && !TERMINAL.includes(o.status))
    fail(`${label}: active operation cannot have a final bill`);
  if (o.effects !== undefined && !['none', 'observed', 'unknown'].includes(o.effects))
    fail(`${label}: effects must be none, observed or unknown`);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function stats(operations) {
  const credits = {};
  for (const field of FIELDS) {
    let known = 0n,
      missing = 0;
    for (const op of operations) {
      const amount = op.billing?.[field] ?? null;
      if (amount === null) missing += 1;
      else known += decimal(amount);
    }
    credits[field] = { known: decimalText(known), missingOperations: missing };
  }
  return {
    operationCount: operations.length,
    pendingBillingCount: operations.filter((op) => op.pendingBilling).length,
    unsettledCount: operations.filter((op) => !op.finalBillObserved).length,
    nonterminalCount: operations.filter((op) => !TERMINAL.includes(op.status)).length,
    unknownStatusCount: operations.filter((op) => op.status === 'unknown').length,
    credits,
  };
}
function groups(operations, field) {
  const keys = [...new Set(operations.map((op) => op[field]))].sort();
  return Object.fromEntries(
    keys.map((key) => [key, stats(operations.filter((op) => op[field] === key))]),
  );
}

export function reportCosts(input) {
  keys(input, ['schemaVersion', 'repository', 'relationships', 'observations'], 'input');
  if (input.schemaVersion !== 1 || input.repository !== REPOSITORY)
    fail('expected schemaVersion 1 and the approved repository');
  if (!Array.isArray(input.relationships) || !Array.isArray(input.observations))
    fail('relationships and observations must be arrays');
  const prToIssue = new Map();
  for (const [index, relation] of input.relationships.entries()) {
    keys(relation, ['issueNumber', 'prNumber'], `relationships[${index}]`);
    if (!positive(relation.issueNumber) || !positive(relation.prNumber))
      fail('relationship numbers must be positive safe integers');
    if (
      prToIssue.has(relation.prNumber) &&
      prToIssue.get(relation.prNumber) !== relation.issueNumber
    )
      fail(`conflicting issue mapping for PR ${relation.prNumber}`);
    prToIssue.set(relation.prNumber, relation.issueNumber);
  }
  const histories = new Map();
  input.observations.forEach((o, index) => {
    validateObservation(o, index);
    if (o.issueNumber !== null && o.prNumber !== null) {
      if (prToIssue.has(o.prNumber) && prToIssue.get(o.prNumber) !== o.issueNumber)
        fail(`conflicting explicit issue/PR attribution for ${o.operationId}`);
      prToIssue.set(o.prNumber, o.issueNumber);
    }
    if (!histories.has(o.operationId)) histories.set(o.operationId, []);
    histories.get(o.operationId).push(o);
  });
  let duplicateObservations = 0;
  const operations = [];
  for (const [id, history] of [...histories].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    history.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    const unique = [];
    for (const observation of history) {
      const previous = unique.at(-1);
      if (previous && Date.parse(previous.observedAt) === Date.parse(observation.observedAt)) {
        if (canonical(previous) !== canonical(observation))
          fail(`conflicting simultaneous observations for ${id}`);
        duplicateObservations += 1;
      } else unique.push(observation);
    }
    const categories = new Set(unique.map((o) => o.category));
    const issues = new Set(unique.flatMap((o) => (o.issueNumber === null ? [] : [o.issueNumber])));
    const prs = new Set(unique.flatMap((o) => (o.prNumber === null ? [] : [o.prNumber])));
    if (categories.size !== 1 || issues.size > 1 || prs.size > 1)
      fail(`conflicting identity/attribution for ${id}`);
    let issueNumber = [...issues][0] ?? null;
    const prNumber = [...prs][0] ?? null;
    if (prNumber !== null && prToIssue.has(prNumber)) {
      if (issueNumber !== null && issueNumber !== prToIssue.get(prNumber))
        fail(`conflicting resolved attribution for ${id}`);
      issueNumber = prToIssue.get(prNumber);
    }
    const latest = unique.at(-1);
    // A failed/missing latest read does not erase an earlier known bill. Mark it stale/pending.
    const known = [...unique]
      .reverse()
      .find((o) => o.billing !== null && FIELDS.some((field) => o.billing[field] !== null));
    const billing = known?.billing ?? null;
    const complete = billing !== null && FIELDS.every((field) => billing[field] !== null);
    const latestComplete =
      latest.billing !== null && FIELDS.every((field) => latest.billing[field] !== null);
    operations.push({
      operationId: id,
      category: latest.category,
      issueNumber,
      prNumber,
      lifecycle: issueNumber === null ? `unmapped-pr:${prNumber}` : `issue:${issueNumber}`,
      status: latest.status,
      outcome: latest.outcome,
      effects: latest.effects ?? 'unknown',
      firstObservedAt: unique[0].observedAt,
      lastObservedAt: latest.observedAt,
      billingObservedAt: known?.observedAt ?? null,
      billingStale: known !== undefined && known !== latest,
      billing:
        billing === null
          ? null
          : Object.fromEntries([
              ...FIELDS.map((field) => [
                field,
                billing[field] === null ? null : decimalText(decimal(billing[field])),
              ]),
              ['finality', billing.finality],
            ]),
      pendingBilling: !latestComplete,
      finalBillObserved:
        complete &&
        latestComplete &&
        billing.finality === 'final' &&
        TERMINAL.includes(latest.status),
    });
  }
  return {
    schemaVersion: 1,
    repository: REPOSITORY,
    unit: 'credits',
    observationCount: input.observations.length,
    duplicateObservations,
    totals: stats(operations),
    byLifecycle: groups(operations, 'lifecycle'),
    byCategory: groups(operations, 'category'),
    explicitNoAction: stats(operations.filter((op) => op.outcome === 'no_action')),
    cancelled: stats(
      operations.filter((op) => op.status === 'cancelled' || op.outcome === 'cancelled'),
    ),
    failed: stats(operations.filter((op) => op.status === 'failed' || op.outcome === 'failed')),
    semanticEffects: {
      none: stats(operations.filter((op) => op.effects === 'none')),
      observedCount: operations.filter((op) => op.effects === 'observed').length,
      unknownCount: operations.filter((op) => op.effects === 'unknown').length,
    },
    operations,
    limits: [
      'Observed credits only; no USD/token conversion or achieved/counterfactual savings claim.',
      'Known totals exclude missing amounts; missing is not zero. Partial split columns need not sum to the known total.',
      'A populated bill is not proof of final settlement. Finality requires an explicit final observation.',
      'No action, cancelled, failed and semantic-effects subsets can overlap; do not add them to lifecycle totals.',
      'Input completeness and explicit relationship evidence are the supplying operator responsibility. No service collection occurs.',
    ],
  };
}
