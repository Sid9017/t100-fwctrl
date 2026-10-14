// RiveInstance — drives one .riv on one WeChat <canvas type="2d"> node.
//
// Lifecycle: load shared WASM module → makeRenderer(surface) → load(.riv bytes)
// → pick artboard + state-machine/animation → size for HiDPI → run loop.
//
// The render loop is a plain canvas.requestAnimationFrame loop (per-canvas vsync,
// multi-instance safe). Each frame: advance, clear, align, draw, then
// rive.resolveAnimationFrame() — the canvas-advanced renderer queues draw calls
// and only flushes them to the 2D context on resolveAnimationFrame().
//
// This module is intentionally free of `wx.*` so it can be exercised by the Node
// smoke test. WeChat-specific I/O (reading .riv, measuring layout) lives in
// index.js and the <rive-view> component.

const { loadRiveModule, registerRafSurface, unregisterRafSurface } = require('./adapter/loader.js');
const { createSurface } = require('./adapter/canvas2d.js');
const { resolveFit, resolveAlignment } = require('./layout.js');

// Frames a state machine may report "settled" before we park the loop to save
// battery. A pointer event un-parks it. Linear animations keep running.
const SETTLE_FRAMES = 4;
// Guard against huge dt after backgrounding / GC pauses.
const MAX_DT = 0.25;

class RiveInstance {
  constructor(opts) {
    if (!opts || !opts.canvas) throw new Error('[rive] RiveInstance requires { canvas }');
    if (!opts.buffer) throw new Error('[rive] RiveInstance requires { buffer }');

    this._opts = opts;
    this._canvas = opts.canvas;
    this._cssW = opts.width || 300;
    this._cssH = opts.height || 150;
    this._dpr = opts.devicePixelRatio || 1;

    this._onLoop = opts.onLoop || null;
    this._onStateChange = opts.onStateChange || null;
    this._onRiveEvent = opts.onRiveEvent || null;

    this._rive = null;
    this._surface = null;
    this._renderer = null;
    this._file = null;
    this._artboard = null;
    this._sm = null;
    this._anim = null;
    this._animName = null;
    this._inputs = {};

    this._bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    this._frameAABB = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    this._fit = null;
    this._alignment = null;

    this._forward = null;   // artboard -> device matrix (for pointer mapping)
    this._inverted = null;  // device -> artboard matrix
    this._hasInverse = false;
    this._viewDirty = true;

    this._playing = false;
    this._running = false;
    this._rafId = null;
    this._last = 0;
    this._settledFrames = 0;

    this._loop = this._loopImpl.bind(this);
    this.ready = this._init();
  }

  // ---- init --------------------------------------------------------------

  async _init() {
    let phase = 'load-runtime';
    try {
      const rive = await loadRiveModule();
      this._rive = rive;
      registerRafSurface(this._canvas);

      phase = 'create-renderer';
      this._applySize(this._cssW, this._cssH, this._dpr);
      const { surface } = createSurface(this._canvas);
      this._surface = surface;
      this._renderer = rive.makeRenderer(surface);

      phase = 'load-file';
      const buf = this._opts.buffer;
      const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      // enableRiveAssetCDN = false: never reach for the network (impossible in MP).
      this._file = await rive.load(bytes, undefined, false);

      phase = 'setup-artboard';
      const abName = this._opts.artboard;
      this._artboard = abName ? this._file.artboardByName(abName) : this._file.defaultArtboard();
      if (!this._artboard) throw new Error('artboard not found: ' + (abName || '(default)'));

      const b = this._artboard.bounds;
      this._bounds = { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };

      this._fit = resolveFit(rive, this._opts.fit);
      this._alignment = resolveAlignment(rive, this._opts.alignment);
      this._viewDirty = true;

      phase = 'first-frame';
      this._setupPlayback();

      // Settle initial geometry once (dt = 0) so the very first frame has shapes
      // to draw — without this the artboard renders empty until the second frame.
      this._advance(0);

      this._playing = this._opts.autoplay !== false;
      if (this._playing) this._start();
      else this._drawOnce();

      if (this._opts.onLoad) this._opts.onLoad(this.info());
      return this;
    } catch (e) {
      const err = new Error('[rive:' + phase + '] ' + ((e && e.message) || e));
      if (this._opts.onError) this._opts.onError(err);
      throw err;
    }
  }

  _setupPlayback() {
    const rive = this._rive;
    const ab = this._artboard;
    const smName = this._opts.stateMachine;
    const animName = this._opts.animation;

    if (smName != null) {
      let sm = ab.stateMachineByName(smName);
      if (!sm && ab.stateMachineCount() > 0) {
        console.warn('[rive] state machine not found:', smName, '— using index 0');
        sm = ab.stateMachineByIndex(0);
      }
      if (sm) this._sm = new rive.StateMachineInstance(sm, ab);
    } else if (animName != null) {
      let a = ab.animationByName(animName);
      if (!a && ab.animationCount() > 0) {
        console.warn('[rive] animation not found:', animName, '— using index 0');
        a = ab.animationByIndex(0);
      }
      if (a) { this._anim = new rive.LinearAnimationInstance(a, ab); this._animName = animName; }
    } else if (ab.stateMachineCount() > 0) {
      this._sm = new rive.StateMachineInstance(ab.stateMachineByIndex(0), ab);
    } else if (ab.animationCount() > 0) {
      this._anim = new rive.LinearAnimationInstance(ab.animationByIndex(0), ab);
    }

    this._buildInputs();
  }

