import { readFileSync } from 'node:fs';
import { reportCosts } from './cost-report.mjs';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--input') {
  console.error('Usage: npm run factory:costs -- --input <local-observations.json>');
  process.exit(2);
}
try {
  console.log(JSON.stringify(reportCosts(JSON.parse(readFileSync(args[1], 'utf8'))), null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'INVALID_INPUT', error: error.message }));
  process.exit(2);
}
