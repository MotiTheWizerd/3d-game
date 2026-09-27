// Zero-dependency static file server (project root).
// Replaces `python3 -m http.server` — Python is broken inside the
// Semantix sandbox (AppImage PYTHONHOME), Node is not.
//
// Logs every request as one line, so "the game is broken" and "nothing is
// listening" can never be confused again: a page full of ERR_CONNECTION_REFUSED
// with NO lines here means the server isn't up; MISS lines mean the path is wrong.
//
//   npm start                 # :8000, logging
//   QUIET=1 npm start         # silence the log
//   PORT=0 npm start          # any free port (prints which one it got)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8000);
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** One line per hit. The leading tag is what you actually scan for. */
export function formatLogLine(status, method, pathname, ms) {
  const tag =
    status >= 500 ? 'FAIL' : status === 404 ? 'MISS' : status >= 400 ? 'WARN' : '  ok';
  return `${tag} ${status} ${(method || 'GET').padEnd(4)} ${pathname}  ${ms.toFixed(1)}ms`;
}

function logLine(status, method, pathname, ms) {
  if (!QUIET) console.log(formatLogLine(status, method, pathname, ms));
}

const server = createServer(async (req, res) => {
  const startedAt = performance.now();
  let pathname = req.url;
  let status = 500;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // Resolve and jail the path inside ROOT.
    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
      status = 403;
      res.writeHead(status).end('Forbidden');
      return;
    }

    let body;
    try {
      body = await readFile(filePath);
    } catch (err) {
      status = err.code === 'ENOENT' || err.code === 'EISDIR' ? 404 : 500;
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end(status === 404 ? 'Not found' : 'Server error');
      return;
    }

    status = 200;
    res.writeHead(status, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    // Malformed URL, aborted request, anything else — still report the attempt.
    if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  } finally {
    logLine(status, req.method, pathname, performance.now() - startedAt);
  }
});

// Only self-announce when run directly, so tests can import it silently.
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use - something is already serving this project.`);
      console.error(`If that's an older server, the game is probably still reachable at:`);
      console.error(`  http://localhost:${PORT}/public/three-game/`);
      console.error(`Or pick another port:  PORT=8001 npm start`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(PORT, () => {
    // PORT=0 means "any free port" — report the one we ACTUALLY got, which is
    // what a post-start verifier (run.sh) has to curl.
    const port = server.address().port;
    console.log(`Serving ${ROOT}`);
    console.log(`  Game:  http://localhost:${port}/public/three-game/`);
    console.log(`  Todo:  http://localhost:${port}/public/`);
    console.log(`  Land.: http://localhost:${port}/public/landing/`);
  });
}

export { server, ROOT };
