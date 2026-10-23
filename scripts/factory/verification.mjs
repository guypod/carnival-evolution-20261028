// Local, mutable evidence only. This is not an attestation or permission to merge.
import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';

export const RECEIPT_PATH = '.factory-artifacts/verification.json';
export const COMMANDS = ['npm run check', 'npm run build'];
export const COMMAND_TIMEOUT_MS = 180_000;
const GIT_TIMEOUT_MS = 5_000;
const MAX_RECEIPT_BYTES = 32_768;
// Only these exact root-relative generated directories are skipped. Tracked files
// inside them are still hashed. Git ignore rules are deliberately NOT consulted.
export const GENERATED_DIRECTORIES = [
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.factory-artifacts',
  '.tessl/plugins',
  '.agents/skills',
  '.claude/skills',
  '.codex/skills',
  '.cursor/skills',
  '.github/skills',
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
const digest = (value) => sha256(canonical(value));
const excluded = (path) =>
  GENERATED_DIRECTORIES.some((directory) => path === directory || path.startsWith(`${directory}/`));
const git = (root, args) =>
  execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

export function repositoryRoot(cwd) {
  const root = realpathSync(git(cwd, ['rev-parse', '--show-toplevel']).trim());
  if (root !== realpathSync(cwd)) throw new Error('Run factory:verify from the repository root.');
  return root;
}

export function sourceSnapshot(root) {
  const paths = new Set(git(root, ['ls-files', '-z', '--cached']).split('\0').filter(Boolean));
  const walk = (directory = '') => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (excluded(path)) continue;
      if (entry.isDirectory()) walk(path);
      else paths.add(path);
    }
  };
  walk();
  const files = [...paths].sort().map((path) => {
    const absolute = join(root, path);
    let stat;
    try {
      // Tracked files can sit below excluded directories; reject a symlink
      // ancestor there too rather than reading its target outside the tree.
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i += 1) {
        if (!lstatSync(join(root, ...parts.slice(0, i))).isDirectory()) {
          throw new Error(`Unsupported source parent directory: ${path}`);
        }
      }
      stat = lstatSync(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') return [path, 'missing'];
      throw error;
    }
    // Do not follow links outside the measured tree or read devices/FIFOs. A
    // tracked directory (submodule) also needs a deliberate policy, not a pass.
    if (!stat.isFile()) throw new Error(`Unsupported source file type: ${path}`);
    return [path, stat.mode & 0o111 ? 'executable' : 'file', sha256(readFileSync(absolute))];
  });
  return {
    head: git(root, ['rev-parse', '--verify', 'HEAD']).trim(),
    algorithm: 'sha256-source-tree-v1',
    sha256: digest(files),
    fileCount: files.length,
  };
}

function runnerSha256() {
  return digest(
    ['verification.mjs', 'verify.mjs'].map((file) => [
      file,
      sha256(readFileSync(new URL(file, import.meta.url))),
    ]),
  );
}

function runCommand(root, script, timeoutMs, stdio) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    let timedOut = false;
    let spawnError = false;
    let killTimer;
    // No shell, custom command, environment dump or output capture. The child
    // inherits the existing environment, plus a same-repository recursion guard.
    const child = spawn('npm', ['run', script], {
      cwd: root,
      detached: process.platform !== 'win32',
      stdio,
      env: {
        ...process.env,
        CARNIVAL_FACTORY_VERIFY_ROOT: root,
        npm_config_update_notifier: 'false',
      },
    });
    const kill = (signal) => {
      try {
        if (process.platform === 'win32') child.kill(signal);
        else if (child.pid) process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') spawnError = true;
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 250);
    }, timeoutMs);
    child.on('error', () => {
      spawnError = true;
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      // Kill any remaining descendants even when npm exited on SIGTERM first.
      if (timedOut) kill('SIGKILL');
      clearTimeout(killTimer);
      resolve({
        command: `npm run ${script}`,
        executable: 'npm',
        args: ['run', script],
        timeoutMs,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        exitCode,
        signal,
        timedOut,
        error: spawnError ? 'spawn-or-termination-error' : null,
      });
    });
  });
}

function artifactDirectory(root) {
  const directory = join(root, '.factory-artifacts');
  mkdirSync(directory, { recursive: true });
  if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) {
    throw new Error('Receipt directory must be a real directory inside the repository.');
  }
  return directory;
}