  _buildInputs() {
    this._inputs = {};
    this._pressInputs = [];
    this._hoverInputs = [];
    if (!this._sm || !this._rive) return;
    const SMI = this._rive.SMIInput;
    const n = this._sm.inputCount();
    for (let i = 0; i < n; i++) {
      const inp = this._sm.input(i);
      // The base SMIInput has no fire()/value — cast to the typed accessor
      // (asTrigger/asBool/asNumber) to actually drive the input.
      let typed = inp;
      let kind = 'unknown';
      try {
        if (inp.type === SMI.bool) { kind = 'bool'; typed = typeof inp.asBool === 'function' ? inp.asBool() : inp; }
        else if (inp.type === SMI.number) { kind = 'number'; typed = typeof inp.asNumber === 'function' ? inp.asNumber() : inp; }
        else if (inp.type === SMI.trigger) { kind = 'trigger'; typed = typeof inp.asTrigger === 'function' ? inp.asTrigger() : inp; }
      } catch (e) {}
      this._inputs[inp.name] = { base: inp, typed, kind, name: inp.name };
      // Rive convention: boolean Hover/Press inputs are driven by pointer state.
      if (kind === 'bool') {
        const ln = String(inp.name).toLowerCase();
        if (ln === 'press' || ln === 'pressed') this._pressInputs.push(typed);
        else if (ln === 'hover' || ln === 'over') this._hoverInputs.push(typed);
      }
    }
  }

  _setPointerBools(hover, press) {
    try {
      if (hover !== null && this._hoverInputs) this._hoverInputs.forEach((t) => { t.value = hover; });
      if (press !== null && this._pressInputs) this._pressInputs.forEach((t) => { t.value = press; });
    } catch (e) {}
  }

  // ---- sizing ------------------------------------------------------------

  _applySize(cssW, cssH, dpr) {
    this._cssW = cssW;
    this._cssH = cssH;
    this._dpr = dpr;
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    this._canvas.width = bw;
    this._canvas.height = bh;
    this._frameAABB.maxX = bw;
    this._frameAABB.maxY = bh;
    this._viewDirty = true;
  }

  /** Re-measure and resize the drawing surface. cssW/cssH in layout px. */
  resize(cssW, cssH, dpr) {
    this._applySize(cssW, cssH, dpr != null ? dpr : this._dpr);
    if (this._running) return; // next frame will redraw
    this._drawOnce();
  }

  // ---- loop --------------------------------------------------------------

  _loopImpl() {
    if (!this._running) return;
    this._renderFrame();
    // Keep rendering continuously while playing so a fired trigger / changed
    // input is always picked up on the next frame. (Settle-parking was removed
    // because restarting canvas.requestAnimationFrame after idle was unreliable
    // on-device; re-add as an optimization later if needed.)
    this._rafId = this._canvas.requestAnimationFrame(this._loop);
  }

  _advance(dt) {
    if (this._sm) {
      const more = this._sm.advanceAndApply(dt);
      this._settledFrames = more ? 0 : this._settledFrames + 1;
      this._drainStateChanges();
      this._drainEvents();
    } else if (this._anim) {
      this._anim.advance(dt);
      this._anim.apply(1.0);
      this._artboard.advance(dt);
      if (this._anim.didLoop && this._onLoop) this._onLoop({ animation: this._animName });
    } else {
      this._artboard.advance(dt);
    }
  }

  _renderFrame() {
    const rive = this._rive;
    const now = Date.now();
    let dt = this._last ? (now - this._last) / 1000 : 0;
    this._last = now;
    if (dt > MAX_DT) dt = 0;

    if (this._playing && dt > 0) this._advance(dt);

    const r = this._renderer;
    r.clear();
    r.save();
    r.align(this._fit, this._alignment, this._frameAABB, this._bounds);
    this._artboard.draw(r);
    r.restore();
    rive.resolveAnimationFrame();
  }

  _drawOnce() {
    if (!this._rive || !this._renderer) return;
    const playing = this._playing;
    this._playing = false; // draw current state without advancing
    this._renderFrame();
    this._playing = playing;
  }

  _start() {
    if (this._running) return;
    this._running = true;
    this._settledFrames = 0;
    this._last = 0;
    this._rafId = this._canvas.requestAnimationFrame(this._loop);
  }

