import { readFileSync } from 'node:fs';
import { reportCosts } from './cost-report.mjs';
console.log('LIVE LOCAL COST RECONCILIATION: synthetic observations, no service calls');
for (const name of ['before-late-billing', 'after-late-billing']) {
  const report = reportCosts(
    JSON.parse(readFileSync(new URL(`./cost-fixtures/${name}.json`, import.meta.url), 'utf8')),
  );
  console.log(
    JSON.stringify(
      {
        fixture: name,
        uniqueOperations: report.totals.operationCount,
        observations: report.observationCount,
        duplicateObservations: report.duplicateObservations,
        knownCredits: report.totals.credits.total.known,
        pendingBills: report.totals.pendingBillingCount,
        unsettled: report.totals.unsettledCount,
        platform: report.totals.credits.platform.known,
        ai: report.totals.credits.ai.known,
        usage: report.totals.credits.usage.known,
        noAction: report.explicitNoAction.credits.total.known,
        cancelled: report.cancelled.credits.total.known,
        failed: report.failed.credits.total.known,
      },
      null,
      2,
    ),
  );
  if (process.argv.includes('--pause')) await new Promise((resolve) => setTimeout(resolve, 2500));
}
console.log('Five operations remain five: late billing increases known cost, duplicates do not.');
console.log('Finality remains unknown. These are synthetic examples, not achieved savings.');
