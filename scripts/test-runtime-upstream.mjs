// Run unchanged firmware C/Wasm contracts (the upstream DOM gesture harness
// targets controls intentionally absent from this app) against our built Wasm, in /tmp.
import {mkdtemp,readFile,writeFile,copyFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const source=resolve(process.argv[2] || '../bk-hw-temp/projects/t100/web_runtime');
const temp=await mkdtemp(join(tmpdir(),'t100-upstream-tests-'));
// Those three old software-fade timings are replaced by PWM/settle tests in
// tests/runtime-parity.test.js. Their firmware drawing contracts still run.
const files=['battery','boot-logo','espresso','pourover','notify-damage'];
try {
  const dir=join(temp,'web_runtime');await mkdir(dir);
  for(const name of files)await copyFile(join(source,`${name}.test.js`),join(dir,`${name}.test.js`));
  await copyFile(new URL('../assets/runtime/preview.wasm',import.meta.url),join(dir,'preview.wasm'));
  await copyFile(new URL('../assets/runtime/app.js',import.meta.url),join(dir,'app.js'));
  await mkdir(join(temp,'fw_assets/boot_wordmark'),{recursive:true});
  await writeFile(join(temp,'fw_assets/boot_wordmark/reference-hashes.json'),await readFile(join(source,'../fw_assets/boot_wordmark/reference-hashes.json')));
  const run=spawnSync(process.execPath,['--test','--test-skip-pattern=^(Boot preview uses|Battery overlays restore|Charging starts with)',...files.map(name=>join(dir,`${name}.test.js`))],{stdio:'inherit'});
  process.exitCode=run.status ?? 1;
} finally { await rm(temp,{recursive:true,force:true}); }
