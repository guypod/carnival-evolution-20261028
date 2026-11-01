// Serves a built site on 127.0.0.1 only, for the isolated flow runner. Trusted
// code: it never runs the candidate's Vite or Node, it only reads files under
// <root>. A request that resolves outside <root>, or reaches a symlink, is
// refused, so a candidate build cannot make the server hand out host files.
//
//   node scripts/visual/static-serve.mjs <root>   (prints the port)
import { createServer } from 'node:http';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

/** The file under root a URL path names, or null when it must not be served. */
export function resolveUnder(root, urlPath) {
  const real = realpathSync(root);
  let path;
  try {
    path = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (path.includes('\0') || path.split('/').includes('..')) return null;
  const file = join(real, path.endsWith('/') ? path + 'index.html' : path);
  if (file !== real && !file.startsWith(real + sep)) return null;
  // Every component from root down must be a plain directory or file.
  let at = real;
  for (const part of file.slice(real.length + 1).split(sep)) {
    at = join(at, part);
    let st;
    try {
      st = lstatSync(at);
    } catch {
      return null;
    }
    if (st.isSymbolicLink()) return null;
  }
  return lstatSync(file).isFile() ? file : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2];
  const server = createServer((req, res) => {
    const file = resolveUnder(root, req.url ?? '/');
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  server.listen(0, '127.0.0.1', () => console.log(server.address().port));
}
