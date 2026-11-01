// Whether the site at <url> serves the build in <dist>: index.html and every
// file under dist/assets must come back byte for byte. Vite names assets by
// content hash, so a clean build of the merge commit is its deterministic
// identity. Prints { matched, buildDigest, mismatches } and exits 1 on a miss.
//
//   node scripts/visual/live-identity.mjs <dist dir> <url>
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sha = (b) => createHash('sha256').update(b).digest('hex');

export async function liveIdentity(dist, url, get = (u) => fetch(u, { cache: 'no-store' })) {
  const files = ['index.html', ...readdirSync(join(dist, 'assets')).map((f) => `assets/${f}`)];
  const digests = {};
  const mismatches = [];
  for (const f of files.sort()) {
    const want = sha(readFileSync(join(dist, f)));
    digests[f] = want;
    let got;
    try {
      const res = await get(new URL(f === 'index.html' ? '' : f, url).href);
      got = res.ok ? sha(Buffer.from(await res.arrayBuffer())) : `http ${res.status}`;
    } catch (e) {
      got = String(e);
    }
    if (got !== want) mismatches.push(f);
  }
  return { matched: !mismatches.length, buildDigest: sha(JSON.stringify(digests)), mismatches };
}

if (process.argv[1]?.endsWith('live-identity.mjs')) {
  const r = await liveIdentity(process.argv[2], process.argv[3]);
  console.log(JSON.stringify(r));
  process.exit(r.matched ? 0 : 1);
}
