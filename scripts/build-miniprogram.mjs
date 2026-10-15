import {writeModeImages} from './miniprogram-modes.mjs';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile,cp,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {miniProgramWasm} from './miniprogram-wasm.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(new URL('../miniprogram/lib/',import.meta.url),{recursive:true});
try{await access(new URL('../miniprogram/lib/desktop-ble-config.js',import.meta.url));}catch{await writeFile(new URL('../miniprogram/lib/desktop-ble-config.js',import.meta.url),'module.exports=null;\n');}
await writeFile(new URL('../src/miniprogram/resources.js',import.meta.url), '// Generated from the existing web assets by build:miniprogram.\nexport const presetBase64='+JSON.stringify((await readFile(new URL('../assets/preset1.bin',import.meta.url))).toString('base64'))+';\nexport const foods='+ (await readFile(new URL('../assets/food/manifest.json',import.meta.url),'utf8')).trim()+';\n');
await build({absWorkingDir:root,entryPoints:['src/miniprogram/entry.js'],bundle:true,platform:'browser',format:'cjs',target:'es2020',
  outfile:'miniprogram/lib/t100.js',inject:['scripts/buffer-shim.js'],minify:true});
await writeFile(new URL('../miniprogram/lib/preview.wasm',import.meta.url),miniProgramWasm(await readFile(new URL('../assets/runtime/preview.wasm',import.meta.url))));
console.log('Built kcalack-t100 → miniprogram/lib/t100.js');

await cp(new URL('../assets/food/',import.meta.url),new URL('../miniprogram/assets/food/',import.meta.url),{recursive:true});

await writeModeImages(new URL('../',import.meta.url));

// The Rive engine lives in its own subpackage and is loaded by the paired device and meal landscape components.
await mkdir(new URL('../miniprogram/pairing/assets/',import.meta.url),{recursive:true});
const pairing=await readFile(new URL('../assets/pairing/kcalack-pairing.riv',import.meta.url));
await writeFile(new URL('../miniprogram/pairing/assets/animation.js',import.meta.url),
  '// Generated from assets/pairing/kcalack-pairing.riv.\nmodule.exports='+JSON.stringify(pairing.toString('base64'))+';\n');

const mealSky=await readFile(new URL('../assets/meal-sky/kcalack-meal-sky.riv',import.meta.url));
await writeFile(new URL('../miniprogram/pairing/assets/meal-sky.js',import.meta.url),
  '// Generated from assets/meal-sky/kcalack-meal-sky.riv.\nmodule.exports='+JSON.stringify(mealSky.toString('base64'))+';\n');

const scalebot=await readFile(new URL('../assets/scalebot/kcalack-scalebot-status.riv',import.meta.url));
await writeFile(new URL('../miniprogram/pairing/assets/scalebot.js',import.meta.url),
  '// Generated from assets/scalebot/kcalack-scalebot-status.riv.\nmodule.exports='+JSON.stringify(scalebot.toString('base64'))+';\n');
