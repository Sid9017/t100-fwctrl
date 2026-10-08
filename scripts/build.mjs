import { cp, mkdir, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
// Explicit allowlist: never publish desktop dependencies, credentials or firmware.
for (const path of ['index.html', 'src']) {
  await cp(new URL(path, root), new URL(path, dist), { recursive: true });
}
console.log('Built mfg_web → dist (static files, no external dependencies)');
