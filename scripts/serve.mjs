import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { buildSite } from './build.mjs';
if (!process.argv.includes('--dist')) await buildSite();
const root = fileURLToPath(new URL('../dist/',import.meta.url));
const port = Number(process.env.PORT || 8766);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.wasm':'application/wasm','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.bin':'application/octet-stream'};
createServer(async(req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=resolve(root,`.${path==='/'?'/index.html':path}`);
    if(!target.startsWith(root.endsWith(sep)?root:root+sep)||!types[extname(target)]){res.writeHead(404);res.end('Not found');return;}
    const body=await readFile(target);
    res.writeHead(200,{'Content-Type':types[extname(target)],'Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"});
    res.end(req.method==='HEAD'?undefined:body);
  }catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`T100 MFG Web: http://127.0.0.1:${port}`));
