// Checks an isolated flow attempt directory and prints its provenance record.
// Trusted code, run on the host after the flow: it accepts only the files the
// trusted flow.mjs writes (flow.json and <flow>-<state>.png), each a plain
// file, and recomputes every screenshot's sha256. Anything else (a symlink,
// a path with a separator, an unexpected file, a digest that does not match)
// makes it exit non-zero, so a forged or redirected artifact never becomes
// part of a record.
//
//   node scripts/visual/isolated-record.mjs <attempt dir> <flow> <sha> <runner sha>
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SHA = /^[0-9a-f]{40}$/;

/** Problems with an attempt directory; empty when it can go into a record. */
export function attemptProblems(dir, flow, sha, runnerSha) {
  const problems = [];
  if (!SHA.test(sha ?? '')) problems.push(`candidate ${sha} is not a full sha`);
  if (!SHA.test(runnerSha ?? '')) problems.push(`runner ${runnerSha} is not a full sha`);
  const shot = new RegExp(`^${flow.replace(/[^a-z0-9-]/g, '')}-[a-z0-9-]+\\.png$`);
  for (const name of readdirSync(dir)) {
    const st = lstatSync(join(dir, name));
    if (!st.isFile()) problems.push(`${name} is not a plain file`);
    else if (name !== 'flow.json' && !shot.test(name)) problems.push(`${name} is not expected`);
  }
  if (problems.length) return problems;
  let report;
  try {
    report = JSON.parse(readFileSync(join(dir, 'flow.json'), 'utf8'));
  } catch {
    return ['flow.json is missing or not JSON'];
  }
  if (report.flow !== flow) problems.push(`report is for ${report.flow}, not ${flow}`);
  if (!Array.isArray(report.screenshots) || !report.screenshots.length)
    return [...problems, 'report lists no screenshots'];
  for (const s of report.screenshots) {
    if (typeof s?.file !== 'string' || !shot.test(s.file)) {
      problems.push(`screenshot path ${JSON.stringify(s?.file)} is not allowed`);
      continue;
    }
    let bytes;
    try {
      if (!lstatSync(join(dir, s.file)).isFile()) throw new Error();
      bytes = readFileSync(join(dir, s.file));
    } catch {
      problems.push(`${s.file} is missing`);
      continue;
    }
    if (createHash('sha256').update(bytes).digest('hex') !== s.sha256)
      problems.push(`${s.file} does not match its sha256`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, flow, sha, runnerSha] = process.argv.slice(2);
  const problems = attemptProblems(dir, flow, sha, runnerSha);
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(join(dir, 'flow.json'), 'utf8'));
  console.log(
    JSON.stringify(
      {
        flow,
        candidate: sha,
        runner: runnerSha,
        bootstrap: null,
        publishable: false,
        // Build and page ran in --network none containers from the trusted
        // dependency snapshot; Chromium's own sandbox was off (see
        // isolated-flow.sh).
        boundary: { network: 'none', chromiumSandbox: false, dependencies: 'runner-snapshot' },
        result: report.result,
        screenshots: report.screenshots,
      },
      null,
      2,
    ),
  );
}
