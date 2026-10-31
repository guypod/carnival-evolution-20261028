// Turns a flow.json from flow.mjs into the browser-flow check run body, with
// the record the native merge gate reads (evidenceMarker in native.mjs).
//
//   node scripts/visual/flow-check.mjs <flow.json> <head> <evidence commit> <dir> <flow exit status>
//   node scripts/visual/flow-check.mjs --start <flow> <head>
//   node scripts/visual/flow-check.mjs --fail <flow> <step> <exit status>
import { readFileSync } from 'node:fs';
import { BROWSER_CHECK, evidenceMarker, flowExternalId } from '../native/native.mjs';

// run-flow.sh --live sets browser-flow-live; the default is the premerge check.
const NAME = process.env.FLOW_CHECK_NAME ?? BROWSER_CHECK;
const idOf = (flow) => (NAME === BROWSER_CHECK ? flowExternalId(flow) : `${NAME}:${flow}`);

/**
 * The check run for a flow report: success only when every check passed and
 * the flow process itself exited 0 (status, when given). A live run adds
 * `live`: { mergeSha, deployedSha, url, capturedAt, identity }, which
 * shipState checks against the deployment.
 */
export function flowCheckRun(report, head, evidenceCommit, dir, status = 0, live = {}) {
  const pass =
    Number(status) === 0 &&
    report.result === 'pass' &&
    report.checks?.length > 0 &&
    report.checks.every((c) => c.result === 'pass');
  const record = {
    head,
    flow: report.flow,
    evidenceCommit,
    flows: report.checks.map((c) => ({ name: `${report.flow}: ${c.check}`, result: c.result })),
    screenshots: report.screenshots.map((s) => ({ path: `${dir}/${s.file}`, sha256: s.sha256 })),
    ...live,
  };
  const lines = report.checks.map((c) => `- ${c.result}: ${c.check}`);
  return {
    name: NAME,
    external_id: idOf(report.flow),
    head_sha: head,
    status: 'completed',
    conclusion: pass ? 'success' : 'failure',
    output: {
      title: `${report.flow}: ${pass ? 'passed' : 'failed'}`,
      summary:
        [...lines, ...report.errors.map((e) => `- error: ${e}`)].join('\n') || 'no checks ran',
      text: evidenceMarker(record),
    },
  };
}

/** The in-progress check run an attempt opens before setup or capture begins. */
export function startCheckRun(flow, head) {
  return {
    name: NAME,
    external_id: idOf(flow),
    head_sha: head,
    status: 'in_progress',
    output: { title: `${flow}: running`, summary: 'Browser flow attempt started.' },
  };
}

/** The failure that concludes an attempt which stopped before publishing a pass. */
export function failCheckRun(flow, step, status) {
  return {
    status: 'completed',
    conclusion: 'failure',
    output: {
      title: `${flow}: failed at ${step}`,
      summary: `The attempt stopped at ${step} with exit status ${status}. No evidence was published.`,
    },
  };
}

if (process.argv[1]?.endsWith('flow-check.mjs')) {
  const [first, ...rest] = process.argv.slice(2);
  if (first === '--start') console.log(JSON.stringify(startCheckRun(rest[0], rest[1])));
  else if (first === '--fail') console.log(JSON.stringify(failCheckRun(...rest)));
  else {
    const [head, commit, dir] = rest;
    const report = JSON.parse(readFileSync(first, 'utf8'));
    // The body concludes the attempt's own check run, so it carries no head.
    // run-flow.sh --live passes the identity checks it made around the flow.
    const live = process.env.FLOW_LIVE_IDENTITY
      ? {
          mergeSha: head,
          deployedSha: process.env.FLOW_LIVE_DEPLOYED,
          url: report.base,
          capturedAt: process.env.FLOW_CAPTURED_AT,
          identity: JSON.parse(readFileSync(process.env.FLOW_LIVE_IDENTITY, 'utf8')),
        }
      : {};
    const body = flowCheckRun(report, head, commit, dir, 0, live);
    delete body.head_sha;
    console.log(JSON.stringify(body));
  }
}
