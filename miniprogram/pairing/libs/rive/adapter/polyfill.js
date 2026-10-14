// Minimal globalThis shims required *before* the Rive Emscripten glue runs.
//
// Design rule: shim ONLY what the WASM/glue actually touches, and deliberately
// DO NOT define `window` / `document` / `navigator`. The glue guards those with
// `typeof` checks; leaving them undefined keeps it on the non-DOM code path and
// skips its fetch / XMLHttpRequest / <script> base-URL setup entirely.

let installed = false;

// Canvases that can drive a vsync-aligned rAF. The render loop uses the canvas
// node's own requestAnimationFrame directly, so these globals exist purely as a
// defensive fallback for any code that reaches for a *global* rAF.
const rafSurfaces = new Set();
function pickRafSurface() {
  for (const s of rafSurfaces) return s;
  return null;
}
function registerRafSurface(s) {
  if (s && typeof s.requestAnimationFrame === 'function') rafSurfaces.add(s);
}
function unregisterRafSurface(s) {
  rafSurfaces.delete(s);
}

function installPolyfills() {
  if (installed) return;
  installed = true;
  const g = globalThis;

  // 1) performance.now — `emscripten_get_now` is rewritten to Date.now() at build
  //    time, but Rive's optional FPS path and any future timing read `performance`.
  if (typeof g.performance === 'undefined' || typeof g.performance.now !== 'function') {
    g.performance = { now: () => Date.now() };
  }

  // 2) WebAssembly shim — the glue references `new WebAssembly.RuntimeError(...)`
  //    on its abort path. WeChat exposes WXWebAssembly instead, so map what we can
  //    and supply RuntimeError; an abort then surfaces a real error instead of a
  //    masking `ReferenceError: WebAssembly is not defined`.
  if (typeof g.WebAssembly === 'undefined') {
    const WX = typeof g.WXWebAssembly !== 'undefined' ? g.WXWebAssembly : null;
    function RiveWasmRuntimeError(message) {
      const e = new Error(message);
      e.name = 'WebAssembly.RuntimeError';
      return e;
    }
    g.WebAssembly = WX
      ? { instantiate: WX.instantiate, Memory: WX.Memory, Table: WX.Table, RuntimeError: RiveWasmRuntimeError }
      : { RuntimeError: RiveWasmRuntimeError };
  }

  // 3) global requestAnimationFrame / cancelAnimationFrame — defensive only.
  if (typeof g.requestAnimationFrame !== 'function') {
    g.requestAnimationFrame = (cb) => {
      const s = pickRafSurface();
      if (s) return s.requestAnimationFrame(cb);
      return setTimeout(() => cb(Date.now()), 16);
    };
    g.cancelAnimationFrame = (id) => {
      const s = pickRafSurface();
      if (s && typeof s.cancelAnimationFrame === 'function') return s.cancelAnimationFrame(id);
      return clearTimeout(id);
    };
  }

  // 4) navigator — the image-mesh WebGL helper reads navigator.userAgent
  //    (unguarded). An empty UA routes it to the generic branch where it probes
  //    for WebGL and disables itself when none is found (see document stub).
  if (typeof g.navigator === 'undefined') {
    g.navigator = { userAgent: '', platform: '', language: 'zh-CN', languages: ['zh-CN'] };
  }

  // 5) document — Rive's canvas2d build EAGERLY builds an offscreen WebGL helper
  //    for image meshes at load time via `document.createElement('canvas')`.
  //    That canvas's getContext() must exist (returning null is fine: the helper
  //    logs "Image mesh will not be drawn" and disables itself; all VECTOR
  //    rendering still works). Image-mesh .riv files are out of scope for v1.
  //
  //    Two environments:
  //      • Native Mini Program — no `document` at all → install a minimal stub.
  //      • Taro — provides a VIRTUAL `document` whose createElement returns Taro
  //        elements with NO getContext (this is what crashed the mesh helper with
  //        "G.getContext is not a function"). Wrap createElement so 'canvas'
  //        yields a no-op canvas and everything else still goes to Taro.
  const noop = () => {};
  const fakeCanvas = () => ({ getContext: () => null, style: {}, addEventListener: noop, removeEventListener: noop });
  if (typeof g.document === 'undefined') {
    g.document = {
      currentScript: null,
      createElement: fakeCanvas,
      createElementNS: fakeCanvas,
      addEventListener: noop,
      removeEventListener: noop,
      body: { appendChild: noop, removeChild: noop, remove: noop },
    };
  } else if (typeof g.document.createElement === 'function' && !g.document.__riveCanvasPatched) {
    const origCreate = g.document.createElement.bind(g.document);
    g.document.createElement = function (tag) {
      if (String(tag).toLowerCase() === 'canvas') return fakeCanvas();
      return origCreate(tag);
    };
    g.document.__riveCanvasPatched = true;
  }
}

module.exports = { installPolyfills, registerRafSurface, unregisterRafSurface };
