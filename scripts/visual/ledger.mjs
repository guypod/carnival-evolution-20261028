// The visual repair loop's durable record: which routes still need a review,
// which findings are still open, and what happened to the loop's own pull
// requests. It lives as ledger.json on the branch LEDGER_BRANCH on origin,
// written with an ordinary fast-forward push, so it survives between runs and
// a run that stops halfway leaves it exactly as it was.
//
// The decisions are plain functions, tested in ledger.test.mjs. The command
// line at the bottom wires them to git and gh for the skill:
//
//   node scripts/visual/ledger.mjs plan            what this run should do
//   node scripts/visual/ledger.mjs record <file>   save a finished review
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LEDGER_BRANCH = 'factory-state/visual-repair';
export const LEDGER_FILE = 'ledger.json';
export const OWN_BRANCH = /^tessl\/visual-repair-/;
export const BATCH_SIZE = 4;
export const LIST_LIMIT = 1000;
export const DECLINE_DAYS = 30;
const STATE = /^(desktop|narrow)(-quiet)?-(clean|focus|interaction)$/;
const MARKER = /<!-- tessl-visual-finding: (\S+) -->/g;

// Files that every screen draws with: a change to one affects every route.
const SHARED = [/^index\.html$/, /^src\/main\.ts$/, /^src\/style\.css$/, /^src\/carnival\//];
// Files no screen draws with.
const IGNORED = [/\.test\.ts$/, /\.md$/];

/** Every route the router serves: the midway, each standalone screen and each game. */
export function allRoutes(mainSource, gameIds) {
  const screens = [...mainSource.matchAll(/location\.hash === '(#\/[\w-]+)'/g)].map((m) => m[1]);
  return ['#/', ...new Set(screens), ...gameIds.map((id) => `#/play/${id}`)];
}

/** Which module each standalone route draws with, read from main.ts. */
export function routeModules(mainSource) {
  const renderers = new Map(
    [...mainSource.matchAll(/location\.hash === '(#\/[\w-]+)'\) (render\w+)\(\)/g)].map((m) => [
      m[2],
      m[1],
    ]),
  );
  // A renderer's body ends at the next top-level statement, so helpers that
  // follow it count as drawn elsewhere and a cut too short only errs wide.
  const starts = [...mainSource.matchAll(/^function (render\w+)\(/gm)];
  const tops = [...mainSource.matchAll(/^\w/gm)].map((m) => m.index);
  const bodies = new Map(
    starts.map((m) => [
      m[1],
      mainSource.slice(
        m.index,
        tops.find((i) => i > m.index),
      ),
    ]),
  );
  // Whatever main.ts draws outside the standalone routes' renderers: the
  // midway, its overlay and any helper. A module used there is not one route's.
  const routed = new Set([...renderers.keys()].map((fn) => bodies.get(fn) ?? ''));
  const elsewhere = [...routed]
    .reduce((rest, body) => rest.replace(body, ''), mainSource)
    .replace(/^import [^;]+;/gm, '');
  const modules = new Map();
  for (const m of mainSource.matchAll(/^import \{([^}]+)\} from '\.\/([\w-]+)';/gm)) {
    const names = m[1].split(',').map((n) =>
      n
        .replace(/^\s*type\s+/, '')
        .trim()
        .split(' as ')
        .pop(),
    );
    const routes = [...renderers]
      .filter(([fn]) => names.some((n) => n && new RegExp(`\\b${n}\\b`).test(bodies.get(fn) ?? '')))
      .map(([, route]) => route);
    // Type imports draw nothing, and a type name can match page text.
    const values = m[1].split(',').filter((n) => !/^\s*type\s/.test(n));
    const usedElsewhere = values
      .map((n) => n.trim().split(' as ').pop())
      .some((n) => n && new RegExp(`\\b${n}\\b`).test(elsewhere));
    modules.set(`src/${m[2]}.ts`, usedElsewhere ? [] : routes);
  }
  return modules;
}

/**
 * The routes a set of changed files can look different on. Shared files and
 * files the map cannot place affect every route, so coverage errs wide.
 */
