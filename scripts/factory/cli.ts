// Usage: node scripts/factory/cli.ts --snapshot <file.json>
// Read-only: it reads one local JSON file and prints a decision.
import { readFileSync } from 'node:fs';
import { decide, EXIT_CODES } from './decide.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--snapshot');
const file = at >= 0 ? args[at + 1] : undefined;
if (!file || args.length !== 2) {
  console.error('Usage: npm run factory:readiness -- --snapshot <file.json>');
  process.exit(2);
}

let input: unknown;
try {
  input = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  input = undefined;
  console.error(`Could not read ${file}: ${(error as Error).message}`);
}
const decision = decide(input);
console.log(JSON.stringify(decision, null, 2));
process.exit(EXIT_CODES[decision.verdict]);
