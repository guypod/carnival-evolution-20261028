// An offline model of how the trigger `when` blocks in tessl.json match a
// GitHub webhook payload. It covers only the predicates this manifest uses, and
// anything else fails closed. It is not the production scheduler and not a
// security boundary: it lets tests show which synthetic events each route
// would accept under the current configuration.

/** Read a dotted path; `*` fans out over an array and returns every value. */
export function readPath(root, path) {
  let values = [root];
  for (const segment of path.split('.')) {
    const next = [];
    for (const value of values) {
      if (value === null || typeof value !== 'object') continue;
      if (segment === '*') {
        if (Array.isArray(value)) next.push(...value);
      } else if (Object.hasOwn(value, segment)) {
        next.push(value[segment]);
      }
    }
    values = next;
  }
  return values;
}

function isScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => Number.isSafeInteger(value) && value > 0;
const isSubject = (value) => isObject(value) && isNumber(value.number);

// Validate fixture subjects before evaluating predicates. This is local input
// validation, not a claim that Tessl's production scheduler uses this schema.
function validSubject(eventName, payload) {
  if (eventName.startsWith('github:issues.')) return isSubject(payload.issue);
  if (eventName === 'github:issue_comment.created') {
    return (
      isSubject(payload.issue) &&
      (!Object.hasOwn(payload.issue, 'pull_request') || isObject(payload.issue.pull_request))
    );
  }
  if (eventName.startsWith('github:pull_request')) return isSubject(payload.pull_request);
  if (eventName === 'github:check_run.completed' || eventName === 'github:check_suite.completed') {
    const check = payload[eventName === 'github:check_run.completed' ? 'check_run' : 'check_suite'];
    return (
      isObject(check) &&
      Array.isArray(check.pull_requests) &&
      check.pull_requests.length > 0 &&
      check.pull_requests.every(isSubject)
    );
  }
  return false;
}

/** Throw when a predicate is outside the supported subset. */
export function assertSupportedPredicate(key, predicate) {
  if (key === 'isPullRequest') {
    if (predicate !== 'true' && predicate !== 'false') {
      throw new Error(`isPullRequest must be "true" or "false"`);
    }
    return;
  }
  if (!key.startsWith('event.')) throw new Error(`unsupported condition key: ${key}`);
  if (isScalar(predicate)) return;
  if (predicate === null || typeof predicate !== 'object' || Array.isArray(predicate)) {
    throw new Error(`unsupported predicate for ${key}`);
  }
  const ops = Object.keys(predicate);
  if (ops.length !== 1) throw new Error(`predicate for ${key} must have one operator`);
  const [op] = ops;
  const arg = predicate[op];
  if (op === 'matches' && typeof arg === 'string') return;
  if (op === 'exists' && typeof arg === 'boolean') return;
  if (op === 'in' && Array.isArray(arg) && arg.every(isScalar)) return;
  if (op === 'any' && key.includes('*') && arg && isScalar(arg.equals)) {
    if (Object.keys(arg).length === 1) return;
  }
  throw new Error(`unsupported predicate ${op} for ${key}`);
}

function matchOne(key, predicate, payload) {
  if (key === 'isPullRequest') {
    const issue = payload.issue;
    if (issue === null || typeof issue !== 'object') return false;
    const isPr = issue.pull_request !== undefined && issue.pull_request !== null;
    return String(isPr) === predicate;
  }
  const values = readPath({ event: payload }, key);
  if (isScalar(predicate)) {
    // Strict equality: an id sent as a string never matches a numeric id.
    return values.length === 1 && values[0] === predicate;
  }
  const [op] = Object.keys(predicate);
  const arg = predicate[op];
  if (op === 'any') return values.some((value) => value === arg.equals);
  if (op === 'exists' && arg === false) return values.every((v) => v === undefined || v === null);
  if (values.length !== 1) return false;
  const [value] = values;
  if (op === 'exists') return value !== undefined && value !== null;
  if (op === 'in') return arg.includes(value);
  if (op === 'matches') return typeof value === 'string' && new RegExp(arg).test(value);
  return false;
}

/**
 * Whether a trigger accepts an event. Unsupported predicates throw; malformed
 * payloads and events of another type do not match.
 */
export function matchesTrigger(trigger, eventName, payload) {
  if (!isObject(trigger) || !isObject(trigger.when) || Object.keys(trigger.when).length === 0) {
    return false;
  }
  for (const [key, predicate] of Object.entries(trigger.when)) {
    assertSupportedPredicate(key, predicate);
  }
  if (!Array.isArray(trigger.on) || !trigger.on.includes(eventName)) return false;
  if (!isObject(payload) || !validSubject(eventName, payload)) return false;
  return Object.entries(trigger.when).every(([key, predicate]) =>
    matchOne(key, predicate, payload),
  );
}

/** Names of every trigger in the manifest that accepts the event. */
export function matchingTriggers(manifest, eventName, payload) {
  return Object.entries(manifest.triggers ?? {})
    .filter(([, trigger]) => matchesTrigger(trigger, eventName, payload))
    .map(([name]) => name);
}