function saveReceipt(root, receipt) {
  const directory = artifactDirectory(root);
  const temporary = join(directory, `${randomUUID()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, join(root, RECEIPT_PATH));
}

export async function runVerification({ cwd, timeoutMs = COMMAND_TIMEOUT_MS, stdio = 'inherit' }) {
  const root = repositoryRoot(cwd);
  if (process.env.CARNIVAL_FACTORY_VERIFY_ROOT === root) {
    throw new Error('Refusing recursive factory:verify for the same repository.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > COMMAND_TIMEOUT_MS) {
    throw new Error('Command timeout must be positive and at most 180000 milliseconds.');
  }
  // Check the destination before starting expensive work, without following links.
  artifactDirectory(root);
  const before = sourceSnapshot(root);
  const startedAt = new Date().toISOString();
  const commands = [];
  for (const script of ['check', 'build']) {
    commands.push(await runCommand(root, script, timeoutMs, stdio));
  }
  let after = null;
  try {
    after = sourceSnapshot(root);
  } catch {
    // Unsupported/new source or a Git failure cannot turn a run into success.
  }
  const sourceUnchanged = isDeepStrictEqual(before, after);
  const commandSuccess = commands.every(
    (command) => command.exitCode === 0 && !command.signal && !command.timedOut && !command.error,
  );
  const body = {
    schemaVersion: 1,
    kind: 'carnival-factory-local-verification',
    provenance: {
      repositoryRoot: root,
      runnerSha256: runnerSha256(),
      nodeVersion: process.version,
      platform: process.platform,
      generatedDirectories: GENERATED_DIRECTORIES,
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    before,
    after,
    sourceUnchanged,
    commands,
    outcome: commandSuccess && sourceUnchanged ? 'passed' : 'failed',
  };
  const receipt = { ...body, receiptSha256: digest(body) };
  saveReceipt(root, receipt);
  return receipt;
}

const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const timestamp = (value) =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
function validSnapshot(value) {
  return (
    exactKeys(value, ['head', 'algorithm', 'sha256', 'fileCount']) &&
    typeof value.head === 'string' &&
    /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value.head) &&
    value.algorithm === 'sha256-source-tree-v1' &&
    hash(value.sha256) &&
    Number.isInteger(value.fileCount) &&
    value.fileCount > 0
  );
}

/** Strictly validate local evidence. A party able to rewrite and rehash a receipt
 * can still forge it; fresh execution, trusted CI and review remain necessary. */
export function validateReceipt({ cwd }) {
  const root = repositoryRoot(cwd);
  const path = join(root, RECEIPT_PATH);
  if (relative(root, realpathSync(path)) !== RECEIPT_PATH || !lstatSync(path).isFile()) {
    throw new Error('Receipt must be a regular local file, not a symlink.');
  }
  if (lstatSync(path).size > MAX_RECEIPT_BYTES) throw new Error('Receipt is too large.');
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  const fail = (reason) => {
    throw new Error(`Invalid verification receipt: ${reason}`);
  };
  if (
    !exactKeys(receipt, [
      'schemaVersion',
      'kind',
      'provenance',
      'startedAt',
      'finishedAt',
      'before',
      'after',
      'sourceUnchanged',
      'commands',
      'outcome',
      'receiptSha256',
    ]) ||
    receipt.schemaVersion !== 1 ||
    receipt.kind !== 'carnival-factory-local-verification'
  )
    fail('schema');
  const { receiptSha256, ...body } = receipt;
  if (!hash(receiptSha256) || receiptSha256 !== digest(body)) fail('integrity digest');
  const provenance = receipt.provenance;
  if (
    !exactKeys(provenance, [
      'repositoryRoot',
      'runnerSha256',
      'nodeVersion',
      'platform',
      'generatedDirectories',
    ]) ||
    provenance.repositoryRoot !== root ||
    provenance.runnerSha256 !== runnerSha256() ||
    provenance.nodeVersion !== process.version ||
    provenance.platform !== process.platform ||
    !isDeepStrictEqual(provenance.generatedDirectories, GENERATED_DIRECTORIES)
  )
    fail('provenance');
  if (
    !timestamp(receipt.startedAt) ||
    !timestamp(receipt.finishedAt) ||
    receipt.startedAt > receipt.finishedAt ||
    Date.parse(receipt.finishedAt) > Date.now()
  )
    fail('run timestamps');
  if (!validSnapshot(receipt.before) || !validSnapshot(receipt.after)) fail('source schema');
  if (
    receipt.sourceUnchanged !== true ||
    !isDeepStrictEqual(receipt.before, receipt.after) ||
    !isDeepStrictEqual(receipt.after, sourceSnapshot(root))
  )
    fail('HEAD or source tree changed; run factory:verify again');
  if (receipt.outcome !== 'passed') fail('run did not pass');
  if (!Array.isArray(receipt.commands) || receipt.commands.length !== 2) fail('required commands');
  let previousFinished = receipt.startedAt;
  for (const [index, command] of receipt.commands.entries()) {
    if (
      !exactKeys(command, [
        'command',
        'executable',
        'args',
        'timeoutMs',
        'startedAt',
        'finishedAt',
        'durationMs',
        'exitCode',
        'signal',
        'timedOut',
        'error',
      ]) ||
      command.command !== COMMANDS[index] ||
      command.executable !== 'npm' ||
      !isDeepStrictEqual(command.args, ['run', index === 0 ? 'check' : 'build']) ||
      !Number.isInteger(command.timeoutMs) ||
      command.timeoutMs < 1 ||
      command.timeoutMs > COMMAND_TIMEOUT_MS ||
      !timestamp(command.startedAt) ||
      !timestamp(command.finishedAt) ||
      command.startedAt < previousFinished ||
      command.startedAt > command.finishedAt ||
      command.finishedAt > receipt.finishedAt ||
      !Number.isInteger(command.durationMs) ||
      command.durationMs < 0 ||
      command.durationMs > command.timeoutMs + 1000 ||
      Math.abs(
        Date.parse(command.finishedAt) - Date.parse(command.startedAt) - command.durationMs,
      ) > 1000 ||
      command.exitCode !== 0 ||
      command.signal !== null ||
      command.timedOut !== false ||
      command.error !== null
    )
      fail(`required command ${index + 1} schema/outcome`);
    previousFinished = command.finishedAt;
  }
  return receipt;
}
