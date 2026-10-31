// Turns a flow.json from flow.mjs into the browser-flow check run body, with
// the record the native merge gate reads (evidenceMarker in native.mjs).
//
//   node scripts/visual/flow-check.mjs <flow.json> <head> <evidence commit> <dir>
import { readFileSync } from 'node:fs';
import { BROWSER_CHECK, evidenceMarker } from '../native/native.mjs';

/** The check run for a flow report: success only when every check passed. */
export function flowCheckRun(report, head, evidenceCommit, dir) {
  const pass = report.result === 'pass';
  const record = {
    head,
    evidenceCommit,
    flows: report.checks.map((c) => ({ name: `${report.flow}: ${c.check}`, result: c.result })),
    screenshots: report.screenshots.map((s) => ({ path: `${dir}/${s.file}`, sha256: s.sha256 })),
  };
  const lines = report.checks.map((c) => `- ${c.result}: ${c.check}`);
  return {
    name: BROWSER_CHECK,
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

if (process.argv[1]?.endsWith('flow-check.mjs')) {
  const [file, head, commit, dir] = process.argv.slice(2);
  const report = JSON.parse(readFileSync(file, 'utf8'));
  console.log(JSON.stringify(flowCheckRun(report, head, commit, dir)));
}
