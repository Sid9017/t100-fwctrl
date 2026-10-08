// Usage: node scripts/build-runtime.mjs /path/to/t100/web_runtime
import { readFile, writeFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
if (!process.argv[2]) throw new Error('Pass the original T100 web_runtime directory');
const source = resolve(process.argv[2]);
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 't100-runtime-'));
try {
  if (process.env.WASM_LD) await symlink(process.env.WASM_LD, join(temp, 'wasm-ld'));
  const original = await readFile(join(source, 'build.sh'), 'utf8');
  const script = original.replace(/^here=.*$/m, 'here="$T100_RUNTIME_SOURCE"')
    .replace('-nostdlib', process.env.WASM_LD ? '-B"$T100_RUNTIME_TOOLS" -nostdlib' : '-nostdlib')
    .replace('-DKCAL_VIEW_NATIVE', '-I"$here" -DKCAL_VIEW_NATIVE')
    .replace('"$here/preview.c"', '"$T100_RUNTIME_BRIDGE"')
    .replaceAll('$here/preview.wasm', '$T100_RUNTIME_OUTPUT');
  const build = join(temp, 'build.sh'); await writeFile(build, script);
  const result = spawnSync('/bin/sh', [build], {stdio:'inherit', env:{...process.env,
    T100_RUNTIME_TOOLS:temp, T100_RUNTIME_SOURCE:source, T100_RUNTIME_BRIDGE:join(root,'scripts/runtime-status.c'),
    T100_RUNTIME_OUTPUT:join(root,'assets/runtime/preview.wasm')}});
  if (result.status !== 0) throw new Error('Wasm build failed');
} finally { await rm(temp, {recursive:true, force:true}); }
