// Usage: node scripts/factory/check-contract.mjs [path/to/tessl.json]
import { readFileSync } from 'node:fs';
import { checkContract } from './contract.mjs';

const path = process.argv[2] ?? 'tessl.json';
let manifest;
try {
  manifest = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  console.error(`factory contract: cannot read ${path}: ${error.message}`);
  process.exit(1);
}
const errors = checkContract(manifest);
if (errors.length > 0) {
  console.error(`factory contract: ${path} fails ${errors.length} check(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`factory contract: ${path} holds`);
