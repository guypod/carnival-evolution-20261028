// Runs inside the network-none browser container. Listens on 127.0.0.1 and
// passes each GET to the host broker's Unix socket, which is the only thing
// mounted from the host (a socket-only directory). It adds nothing: no host,
// cookie, auth or proxy header reaches the broker, only the method and path.
//
//   node socket-adapter.mjs <socket path>   (prints the port)
import { createServer, request } from 'node:http';

const socketPath = process.argv[2];
const server = createServer((req, res) => {
  const up = request({ socketPath, method: req.method, path: req.url, headers: {} }, (r) => {
    res.writeHead(r.statusCode ?? 502, {
      'content-type': r.headers['content-type'] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    r.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  up.end();
  req.resume();
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
