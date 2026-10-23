#!/usr/bin/env node
import { RECEIPT_PATH, runVerification, validateReceipt } from './verification.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--validate')) {
    throw new Error('Usage: npm run factory:verify [-- --validate]');
  }
  const receipt =
    args[0] === '--validate'
      ? validateReceipt({ cwd: process.cwd() })
      : await runVerification({ cwd: process.cwd() });
  console.log(
    `Factory local verification: ${receipt.outcome}; HEAD ${receipt.after?.head ?? receipt.before.head}`,
  );
  for (const command of receipt.commands) {
    console.log(
      `${command.command}: exit ${command.exitCode}, timeout ${command.timedOut}, ${command.durationMs}ms`,
    );
  }
  console.log(`Receipt: ${RECEIPT_PATH}; mutable local evidence, not merge authorization.`);
  process.exitCode = receipt.outcome === 'passed' ? 0 : 1;
} catch (error) {
  console.error(`Factory local verification failed: ${error.message}`);
  process.exitCode = 1;
}
