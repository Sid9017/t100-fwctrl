// Canvas 2D surface for the Rive renderer.
//
// This project's vendored runtime is built from source with a WeChat-NATIVE
// renderer (tools/rive-build/renderer.weapp.js): it drives the real
// `<canvas type="2d">` context directly with bedrock primitives (beginPath /
// moveTo / lineTo / bezierCurveTo / fill(rule) / stroke() / clip(rule)), using
// NO `Path2D`, `DOMMatrix`, `document`, or WebGL. So there is nothing to shim
// here — `makeRenderer()` just takes the real canvas node.
//
// (The older outer adapter — a Path2D command-recorder + a context Proxy +
// DOMMatrix shim — is only needed for the *prebuilt* `@rive-app/canvas-advanced`
// glue, which uses browser canvas APIs. If you switch package.json's
// riveRuntime back to a prebuilt glue, restore that adapter from git history.)

// Kept as a no-op for call-site compatibility (loader.js calls it): the native
// renderer needs no global Path2D / DOMMatrix.
function installCanvasGlobals() {}

// Hand makeRenderer the real WeChat canvas node directly.
function createSurface(realCanvas) {
  const realCtx = realCanvas.getContext('2d');
  if (!realCtx) throw new Error('[rive] canvas.getContext("2d") returned null');
  return { surface: realCanvas, realCtx };
}

module.exports = { installCanvasGlobals, createSurface };
