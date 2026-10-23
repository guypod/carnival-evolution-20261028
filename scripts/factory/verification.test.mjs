// No test launches this repository's check/build or the verifier CLI. Commands
// below are tiny fake npm scripts in disposable Git repositories, with deadlines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMMANDS,
  RECEIPT_PATH,
  runVerification,
  sourceSnapshot,
  validateReceipt,
} from './verification.mjs';

function fixture(t, { check = 'process.exit(0)', build = 'process.exit(0)' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'factory-verification-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], { stdio: 'ignore', timeout: 5000 });
  writeFileSync(join(root, '.gitignore'), '.factory-artifacts/\ndist/\n*.log\n');
  writeFileSync(join(root, 'source.txt'), 'original\n');
  writeFileSync(join(root, 'check.cjs'), check);
  writeFileSync(join(root, 'build.cjs'), build);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      private: true,
      scripts: { check: 'node check.cjs', build: 'node build.cjs' },
    }),
  );
  git('init', '-q');
  git('add', '.');
  const commit = (message = 'fixture') =>
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      message,
      '--allow-empty',
    );
  commit();
  const run = (options = {}) =>
    runVerification({ cwd: root, timeoutMs: 5000, stdio: 'ignore', ...options });
  const validate = () => validateReceipt({ cwd: root });
  return { root, git, commit, run, validate, receiptPath: join(root, RECEIPT_PATH) };
}

