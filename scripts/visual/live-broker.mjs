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
};

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
  if (key.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(key)) return null;
  return Object.hasOwn(manifest, key) ? key : null;
}

/** Reads a fetch response body, refusing more than `cap` bytes. */
async function capped(res, cap) {
  const declared = Number(res.headers.get('content-length'));
  if (declared > cap) throw new Error('response too large');
  const chunks = [];
  let n = 0;
  for await (const c of res.body ?? []) {
    n += c.length;
    if (n > cap) throw new Error('response too large');
    chunks.push(Buffer.from(c));
  }
  return Buffer.concat(chunks);
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
  if (!manifest?.['index.html']) throw new Error('manifest must list index.html');
  for (const v of Object.values(manifest))
    if (!/^[0-9a-f]{64}$/.test(v)) throw new Error('manifest digests must be sha256');
  const started = Date.now();
  const failures = [];
  const requests = [];
  let inFlight = 0;

  const fail = (why) => {
    failures.push({ at: now(), why });
  };
  const expired = () => Date.now() - started > limits.totalMs;

  /** Fetches one manifest key from the fixed origin and checks it. */
  async function fetchKey(key) {
    const url = `${LIVE_ORIGIN}${LIVE_BASE}${key === 'index.html' ? '' : key}`;
    const signal = AbortSignal.timeout(limits.requestMs);
    let res;
    try {
      res = await upstream(url, signal);
    } catch (e) {
      throw new Error(`${key}: ${e?.name === 'TimeoutError' ? 'timed out' : 'unreachable'}`, {
        cause: e,
      });
    }
    if (res.status !== 200) throw new Error(`${key}: http ${res.status}`);
    const body = await capped(res, limits.bytes);
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
    writeReceipt(receiptDir, `${label}.json`, receipt);
    return receipt;
  }

  async function handle(req, res) {
    const record = { at: now(), method: req.method, path: req.url };
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
      await new Promise((ok) => server.close(() => ok()));
      server.closeAllConnections?.();
      const verdict = { mergeSha, failed: failures.length > 0, failures, requests };
      writeReceipt(receiptDir, 'requests.json', verdict);
      return verdict;
    },
    get failed() {
      return failures.length > 0;
    },
  };
}
