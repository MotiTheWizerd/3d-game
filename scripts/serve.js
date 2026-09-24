// Zero-dependency static file server (project root).
// Replaces `python3 -m http.server` — Python is broken inside the
// Semantix sandbox (AppImage PYTHONHOME), Node is not.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = process.env.PORT || 8000;

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // Resolve and jail the path inside ROOT.
    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    const status = err.code === 'ENOENT' ? 404 : 500;
    res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(status === 404 ? 'Not found' : 'Server error');
  }
});


server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — something is already serving this project.`);
    console.error(`If that's an older server, the game is probably still reachable at:`);
    console.error(`  http://localhost:${PORT}/public/three-game/`);
    console.error(`Or pick another port:  PORT=8001 npm start`);
    process.exit(1);
  }
  throw err;
});
server.listen(PORT, () => {
  console.log(`Serving ${ROOT}`);
  console.log(`  Game:  http://localhost:${PORT}/public/three-game/`);
  console.log(`  Todo:  http://localhost:${PORT}/public/`);
  console.log(`  Land.: http://localhost:${PORT}/public/landing/`);
});