// Deliberately recompute the non-secret integrity checksum in schema tests to
// ensure malformed claims fail semantic checks, not merely the checksum check.
function reseal(receipt) {
  const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object')
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
        .join(',')}}`;
    return JSON.stringify(value);
  };
  const { receiptSha256: ignored, ...body } = receipt;
  assert.equal(typeof ignored, 'string');
  return { ...body, receiptSha256: createHash('sha256').update(canonical(body)).digest('hex') };
}

test('valid unchanged source has sequential full commands and reproducible fingerprint', async (t) => {
  const f = fixture(t);
  const before = sourceSnapshot(f.root);
  const receipt = await f.run();
  assert.equal(receipt.outcome, 'passed');
  assert.deepEqual(
    receipt.commands.map((command) => command.command),
    COMMANDS,
  );
  assert.equal(
    receipt.commands.every((command) => command.exitCode === 0),
    true,
  );
  assert.ok(receipt.commands[1].startedAt >= receipt.commands[0].finishedAt);
  assert.deepEqual(before, sourceSnapshot(f.root));
  assert.deepEqual(f.validate(), receipt);
  assert.equal(readFileSync(f.receiptPath, 'utf8').includes('process.env'), false);
});

test('check and build failures are recorded honestly; build still runs after failed check', async (t) => {
  for (const [check, build] of [
    ['process.exit(7)', 'process.exit(0)'],
    ['process.exit(0)', 'process.exit(9)'],
  ]) {
    const f = fixture(t, { check, build });
    const receipt = await f.run();
    assert.equal(receipt.outcome, 'failed');
    assert.deepEqual(
      receipt.commands.map((command) => command.exitCode),
      check.includes('(7)') ? [7, 0] : [0, 9],
    );
    assert.throws(f.validate, /did not pass/);
    const forged = structuredClone(receipt);
    forged.outcome = 'passed';
    writeFileSync(f.receiptPath, JSON.stringify(reseal(forged)));
    assert.throws(f.validate, /command .*outcome/);
  }
});

test('a timeout terminates the command and cannot be reported as success', async (t) => {
  const f = fixture(t, { check: 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)' });
  const started = Date.now();
  const receipt = await f.run({ timeoutMs: 800 });
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.commands[0].timedOut, true);
  assert.equal(receipt.commands[0].exitCode, null);
  assert.ok(Date.now() - started < 5000);
  assert.throws(f.validate, /did not pass/);
});

test('tracked contents, deletion, executable mode, untracked and ignored source invalidate receipts', async (t) => {
  const f = fixture(t);
  await f.run();
  const source = join(f.root, 'source.txt');
  const changes = [
    [() => writeFileSync(source, 'changed\n'), () => writeFileSync(source, 'original\n')],
    [() => rmSync(source), () => writeFileSync(source, 'original\n')],
    [() => chmodSync(source, 0o755), () => chmodSync(source, 0o644)],
    [
      () => writeFileSync(join(f.root, 'new.mjs'), '// source'),
      () => rmSync(join(f.root, 'new.mjs')),
    ],
    [
      () => writeFileSync(join(f.root, 'ignored.log'), 'still measured'),
      () => rmSync(join(f.root, 'ignored.log')),
    ],
  ];
  for (const [change, undo] of changes) {
    change();
    assert.throws(f.validate, /HEAD or source tree changed/);
    undo();
    assert.equal(f.validate().outcome, 'passed');
  }
});

test('a changed Git HEAD rejects even an identical working source tree', async (t) => {
  const f = fixture(t);
  await f.run();
  f.commit('new HEAD');
  assert.throws(f.validate, /HEAD or source tree changed/);
});

test('only explicit generated paths are excluded; tracked generated-path files stay measured', async (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'dist'));
  writeFileSync(join(f.root, 'dist', 'tracked.txt'), 'tracked');
  f.git('add', '-f', 'dist/tracked.txt');
  f.commit();
  await f.run();
  writeFileSync(join(f.root, 'dist', 'bundle.js'), 'generated');
  assert.equal(f.validate().outcome, 'passed');
  writeFileSync(join(f.root, 'dist', 'tracked.txt'), 'changed');
  assert.throws(f.validate, /HEAD or source tree changed/);
});

test('source changes during check/build yield a failed receipt even when both commands exit zero', async (t) => {
  const f = fixture(t, { check: 'require("node:fs").writeFileSync("source.txt", "changed")' });
  const receipt = await f.run();
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.sourceUnchanged, false);
  assert.equal(
    receipt.commands.every((command) => command.exitCode === 0),
    true,
  );
  assert.throws(f.validate, /HEAD or source tree changed/);
});

test('missing, malformed, tampered and semantically forged receipts are rejected', async (t) => {
  const f = fixture(t);
  assert.throws(f.validate);
  const receipt = await f.run();
  for (const invalid of ['{', 'null', '[]', '{}']) {
    writeFileSync(f.receiptPath, invalid);
    assert.throws(f.validate);
  }
  const mutations = [
    (r) => {
      r.schemaVersion = 2;
    },
    (r) => {
      delete r.before;
    },
    (r) => {
      r.extra = true;
    },
    (r) => {
      r.commands.pop();
    },
    (r) => {
      r.commands.reverse();
    },
    (r) => {
      r.commands[0].command = 'npm run lint';
    },
    (r) => {
      r.commands[0].args = ['run', 'lint'];
    },
    (r) => {
      r.commands[0].exitCode = 1;
    },
    (r) => {
      r.commands[0].timedOut = true;
    },
    (r) => {
      r.commands[0].signal = 'SIGTERM';
    },
    (r) => {
      r.commands[0].error = 'spawn-or-termination-error';
    },
    (r) => {
      r.commands[0].timeoutMs = 0;
    },
    (r) => {
      r.commands[0].timeoutMs = 180001;
    },
    (r) => {
      r.commands[0].durationMs = -1;
    },
    (r) => {
      delete r.commands[0].startedAt;
    },
    (r) => {
      r.commands[0].finishedAt = r.startedAt;
      r.commands[0].startedAt = r.finishedAt;
    },
    (r) => {
      r.finishedAt = '2100-01-01T00:00:00.000Z';
    },
    (r) => {
      r.before.sha256 = '0'.repeat(64);
    },
    (r) => {
      r.provenance.repositoryRoot = '/another/repository';
    },
    (r) => {
      r.provenance.runnerSha256 = '0'.repeat(64);
    },
    (r) => {
      r.provenance.generatedDirectories.push('src');
    },
    (r) => {
      delete r.provenance.nodeVersion;
    },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(receipt);
    mutate(forged);
    writeFileSync(f.receiptPath, JSON.stringify(reseal(forged)));
    assert.throws(f.validate, undefined, String(mutate));
  }
  const tampered = structuredClone(receipt);
  tampered.commands[0].durationMs += 1;
  writeFileSync(f.receiptPath, JSON.stringify(tampered));
  assert.throws(f.validate, /integrity digest/);
});

test('symlinks are rejected without following their targets', async (t) => {
  const f = fixture(t);
  await f.run();
  symlinkSync('source.txt', join(f.root, 'linked-source'));
  assert.throws(f.validate, /Unsupported source file type/);
  rmSync(join(f.root, 'linked-source'));
  rmSync(f.receiptPath);
  symlinkSync('../source.txt', f.receiptPath);
  assert.throws(f.validate, /regular local file/);
});

test('same-repository recursion and invalid timeout options fail before commands run', async (t) => {
  const f = fixture(t);
  const original = process.env.CARNIVAL_FACTORY_VERIFY_ROOT;
  process.env.CARNIVAL_FACTORY_VERIFY_ROOT = f.root;
  try {
    await assert.rejects(f.run(), /recursive/);
  } finally {
    if (original === undefined) delete process.env.CARNIVAL_FACTORY_VERIFY_ROOT;
    else process.env.CARNIVAL_FACTORY_VERIFY_ROOT = original;
  }
  for (const timeoutMs of [0, -1, NaN, 1.1, 180001]) {
    await assert.rejects(f.run({ timeoutMs }), /timeout/);
  }
});

test('tracked files cannot escape through symlink parents in generated directories', async (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'dist'));
  writeFileSync(join(f.root, 'dist', 'tracked.txt'), 'tracked');
  f.git('add', '-f', 'dist/tracked.txt');
  f.commit();
  await f.run();
  rmSync(join(f.root, 'dist'), { recursive: true });
  symlinkSync('node_modules', join(f.root, 'dist'));
  assert.throws(f.validate, /Unsupported source parent directory/);
});

test('a symlink artifact directory is refused before command execution', async (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'dist'));
  symlinkSync('dist', join(f.root, '.factory-artifacts'));
  await assert.rejects(f.run(), /Receipt directory must be a real directory/);
});