  _stop() {
    this._running = false;
    if (this._rafId != null && typeof this._canvas.cancelAnimationFrame === 'function') {
      this._canvas.cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
  }

  _ensureRunning() {
    this._settledFrames = 0;
    if (this._playing && !this._running) this._start();
  }

  // ---- public playback ---------------------------------------------------

  play() { this._playing = true; this._ensureRunning(); }

  pause() { this._playing = false; this._stop(); }

  /** Stop and reset to the first frame (linear animations only). */
  stop() {
    this._playing = false;
    this._stop();
    if (this._anim) { this._anim.time = 0; this._anim.apply(1.0); this._artboard.advance(0); }
    this._drawOnce();
  }

  get isPlaying() { return this._running && this._playing; }

  // ---- state machine inputs ---------------------------------------------

  setBool(name, value) {
    const r = this._inputs[name];
    if (r) { try { r.typed.value = !!value; } catch (e) {} this._ensureRunning(); }
  }
  setNumber(name, value) {
    const r = this._inputs[name];
    if (r) { try { r.typed.value = Number(value); } catch (e) {} this._ensureRunning(); }
  }
  fireTrigger(name) {
    const r = this._inputs[name];
    if (r && r.typed && typeof r.typed.fire === 'function') { r.typed.fire(); this._ensureRunning(); }
  }

  getInputs() {
    return Object.keys(this._inputs).map((name) => ({ name, type: this._inputs[name].kind }));
  }

  // ---- pointer (touch) ---------------------------------------------------

  _updateViewMatrix() {
    if (!this._viewDirty && this._forward) return;
    const rive = this._rive;
    if (this._forward) { try { this._forward.delete(); } catch (e) {} }
    if (this._inverted) { try { this._inverted.delete(); } catch (e) {} }
    this._forward = rive.computeAlignment(this._fit, this._alignment, this._frameAABB, this._bounds);
    this._inverted = new rive.Mat2D();
    this._hasInverse = this._forward.invert(this._inverted);
    this._viewDirty = false;
  }

  /** Map a point in CSS/layout px (relative to the canvas) into artboard space. */
  mapPoint(cssX, cssY) {
    this._updateViewMatrix();
    const rive = this._rive;
    const m = this._hasInverse ? this._inverted : this._forward;
    const v = new rive.Vec2D(cssX * this._dpr, cssY * this._dpr);
    const out = rive.mapXY(m, v);
    const p = { x: out.x(), y: out.y() };
    try { v.delete(); } catch (e) {}
    try { out.delete(); } catch (e) {}
    return p;
  }

  pointerDown(cssX, cssY, id) {
    if (!this._sm) return;
    const p = this.mapPoint(cssX, cssY);
    this._sm.pointerDown(p.x, p.y, id || 0);
    this._setPointerBools(true, true); // touch = hover + press
    this._ensureRunning();
  }
  pointerMove(cssX, cssY, id) {
    if (!this._sm) return;
    const p = this.mapPoint(cssX, cssY);
    this._sm.pointerMove(p.x, p.y, id || 0);
    this._ensureRunning();
  }
  pointerUp(cssX, cssY, id) {
    if (!this._sm) return;
    const p = this.mapPoint(cssX, cssY);
    this._sm.pointerUp(p.x, p.y, id || 0);
    this._setPointerBools(false, false);
    this._ensureRunning();
  }

  // ---- callbacks ---------------------------------------------------------

  _drainStateChanges() {
    if (!this._onStateChange || !this._sm) return;
    const n = this._sm.stateChangedCount();
    if (!n) return;
    const states = [];
    for (let i = 0; i < n; i++) states.push(this._sm.stateChangedNameByIndex(i));
    this._onStateChange(states);
  }

  _drainEvents() {
    if (!this._onRiveEvent || !this._sm) return;
    const n = this._sm.reportedEventCount();
    for (let i = 0; i < n; i++) {
      const evt = this._sm.reportedEventAt(i);
      if (evt) this._onRiveEvent(evt);
    }
  }

  // ---- introspection -----------------------------------------------------

  info() {
    let hasListeners = false;
    try {
      hasListeners = !!(this._sm && this._rive && this._rive.hasListeners && this._rive.hasListeners(this._sm));
    } catch (e) {}
    return {
      artboard: this._artboard ? this._artboard.name : null,
      stateMachine: this._sm ? this._sm.name : null,
      animation: this._anim ? this._anim.name : null,
      inputs: this.getInputs(),
      hasListeners,
      hasPointerBools: !!((this._pressInputs && this._pressInputs.length) || (this._hoverInputs && this._hoverInputs.length)),
      width: this._cssW,
      height: this._cssH,
    };
  }

  // ---- teardown ----------------------------------------------------------

  cleanup() {
    this._stop();
    unregisterRafSurface(this._canvas);
    const del = (o) => { try { if (o && typeof o.delete === 'function') o.delete(); } catch (e) {} };
    del(this._sm);
    del(this._anim);
    del(this._artboard);
    del(this._file);
    del(this._renderer);
    del(this._forward);
    del(this._inverted);
    this._sm = this._anim = this._artboard = this._file = this._renderer = null;
    this._forward = this._inverted = null;
    this._inputs = {};
  }
}

module.exports = { RiveInstance };
