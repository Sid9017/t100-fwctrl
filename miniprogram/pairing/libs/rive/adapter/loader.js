// Loads (and caches) the Rive WASM module for WeChat.
//
// The whole point of this file is the `instantiateWasm` hook: Emscripten would
// normally fetch the .wasm over the network, which is impossible in a Mini
// Program. We take over instantiation and call `WXWebAssembly.instantiate(path)`
// — WeChat's only WASM entry point, which reads a brotli `.wasm.br` from inside
// the code package (no bytes, no URL, no streaming).
//
// The module is a singleton: one WASM instance is shared across every canvas on
// screen. Per-canvas objects (renderer/artboard/state-machine) are created and
// destroyed by the runtime; the shared module is never torn down.

const { installPolyfills, registerRafSurface, unregisterRafSurface } = require('./polyfill.js');
const { installCanvasGlobals } = require('./canvas2d.js');

// Package-internal path to the brotli-compressed WASM. Override with setWasmPath()
// if you relocate the vendor directory or move it to a different subpackage.
const DEFAULT_WASM_PATH = '/pkgRive/libs/rive/vendor/rive.wasm.br';

let modulePromise = null;
let wasmPath = DEFAULT_WASM_PATH;

function setWasmPath(p) {
  if (!p || p === wasmPath) return;
  if (modulePromise) {
    console.warn('[rive] setWasmPath() ignored: the runtime is already initialised.');
    return;
  }
  wasmPath = p;
}

function getWXWebAssembly() {
  if (typeof WXWebAssembly !== 'undefined') return WXWebAssembly;
  if (typeof globalThis.WXWebAssembly !== 'undefined') return globalThis.WXWebAssembly;
  return globalThis.WebAssembly; // smoke-test / fallback shim
}

function loadRiveModule() {
  if (modulePromise) return modulePromise;
  installPolyfills();
  installCanvasGlobals();

  modulePromise = new Promise((resolve, reject) => {
    let RiveCanvas;
    try {
      RiveCanvas = require('../vendor/rive.glue.js');
    } catch (e) {
      reject(new Error('[rive] cannot require vendor/rive.glue.js — run `npm run build:runtime`. ' + e));
      return;
    }

    const path = wasmPath;
    const WA = getWXWebAssembly();

    RiveCanvas({
      // Not actually used (instantiateWasm overrides loading) but keeps the
      // glue's locateFile branch from constructing a bogus URL.
      locateFile: () => path,
      instantiateWasm(imports, receiveInstance) {
        // Must NOT throw synchronously: a sync throw makes Emscripten fall back
        // to its (non-existent) fetch path. Route every error to reject().
        Promise.resolve()
          .then(() => {
            if (!WA || typeof WA.instantiate !== 'function') {
              throw new Error('WXWebAssembly is unavailable in this runtime');
            }
            return WA.instantiate(path, imports);
          })
          .then((result) => receiveInstance(result.instance, result.module))
          .catch((err) => reject(new Error('[rive] WXWebAssembly.instantiate failed for ' + path + ': ' + err)));
        return {}; // signal async instantiation to Emscripten
      },
    }).then(resolve, reject);
  });

  return modulePromise;
}

module.exports = {
  loadRiveModule,
  setWasmPath,
  registerRafSurface,
  unregisterRafSurface,
  DEFAULT_WASM_PATH,
};
