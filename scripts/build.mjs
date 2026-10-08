import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
export async function buildSite() {
  const dist = new URL('dist/', root);
  await rm(dist, { recursive: true, force: true });
  await mkdir(new URL('src/',dist), {recursive:true});
  await cp(new URL('assets/',root),new URL('assets/',dist),{recursive:true});
  await cp(new URL('src/styles.css',root),new URL('src/styles.css',dist));
  const html=await readFile(new URL('index.html',root),'utf8');
  await writeFile(new URL('index.html',dist),html);
  await build({absWorkingDir:fileURLToPath(root),entryPoints:['src/main.js'],bundle:true,format:'esm',
    platform:'browser',target:['chrome110'],outfile:'dist/src/main.js',inject:['scripts/buffer-shim.js'],
  });
  console.log('Built T100 web console → dist');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildSite();