export function affectedRoutes(files, mainSource, routes, importers = () => []) {
  const modules = routeModules(mainSource);
  const importedElsewhere = (file) =>
    importers(file).some((f) => f !== 'src/main.ts' && !f.endsWith('.test.ts'));
  const hit = new Set();
  for (const file of files) {
    if (IGNORED.some((p) => p.test(file))) continue;
    if (!file.startsWith('src/') && !SHARED.some((p) => p.test(file))) continue;
    const game = file.match(/^src\/games\/([\w-]+)\//);
    if (SHARED.some((p) => p.test(file))) routes.forEach((r) => hit.add(r));
    // A game's own module holds its name and description, which the midway,
    // booth cards and other screens show, so it owes every route. Its other
    // files draw only its play screen.
    else if (game && !file.endsWith('/game.ts')) hit.add(`#/play/${game[1]}`);
    else if (game) routes.forEach((r) => hit.add(r));
    // A module counts as one route's only when nothing else in src imports
    // it; anything shared, such as src/midway/palette.ts or a module another
    // screen's module reads, owes every route.
    else if (modules.get(file)?.length && !importedElsewhere(file)) {
      modules.get(file).forEach((r) => hit.add(r));
    } else routes.forEach((r) => hit.add(r));
  }
  return routes.filter((r) => hit.has(r));
}

/** A ledger with nothing reviewed yet: the first run owes every route a look. */
export function emptyLedger() {
  return {
    version: 1,
    head: null,
    reviewedThrough: null,
    pending: [],
    pendingThrough: null,
    findings: [],
  };
}

/** A pull request the loop opened: its branch prefix, from this repository. */
export const isOwnPr = (pr) => OWN_BRANCH.test(pr.headRefName) && pr.isCrossRepository === false;

/**
 * Bring the loop's own pull requests into the ledger before anything else.
 * An open one is the only work this run may do; merged and declined ones are
 * recorded. Pull requests apply oldest first and a finding only follows its
 * newest one, so an old outcome never overwrites a newer one, and a closed
 * pull request's outcome applies once. A leftover branch never blocks a run:
 * branches are named per run, and the shared writer key means no other writer
 * is holding one. Fork pull requests are never the loop's own.
 */
export function reconcileOwnPrs(ledger, prs, now) {
  const next = structuredClone(ledger);
  let openPr = null;
  const own = prs.filter(isOwnPr).sort((a, b) => a.number - b.number);
  for (const pr of own) {
    const prints = [...(pr.body ?? '').matchAll(MARKER)].map((m) => m[1]);
    const status = pr.state === 'OPEN' ? 'pr-open' : pr.state === 'MERGED' ? 'merged' : 'declined';
    if (status === 'pr-open') openPr ??= pr.number;
    for (const finding of next.findings.filter((f) => prints.includes(f.fingerprint))) {
      finding.applied ??= [];
      // Each distinct outcome of a pull request applies once; a reopen, a new
      // closure or a merge after a reopen is a new outcome and applies again.
      const outcome = `${pr.number}:${status}:${pr.closedAt ?? ''}`;
      if (finding.applied.includes(outcome)) continue;
      // A pull request older than the one the finding follows is history,
      // even when it first shows up in a later run.
      if ((finding.pr ?? 0) > pr.number) continue;
      finding.pr = pr.number;
      finding.status = status;
      if (status === 'pr-open') continue;
      finding.applied.push(outcome);
      if (status === 'declined') finding.declinedAt = pr.closedAt ?? now;
      // Merged is not deployed: look at the route again on main to confirm it.
      if (status === 'merged' && !next.pending.includes(finding.route)) {
        next.pending.push(finding.route);
      }
    }
  }
  return { ledger: next, openPr };
}

/**
 * What this run does. Other Tessl work in flight defers only the repair. The loop's own
 * open pull request means look after that pull request and nothing else.
 * Otherwise review a bounded batch: routes with open findings first, then
 * routes still owed a look. With nothing to capture but findings still
 * repairable, repair. Only with neither is there nothing to do.
 */
export function planRun(
  ledger,
  { head, changedFiles, mainSource, routes, others, openPr, now, importers },
) {
  if (openPr) return { action: 'monitor', pr: openPr, ledger };
  const next = structuredClone(ledger);
  next.head = head;
  // A coverage interval runs from reviewedThrough to pendingThrough. A new one
  // opens only when the last is fully reviewed, so the backlog always shrinks
  // and a main that moves between runs cannot keep refilling it. Commits after
  // pendingThrough are owed in the next interval.
  if (!next.pending.length && next.pendingThrough !== head) {
    const owed =
      next.reviewedThrough === null
        ? routes
        : affectedRoutes(changedFiles, mainSource, routes, importers);
    next.pending = [...owed];
    next.pendingThrough = head;
  }
  // Open findings are looked at again once per head, so a fix on main clears them.
  const revisit = repairable(next, now)
    .filter((f) => f.seenAt !== head)
    .map((f) => f.route);
  // Revisits take at most half the batch, so owed coverage always progresses.
  const revisits = [...new Set(revisit)].filter((r) => !next.pending.includes(r));
  const owedNow = next.pending.slice(0, BATCH_SIZE - Math.min(revisits.length, BATCH_SIZE / 2));
  const batch = [...owedNow, ...revisits].slice(0, BATCH_SIZE);
  // Inspection runs even while other Tessl work is open. Only the repair, which
  // writes app code, waits for it; unresolved findings stay in the ledger.
  const deferRepair = others.length ? others.join('; ') : null;
  if (batch.length) return { action: 'review', batch, deferRepair, ledger: next };
  if (repairable(next, now).length) {
    if (deferRepair) return { action: 'defer', reason: deferRepair, ledger: next };
    return { action: 'repair', ledger: next };
  }
  return { action: 'nothing', ledger: next };
}

/** Reject a review that does not match its plan or the rubric. */
export function validateReview(review, plan, criteria) {
  const errors = [];
  if (review.head !== plan.head)
    errors.push(`review is of ${review.head}, the plan is for ${plan.head}`);
  for (const route of review.reviewed ?? []) {
    if (!(plan.batch ?? []).includes(route)) errors.push(`${route} was not in the planned batch`);
  }
  for (const f of review.findings ?? []) {
    if (!(review.reviewed ?? []).includes(f.route)) errors.push(`finding on unreviewed ${f.route}`);
    if (!criteria.includes(f.criterion)) errors.push(`unknown criterion ${f.criterion}`);
    if (!STATE.test(f.state ?? '')) errors.push(`unknown state ${f.state}`);
    if (typeof f.note !== 'string' || !f.note.trim()) errors.push(`finding without a note`);
  }
  return errors;
}

/**
 * Save a finished review of a batch. Findings are keyed by route, state and
 * criterion. A reviewed route's old findings that did not come back are
 * resolved. The coverage checkpoint moves only once no route is owed a look.
 */
export function recordReview(ledger, { reviewed, findings, pr = null, now }) {
  const next = structuredClone(ledger);
  next.pending = next.pending.filter((r) => !reviewed.includes(r));
  for (const f of findings) {
    const fingerprint = `${f.route}:${f.state}:${f.criterion}`;
    const old = next.findings.find((o) => o.fingerprint === fingerprint);
    const fixed = pr && f.fixedBy === pr;
    if (old) {
      old.note = f.note;
      if (old.status !== 'declined' || isStale(old, now)) {
        old.status = fixed ? 'pr-open' : 'open';
        if (fixed) old.pr = pr;
      }
    } else {
      next.findings.push({
        fingerprint,
        route: f.route,
        state: f.state,
        criterion: f.criterion,
        note: f.note,
        firstSeen: now,
        seenAt: next.head,
        status: fixed ? 'pr-open' : 'open',
        ...(fixed ? { pr } : {}),
      });
    }
  }
  const seen = new Set(findings.map((f) => `${f.route}:${f.state}:${f.criterion}`));
  for (const old of next.findings) {
    if (reviewed.includes(old.route) && !seen.has(old.fingerprint) && old.status !== 'pr-open') {
      old.status = 'resolved';
    }
  }
  for (const old of next.findings) if (reviewed.includes(old.route)) old.seenAt = next.head;
  if (!next.pending.length) next.reviewedThrough = next.pendingThrough;
  return next;
}

/**
 * Findings a repair may take on: open or declined, and not declined in the
 * last 30 days. The decline date stays with the finding through resolution and
 * recurrence, so the cooldown always holds.
 */
export function repairable(ledger, now) {
  return ledger.findings.filter(
    (f) => ['open', 'declined'].includes(f.status) && (!f.declinedAt || isStale(f, now)),
  );
}

function isStale(finding, now) {
  return Date.parse(now) - Date.parse(finding.declinedAt) > DECLINE_DAYS * 86400e3;
}

// Storage. Reads and writes go through git on a plain branch: no custom ref,
// no new service. A write is a fast-forward push; if another run moved the
// branch first, the push is refused and this run's record is not saved.

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Which src files import a module, at a commit. A failed search throws. */
export function importersAt(repo, head) {
  return (file) => {
    const name = file
      .replace(/^src\//, '')
      .replace(/\.ts$/, '')
      .split('/')
      .pop();
    try {
      return git(repo, 'grep', '-l', '-E', `from '[./]+(.*/)?${name}'`, head, '--', 'src')
        .split('\n')
        .map((line) => line.slice(head.length + 1))
        .filter((f) => f && f !== file);
    } catch (error) {
      // git grep exits 1 only when it searched and found nothing. Any other
      // failure must stop the plan, not pass for a module nothing imports.
      if (error.status === 1 && !String(error.stderr ?? '').trim()) return [];
      throw error;
    }
  };
}

/** The ledger on origin and the commit it was read from, or an empty one. */
export function readLedger(repo, remote = 'origin') {
  // ls-remote exits 2 only when the remote answered and has no such branch.
  // Any other failure (network, auth, a missing remote) throws: it must stop
  // the run, not pass for a first run that owes every route again.
  try {
    git(repo, 'ls-remote', '--exit-code', '--heads', remote, LEDGER_BRANCH);
  } catch (error) {
    if (error.status === 2) return { ledger: emptyLedger(), base: null };
    throw error;
  }
  const tracking = `refs/remotes/${remote}/${LEDGER_BRANCH}`;
  git(repo, 'fetch', '--quiet', remote, `+refs/heads/${LEDGER_BRANCH}:${tracking}`);
  const base = git(repo, 'rev-parse', tracking);
  return { ledger: JSON.parse(git(repo, 'show', `${base}:${LEDGER_FILE}`)), base };
}

/** Push the ledger as a child of `base`. Throws if origin moved since the read. */
export function writeLedger(repo, ledger, base, message, remote = 'origin') {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
  try {
    const file = join(dir, LEDGER_FILE);
    writeFileSync(file, JSON.stringify(ledger, null, 2) + '\n');
    const blob = git(repo, 'hash-object', '-w', file);
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${blob},${LEDGER_FILE}`], {
      cwd: repo,
      env,
    });
    const tree = execFileSync('git', ['write-tree'], { cwd: repo, env, encoding: 'utf8' }).trim();
    const commit = git(repo, 'commit-tree', tree, ...(base ? ['-p', base] : []), '-m', message);
    // Without a force flag git refuses anything but a fast-forward of base.
    git(repo, 'push', '--quiet', remote, `${commit}:refs/heads/${LEDGER_BRANCH}`);
    return commit;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The command line the skill runs.

const gh = (...args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));

function plan(repo, now) {
  const { ledger, base } = readLedger(repo);
  git(repo, 'fetch', '--quiet', 'origin', 'main');
  const head = git(repo, 'rev-parse', 'origin/main');
  const mainSource = git(repo, 'show', `${head}:src/main.ts`);
  const gameIds = git(repo, 'ls-tree', '--name-only', `${head}:src/games`)
    .split('\n')
    .filter((n) => !n.includes('.'));
  const routes = allRoutes(mainSource, gameIds);
  const changedFiles = ledger.reviewedThrough
    ? git(repo, 'diff', '--name-only', `${ledger.reviewedThrough}..${head}`)
        .split('\n')
        .filter(Boolean)
    : [];
  // Lists that hit their limit may be missing work, so treat that as a stop.
  const list = (...args) => {
    const items = gh(...args, '--limit', String(LIST_LIMIT));
    if (items.length >= LIST_LIMIT) throw new Error(`gh ${args.join(' ')} hit ${LIST_LIMIT} items`);
    return items;
  };
  const fields = 'number,state,headRefName,isCrossRepository,body,closedAt,files';
  // Only own pull requests updated since the last reconcile: older history is
  // already in the ledger, so a growing history never reaches the limit.
  // A week of overlap covers search indexing lag, and pull requests the
  // ledger still tracks as open are read directly below, whatever their age.
  const overlap = ledger.reconciledAt && new Date(Date.parse(ledger.reconciledAt) - 7 * 86400e3);
  const since = overlap ? ` updated:>=${overlap.toISOString().slice(0, 10)}` : '';
  const prs = list(
    'pr',
    'list',
    '--state',
    'all',
    '--search',
    `head:tessl/visual-repair-${since}`,
    '--json',
    fields,
  );
  const issues = list('issue', 'list', '--state', 'open', '--label', 'tessl', '--json', 'number');
  const open = list('pr', 'list', '--state', 'open', '--json', fields).filter((p) => !isOwnPr(p));
  const others = [
    ...open
      .filter((p) => p.headRefName.startsWith('tessl/'))
      .map((p) => `open Tessl pull request #${p.number}`),
    ...open
      .filter((p) => !p.headRefName.startsWith('tessl/'))
      .filter((p) => (p.files ?? []).some((f) => SHARED.some((s) => s.test(f.path))))
      .map((p) => `open pull request #${p.number} changes shared UI files`),
    ...issues
      .filter((i) => !open.some((p) => new RegExp(`Closes #${i.number}\\b`).test(p.body ?? '')))
      .map((i) => `labelled issue #${i.number} has no pull request yet`),
  ];
  // The open list is complete, so an own open PR is never missed even when
  // the search is slow to index it.
  const ownOpen = gh(
    'pr',
    'list',
    '--state',
    'open',
    '--limit',
    String(LIST_LIMIT),
    '--json',
    fields,
  ).filter(isOwnPr);
  const known = new Set([...prs, ...ownOpen].map((p) => p.number));
  const tracked = [
    ...new Set(ledger.findings.filter((f) => f.status === 'pr-open').map((f) => f.pr)),
  ]
    .filter((n) => !known.has(n))
    .map((n) => gh('pr', 'view', String(n), '--json', fields));
  const reconciled = reconcileOwnPrs(
    ledger,
    [...prs.filter((p) => !ownOpen.some((o) => o.number === p.number)), ...ownOpen, ...tracked],
    now,
  );
  const result = planRun(reconciled.ledger, {
    head,
    changedFiles,
    mainSource,
    routes,
    others,
    openPr: reconciled.openPr,
    now,
    importers: importersAt(repo, head),
  });
  result.ledger.reconciledAt = now;
  return { ...result, base, head, repairable: repairable(result.ledger, now) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, file] = process.argv.slice(2);
  const repo = process.cwd();
  const now = new Date().toISOString();
  if (command === 'plan') {
    const result = plan(repo, now);
    writeFileSync('/tmp/visual-repair-plan.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ ...result, ledger: undefined }, null, 2));
  } else if (command === 'record') {
    // <file> holds { reviewed, findings, pr }; the plan written by `plan`
    // supplies the ledger and the commit it was read from.
    const planned = JSON.parse(readFileSync('/tmp/visual-repair-plan.json', 'utf8'));
    const review = JSON.parse(readFileSync(file, 'utf8'));
    // Coverage is credited to the planned main commit and batch, and findings
    // use the rubric's own names, so a malformed record is refused, not saved.
    const { criteria } = JSON.parse(
      readFileSync(new URL('../../review-lenses/visual-design/rubric.json', import.meta.url)),
    );
    const errors = validateReview(review, planned, criteria);
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exit(1);
    }
    const next = recordReview(planned.ledger, { ...review, now });
    const commit = writeLedger(
      repo,
      next,
      planned.base,
      `visual repair: reviewed ${review.reviewed.join(' ')}`,
    );
    console.log(
      JSON.stringify({ commit, reviewedThrough: next.reviewedThrough, pending: next.pending }),
    );
  } else {
    console.error('usage: ledger.mjs plan | record <review.json>');
    process.exit(2);
  }
}
