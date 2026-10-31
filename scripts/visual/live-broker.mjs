// The host side of a mediated live capture: a fetch broker on one Unix
// socket that serves the browser container the CURRENT bytes of the public
// Carnival Pages site, and nothing else. The origin and base path are fixed
// here. A request names only a path, and only a path in the build manifest
// (index.html and the assets of an isolated build of the exact merge) is
// fetched. Every response is hashed and compared with that manifest before a
// byte reaches the browser; a mismatch fails the whole capture. The broker
// writes its own receipts outside anything the browser can reach, so a
// browser report saying "matched" is never what decides.
//
// Limit: this plays the deployed static bytes through localhost mediation.
// It is not equivalent to the browser talking to the origin directly: CORS,
// service workers, cookies and auth flows are not exercised, and any flow
// that needs an external service stays owed.
import { createHash } from 'node:crypto';
import { closeSync, constants, fsyncSync, openSync, writeSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

export const LIVE_ORIGIN = 'https://guypod.github.io';
export const LIVE_BASE = '/carnival-evolution-20261028/';

/** Caps on one upstream response, one request, parallel requests and a whole capture. */
export const BROKER_LIMITS = {
  bytes: 8 * 1024 * 1024,
  requestMs: 15_000,
  concurrency: 4,
  totalMs: 300_000,
  entries: 512,
  manifestBytes: 64 * 1024,
  requests: 2000,
  failures: 50,
};

const KEY = /^[A-Za-z0-9._/-]{1,200}$/;

/** Whether a manifest key is canonical: the same allowlist requests must pass. */
export function canonicalKey(key) {
  if (typeof key !== 'string' || !KEY.test(key)) return false;
  return !key.split('/').some((seg) => seg === '' || seg === '.' || seg === '..');
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/**
 * The manifest key a request path names, or null. Only a plain path under the
 * base: no query, fragment, encoded byte, dot segment, empty segment or
 * backslash, and only a key the manifest lists. `/` is index.html.
 */
export function manifestKey(path, manifest) {
  if (typeof path !== 'string' || !path.startsWith(LIVE_BASE)) return null;
  const rest = path.slice(LIVE_BASE.length);
  if (/[?#%\\\0]/.test(rest) || rest.length > 200) return null;
  const key = rest === '' ? 'index.html' : rest;
  if (!canonicalKey(key)) return null;
  return Object.hasOwn(manifest, key) ? key : null;
}

/** Reads a fetch response body, refusing more than `cap` bytes. */
async function capped(res, cap) {
  const declared = Number(res.headers.get('content-length'));
  if (declared > cap) {
    await res.body?.cancel().catch(() => {});
    throw new Error('response too large');
  }
  const chunks = [];
  let n = 0;
  for await (const c of res.body ?? []) {
    n += c.length;
    if (n > cap) throw new Error('response too large');
    chunks.push(Buffer.from(c));
  }
  return Buffer.concat(chunks);
}

/** Checks a manifest before anything is fetched: canonical keys, sha256 values, caps. */
export function manifestProblems(manifest, limits = BROKER_LIMITS) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    return ['manifest must be an object'];
  const keys = Object.keys(manifest);
  if (!keys.includes('index.html')) return ['manifest must list index.html'];
  if (keys.length > limits.entries) return [`manifest has more than ${limits.entries} entries`];
  if (Buffer.byteLength(JSON.stringify(manifest)) > limits.manifestBytes)
    return ['manifest is too large'];
  const problems = [];
  for (const k of keys) if (!canonicalKey(k)) problems.push(`manifest key is not canonical`);
  for (const v of Object.values(manifest))
    if (typeof v !== 'string' || !/^[0-9a-f]{64}$/.test(v))
      problems.push('manifest digests must be sha256');
  return [...new Set(problems)];
}

/** Writes one receipt file the broker owns: new, regular, 0600, never followed. */
function writeReceipt(dir, name, value) {
  const fd = openSync(
    join(dir, name),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * A broker for one capture. `manifest` maps each key to the sha256 of the
 * isolated build of `mergeSha`; both come from the trusted wrapper, never the
 * candidate. `receiptDir` is a host directory the browser container never
 * mounts. `upstream(url, signal)` defaults to fetch with no credentials and
 * no redirects. Any mismatch, error or limit marks the capture failed.
 */
export function createBroker({
  manifest,
  mergeSha,
  receiptDir,
  upstream = (url, signal) =>
    fetch(url, { redirect: 'manual', credentials: 'omit', cache: 'no-store', signal }),
  limits = BROKER_LIMITS,
  now = () => new Date().toISOString(),
}) {
  if (!/^[0-9a-f]{40}$/.test(mergeSha ?? '')) throw new Error('merge sha must be a full sha');
  const bad = manifestProblems(manifest, limits);
  if (bad.length) throw new Error(bad.join('; '));
  manifest = Object.freeze({ ...manifest });
  const started = Date.now();
  const failures = [];
  let droppedFailures = 0;
  const requests = [];
  let requestCount = 0;
  let inFlight = 0;
  let closed = false;
  // One deadline for the whole capture: identity scans, every upstream fetch
  // and every request. When it fires, in-flight fetches are aborted.
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new DOMException('capture deadline', 'TimeoutError')),
    limits.totalMs,
  );
  timer.unref?.();

  const fail = (why) => {
    if (failures.length < limits.failures)
      failures.push({ at: now(), why: String(why).slice(0, 300) });
    else droppedFailures++;
  };
  const expired = () => deadline.signal.aborted || Date.now() - started > limits.totalMs;

  /** Fetches one manifest key from the fixed origin and checks it. */
  async function fetchKey(key) {
    if (!Object.hasOwn(manifest, key) || !canonicalKey(key)) throw new Error('not a manifest key');
    if (expired()) throw new Error(`${key}: capture deadline passed`);
    const url = `${LIVE_ORIGIN}${LIVE_BASE}${key === 'index.html' ? '' : key}`;
    const signal = AbortSignal.any([AbortSignal.timeout(limits.requestMs), deadline.signal]);
    const abandoned = new Promise((_, no) => {
      if (signal.aborted) no(signal.reason);
      signal.addEventListener('abort', () => no(signal.reason), { once: true });
    });
    abandoned.catch(() => {});
    let res;
    try {
      // An upstream that ignores its signal still cannot hold the capture.
      res = await Promise.race([upstream(url, signal), abandoned]);
    } catch (e) {
      throw new Error(`${key}: ${e?.name === 'TimeoutError' ? 'timed out' : 'unreachable'}`, {
        cause: e,
      });
    }
    if (res.status !== 200) {
      await res.body?.cancel?.().catch(() => {});
      throw new Error(`${key}: http ${res.status}`);
    }
    let body;
    try {
      body = await Promise.race([capped(res, limits.bytes), abandoned]);
    } catch (e) {
      await res.body?.cancel?.().catch(() => {});
      throw new Error(`${key}: ${e?.name === 'TimeoutError' ? 'timed out' : e.message}`, {
        cause: e,
      });
    }
    const got = sha256(body);
    if (got !== manifest[key]) throw new Error(`${key}: served bytes differ from the build`);
    return { body, got };
  }

  /** Checks every manifest entry and writes a receipt: the before or after identity. */
  async function identity(label) {
    const entries = {};
    const at = now();
    let matched = true;
    for (const key of Object.keys(manifest).sort()) {
      if (expired()) {
        matched = false;
        entries[key] = { error: 'capture deadline passed' };
        continue;
      }
      try {
        entries[key] = { sha256: (await fetchKey(key)).got };
      } catch (e) {
        matched = false;
        entries[key] = { error: e.message };
        fail(e.message);
      }
    }
    const receipt = {
      label,
      mergeSha,
      origin: LIVE_ORIGIN,
      base: LIVE_BASE,
      startedAt: at,
      finishedAt: now(),
      buildDigest: sha256(JSON.stringify(manifest)),
      matched,
      entries,
    };
    if (expired()) fail(`${label}: capture deadline passed`);
    writeReceipt(receiptDir, `${label}.json`, receipt);
    return receipt;
  }

  async function handle(req, res) {
    requestCount++;
    const record = {
      at: now(),
      method: String(req.method).slice(0, 16),
      path: String(req.url).slice(0, 256),
    };
    if (requestCount > limits.requests) {
      // Request spam stops intake: one failure, no more records, nothing served.
      if (requestCount === limits.requests + 1) fail('request limit reached');
      res.writeHead(503, { connection: 'close' });
      res.end();
      req.socket.destroy();
      return;
    }
    requests.push(record);
    const refuse = (code, why) => {
      record.refused = why;
      res.writeHead(code, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end(`${why}\n`);
    };
    if (failures.length) return refuse(503, 'capture already failed');
    if (expired()) return (fail('capture deadline passed'), refuse(503, 'capture deadline'));
    if (req.method !== 'GET') return refuse(405, 'only GET');
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0)
      return refuse(400, 'no request body');
    const key = manifestKey(req.url, manifest);
    if (!key) return refuse(404, 'not in the build manifest');
    if (inFlight >= limits.concurrency) return refuse(503, 'too many requests');
    inFlight++;
    try {
      const { body, got } = await fetchKey(key);
      record.key = key;
      record.sha256 = got;
      const type = key.endsWith('.js')
        ? 'text/javascript'
        : key.endsWith('.css')
          ? 'text/css'
          : key.endsWith('.html')
            ? 'text/html'
            : 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    } catch (e) {
      fail(e.message);
      refuse(502, 'upstream refused');
    } finally {
      inFlight--;
    }
  }

  const server = createServer({ requestTimeout: limits.requestMs }, (req, res) => {
    handle(req, res).catch((e) => {
      fail(String(e?.message ?? e));
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  return {
    server,
    identity,
    /** Listens on exactly one Unix socket path. */
    listen: (socketPath) =>
      new Promise((ok, no) => server.once('error', no).listen(socketPath, () => ok(socketPath))),
    /** Stops the server and writes the request receipt. Returns the verdict. */
    async close() {
      if (closed) throw new Error('broker already closed');
      closed = true;
      clearTimeout(timer);
      deadline.abort(new DOMException('capture closed', 'AbortError'));
      const stopped = new Promise((ok) => server.close(() => ok()));
      server.closeAllConnections?.();
      await stopped;
      const verdict = {
        mergeSha,
        failed: failures.length > 0,
        failures,
        droppedFailures,
        requestCount,
        requests,
      };
      writeReceipt(receiptDir, 'requests.json', verdict);
      return verdict;
    },
    get closed() {
      return closed;
    },
    get failed() {
      return failures.length > 0;
    },
  };
}
