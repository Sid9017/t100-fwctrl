import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
const root = fileURLToPath(new URL(process.argv.includes('--dist') ? '../dist/' : '../', import.meta.url));
const port = Number(process.env.PORT || 8766);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405); res.end(); return;
    }
    const path = pathname === '/' ? '/index.html' : pathname;
    const target = resolve(root, `.${path}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep) ||
        !(path === '/index.html' || /^\/src\/[\w/.-]+\.(js|css)$/.test(path))) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[extname(target)], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`T100 MFG Web: http://127.0.0.1:${port}`));
