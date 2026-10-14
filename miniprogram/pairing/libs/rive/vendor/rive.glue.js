/*
 * AUTO-GENERATED — DO NOT EDIT.
 * Source: rive-wasm (source build, WeChat-native renderer)@weapp-lite (canvas_advanced.mjs)
 * Adapted for WeChat Mini Program by tools/build-runtime.mjs.
 * Patches applied: esm-export -> commonjs; emscripten_get_now: performance.now -> Date.now; image-mesh: neutralize document.createElement("canvas").
 * Regenerate with: npm run build:runtime
 */

var Rive = (() => {
  var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;

  return (
function(moduleArg = {}) {
  var moduleRtn;

var k = moduleArg,
  aa,
  ba,
  ca = new Promise((a, b) => {
    aa = a;
    ba = b;
  }),
  da = "object" == typeof window,
  ea = "function" == typeof importScripts;
function ha() {
  function a(l) {
    const g = d;
    c = b = 0;
    d = new Map();
    g.forEach(p => {
      try {
        p(l);
      } catch (m) {
        console.error(m);
      }
    });
    this.la();
    e && e.za();
  }
  let b = 0,
    c = 0,
    d = new Map(),
    e = null,
    f = null;
  this.requestAnimationFrame = function (l) {
    b || (b = requestAnimationFrame(a.bind(this)));
    const g = ++c;
    d.set(g, l);
    return g;
  };
  this.cancelAnimationFrame = function (l) {
    d.delete(l);
    b && 0 == d.size && (cancelAnimationFrame(b), b = 0);
  };
  this.xa = function (l) {
    f && (document.body.remove(f), f = null);
    l || (f = document.createElement("div"), f.style.backgroundColor = "black", f.style.position = "fixed", f.style.right = 0, f.style.top = 0, f.style.color = "white", f.style.padding = "4px", f.innerHTML = "RIVE FPS", l = function (g) {
      f.innerHTML = "RIVE FPS " + g.toFixed(1);
    }, document.body.appendChild(f));
    e = new function () {
      let g = 0,
        p = 0;
      this.za = function () {
        var m = performance.now();
        p ? (++g, m -= p, 1000 < m && (l(1000 * g / m), g = p = 0)) : (p = m, g = 0);
      };
    }();
  };
  this.va = function () {
    f && (document.body.remove(f), f = null);
    e = null;
  };
  this.la = function () {};
}
const ia = k.onRuntimeInitialized;
k.onRuntimeInitialized = function () {
  ia && ia();
  let a = k.decodeAudio;
  k.decodeAudio = function (f, l) {
    f = a(f);
    l(f);
  };
  let b = k.decodeFont;
  k.decodeFont = function (f, l) {
    f = b(f);
    l(f);
  };
  let c = k.setFallbackFontCb;
  k.setFallbackFontCallback = "function" === typeof c ? function (f) {
    c(f);
  } : function () {
    console.warn("Module.setFallbackFontCallback called, but text support is not enabled in this build.");
  };
  const d = k.FileAssetLoader;
  k.ptrToAsset = f => {
    let l = k.ptrToFileAsset(f);
    return l.isImage ? k.ptrToImageAsset(f) : l.isFont ? k.ptrToFontAsset(f) : l.isAudio ? k.ptrToAudioAsset(f) : l;
  };
  k.CustomFileAssetLoader = d.extend("CustomFileAssetLoader", {
    __construct: function (_ref) {
      let {
        loadContents: f
      } = _ref;
      this.__parent.__construct.call(this);
      this.ra = f;
    },
    loadContents: function (f, l) {
      f = k.ptrToAsset(f);
      return this.ra(f, l);
    }
  });
  k.CDNFileAssetLoader = d.extend("CDNFileAssetLoader", {
    __construct: function () {
      this.__parent.__construct.call(this);
    },
    loadContents: function (f) {
      let l = k.ptrToAsset(f);
      f = l.cdnUuid;
      if ("" === f) {
        return !1;
      }
      (function (g, p) {
        var m = new XMLHttpRequest();
        m.responseType = "arraybuffer";
        m.onreadystatechange = function () {
          4 == m.readyState && 200 == m.status && p(m);
        };
        m.open("GET", g, !0);
        m.send(null);
      })(l.cdnBaseUrl + "/" + f, g => {
        l.decode(new Uint8Array(g.response));
      });
      return !0;
    }
  });
  k.FallbackFileAssetLoader = d.extend("FallbackFileAssetLoader", {
    __construct: function () {
      this.__parent.__construct.call(this);
      this.ka = [];
    },
    addLoader: function (f) {
      this.ka.push(f);
    },
    loadContents: function (f, l) {
      for (let g of this.ka) {
        if (g.loadContents(f, l)) {
          return !0;
        }
      }
      return !1;
    }
  });
  let e = k.computeAlignment;
  k.computeAlignment = function (f, l, g, p) {
    let m = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 1.0;
    return e.call(this, f, l, g, p, m);
  };
};
function ja(a, b) {
  for (var c = 0; c < b.length; c++) {
    var d = b[c];
    switch (d[0]) {
      case 0:
        a.moveTo(d[1], d[2]);
        break;
      case 1:
        a.lineTo(d[1], d[2]);
        break;
      case 2:
        a.bezierCurveTo(d[1], d[2], d[3], d[4], d[5], d[6]);
        break;
      case 3:
        a.closePath();
        break;
      case 4:
        var e = d[1];
        d = d[2];
        a.save();
        a.transform(d.a, d.b, d.c, d.d, d.e, d.f);
        ja(a, e.G);
        a.restore();
    }
  }
}
function ka(a, b) {
  a.beginPath();
  ja(a, b.G);
}
var la = k.onRuntimeInitialized;
k.onRuntimeInitialized = function () {
  function a(n) {
    switch (n) {
      case m.srcOver:
        return "source-over";
      case m.screen:
        return "screen";
      case m.overlay:
        return "overlay";
      case m.darken:
        return "darken";
      case m.lighten:
        return "lighten";
      case m.colorDodge:
        return "color-dodge";
      case m.colorBurn:
        return "color-burn";
      case m.hardLight:
        return "hard-light";
      case m.softLight:
        return "soft-light";
      case m.difference:
        return "difference";
      case m.exclusion:
        return "exclusion";
      case m.multiply:
        return "multiply";
      case m.hue:
        return "hue";
      case m.saturation:
        return "saturation";
      case m.color:
        return "color";
      case m.luminosity:
        return "luminosity";
    }
  }
  function b(n) {
    return "rgba(" + ((16711680 & n) >>> 16) + "," + ((65280 & n) >>> 8) + "," + ((255 & n) >>> 0) + "," + ((4278190080 & n) >>> 24) / 255 + ")";
  }
  function c() {
    for (const n of B) {
      for (const r of n.F) {
        r();
      }
      n.F = [];
    }
    B.clear();
  }
  la && la();
  var d = k.RenderPaintStyle;
  const e = k.RenderPath,
    f = k.RenderPaint,
    l = k.Renderer,
    g = k.StrokeCap,
    p = k.StrokeJoin,
    m = k.BlendMode,
    q = d.fill,
    u = d.stroke,
    x = k.FillRule.evenOdd;
  var h = k.RenderImage.extend("CanvasRenderImage", {
      __construct: function () {
        let {
          P: n,
          V: r
        } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        this.__parent.__construct.call(this);
        this.P = n;
        this.V = r;
      },
      __destruct: function () {
        this.__parent.__destruct.call(this);
      },
      decode: function () {
        var n = this;
        n.V && n.V(n);
        setTimeout(function () {
          n.P && n.P(n);
        }, 0);
      }
    }),
    t = e.extend("CanvasRenderPath", {
      __construct: function () {
        this.__parent.__construct.call(this);
        this.G = [];
      },
      rewind: function () {
        this.G = [];
      },
      addPath: function (n, r, A, y, K, C, z) {
        this.G.push([4, n, {
          a: r,
          b: A,
          c: y,
          d: K,
          e: C,
          f: z
        }]);
      },
      fillRule: function (n) {
        this.ea = n;
      },
      moveTo: function (n, r) {
        this.G.push([0, n, r]);
      },
      lineTo: function (n, r) {
        this.G.push([1, n, r]);
      },
      cubicTo: function (n, r, A, y, K, C) {
        this.G.push([2, n, r, A, y, K, C]);
      },
      close: function () {
        this.G.push([3]);
      }
    }),
    v = f.extend("CanvasRenderPaint", {
      color: function (n) {
        this.fa = b(n);
      },
      thickness: function (n) {
        this.ta = n;
      },
      join: function (n) {
        switch (n) {
          case p.miter:
            this.Z = "miter";
            break;
          case p.round:
            this.Z = "round";
            break;
          case p.bevel:
            this.Z = "bevel";
        }
      },
      cap: function (n) {
        switch (n) {
          case g.butt:
            this.Y = "butt";
            break;
          case g.round:
            this.Y = "round";
            break;
          case g.square:
            this.Y = "square";
        }
      },
      style: function (n) {
        this.sa = n;
      },
      blendMode: function (n) {
        this.qa = a(n);
      },
      clearGradient: function () {
        this.O = null;
      },
      linearGradient: function (n, r, A, y) {
        this.O = {
          oa: n,
          pa: r,
          ha: A,
          ia: y,
          ba: []
        };
      },
      radialGradient: function (n, r, A, y) {
        this.O = {
          oa: n,
          pa: r,
          ha: A,
          ia: y,
          ba: [],
          Ga: !0
        };
      },
      addStop: function (n, r) {
        this.O.ba.push({
          color: n,
          stop: r
        });
      },
      completeGradient: function () {},
      draw: function (n, r, A, y) {
        let K = this.sa;
        var C = this.fa,
          z = this.O;
        const G = n.globalCompositeOperation,
          Xb = n.globalAlpha;
        n.globalCompositeOperation = this.qa;
        n.globalAlpha = y;
        if (null != z) {
          C = z.oa;
          const ra = z.pa,
            hb = z.ha;
          var sa = z.ia;
          y = z.ba;
          z.Ga ? (z = hb - C, sa -= ra, C = n.createRadialGradient(C, ra, 0, C, ra, Math.sqrt(z * z + sa * sa))) : C = n.createLinearGradient(C, ra, hb, sa);
          for (let ta = 0, Yb = y.length; ta < Yb; ta++) {
            C.addColorStop(y[ta].stop, b(y[ta].color));
          }
          this.fa = C;
          this.O = null;
        }
        switch (K) {
          case u:
            n.strokeStyle = C;
            n.lineWidth = this.ta;
            n.lineCap = this.Y;
            n.lineJoin = this.Z;
            ka(n, r);
            n.stroke();
            break;
          case q:
            n.fillStyle = C, ka(n, r), n.fill(A);
        }
        n.globalCompositeOperation = G;
        n.globalAlpha = Xb;
      }
    });
  const B = new Set();
  var L = k.CanvasRenderer = l.extend("Renderer", {
    __construct: function (n) {
      this.__parent.__construct.call(this);
      this.H = [1, 0, 0, 1, 0, 0];
      this.A = [1.0];
      this.v = n.getContext("2d");
      this.da = n;
      this.F = [];
    },
    save: function () {
      this.H.push(...this.H.slice(this.H.length - 6));
      this.A.push(this.A[this.A.length - 1]);
      this.F.push(this.v.save.bind(this.v));
    },
    restore: function () {
      const n = this.H.length - 6;
      if (6 > n) {
        throw "restore() called without matching save().";
      }
      this.H.splice(n);
      this.A.pop();
      this.F.push(this.v.restore.bind(this.v));
    },
    transform: function (n, r, A, y, K, C) {
      const z = this.H,
        G = z.length - 6;
      z.splice(G, 6, z[G] * n + z[G + 2] * r, z[G + 1] * n + z[G + 3] * r, z[G] * A + z[G + 2] * y, z[G + 1] * A + z[G + 3] * y, z[G] * K + z[G + 2] * C + z[G + 4], z[G + 1] * K + z[G + 3] * C + z[G + 5]);
      this.F.push(this.v.transform.bind(this.v, n, r, A, y, K, C));
    },
    rotate: function (n) {
      const r = Math.sin(n);
      n = Math.cos(n);
      this.transform(n, r, -r, n, 0, 0);
    },
    modulateOpacity: function (n) {
      this.A[this.A.length - 1] *= n;
    },
    _drawPath: function (n, r) {
      this.F.push(r.draw.bind(r, this.v, n, n.ea === x ? "evenodd" : "nonzero", Math.max(0, this.A[this.A.length - 1])));
    },
    _drawRiveImage: function () {},
    _getMatrix: function (n) {
      const r = this.H,
        A = r.length - 6;
      for (let y = 0; 6 > y; ++y) {
        n[y] = r[A + y];
      }
    },
    _drawImageMesh: function () {},
    _clipPath: function (n) {
      const r = n.ea === x ? "evenodd" : "nonzero",
        A = this.v;
      this.F.push(function () {
        ka(A, n);
        A.clip(r);
      });
    },
    clear: function () {
      B.add(this);
      this.F.push(this.v.clearRect.bind(this.v, 0, 0, this.da.width, this.da.height));
    },
    flush: function () {},
    translate: function (n, r) {
      this.transform(1, 0, 0, 1, n, r);
    }
  });
  k.makeRenderer = function (n) {
    n = new L(n);
    return new Proxy(n, {
      get(r, A) {
        return "function" === typeof r[A] ? function () {
          for (var _len = arguments.length, y = new Array(_len), _key = 0; _key < _len; _key++) {
            y[_key] = arguments[_key];
          }
          return r[A].apply(r, y);
        } : r[A];
      },
      set(r, A, y) {
        r[A] = y;
        return !0;
      }
    });
  };
  k.decodeImage = function (n, r) {
    new h({
      P: r
    }).decode(n);
  };
  k.renderFactory = {
    makeRenderPaint: function () {
      return new v();
    },
    makeRenderPath: function () {
      return new t();
    },
    makeRenderImage: function () {
      let n = O;
      return new h({
        V: () => {
          n.total++;
        },
        P: () => {
          n.loaded++;
          if (n.loaded === n.total) {
            const r = n.ready;
            r && (r(), n.ready = null);
          }
        }
      });
    }
  };
  let H = k.load,
    O = null;
  k.load = function (n, r) {
    let A = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : !0;
    const y = new k.FallbackFileAssetLoader();
    void 0 !== r && y.addLoader(r);
    A && (r = new k.CDNFileAssetLoader(), y.addLoader(r));
    return new Promise(function (K) {
      let C = null;
      O = {
        total: 0,
        loaded: 0,
        ready: function () {
          K(C);
        }
      };
      C = H(n, y);
      0 == O.total && K(C);
    });
  };
  let fa = k.RendererWrapper.prototype.align;
  k.RendererWrapper.prototype.align = function (n, r, A, y) {
    let K = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 1.0;
    fa.call(this, n, r, A, y, K);
  };
  d = new ha();
  k.requestAnimationFrame = d.requestAnimationFrame.bind(d);
  k.cancelAnimationFrame = d.cancelAnimationFrame.bind(d);
  k.enableFPSCounter = d.xa.bind(d);
  k.disableFPSCounter = d.va;
  d.la = c;
  k.resolveAnimationFrame = c;
  k.cleanup = function () {};
};
var ma = Object.assign({}, k),
  na = "./this.program",
  w = "",
  oa,
  pa;
if (da || ea) {
  ea ? w = self.location.href : "undefined" != typeof document && document.currentScript && (w = document.currentScript.src), _scriptName && (w = _scriptName), w.startsWith("blob:") ? w = "" : w = w.substr(0, w.replace(/[?#].*/, "").lastIndexOf("/") + 1), ea && (pa = a => {
    var b = new XMLHttpRequest();
    b.open("GET", a, !1);
    b.responseType = "arraybuffer";
    b.send(null);
    return new Uint8Array(b.response);
  }), oa = (a, b, c) => {
    if (qa(a)) {
      var d = new XMLHttpRequest();
      d.open("GET", a, !0);
      d.responseType = "arraybuffer";
      d.onload = () => {
        200 == d.status || 0 == d.status && d.response ? b(d.response) : c();
      };
      d.onerror = c;
      d.send(null);
    } else {
      fetch(a, {
        credentials: "same-origin"
      }).then(e => e.ok ? e.arrayBuffer() : Promise.reject(Error(e.status + " : " + e.url))).then(b, c);
    }
  };
}
var ua = k.print || console.log.bind(console),
  va = k.printErr || console.error.bind(console);
Object.assign(k, ma);
ma = null;
k.thisProgram && (na = k.thisProgram);
var wa;
k.wasmBinary && (wa = k.wasmBinary);
var xa,
  ya = !1,
  D,
  E,
  za,
  Aa,
  F,
  I,
  Ba,
  Ca;
function Da() {
  var a = xa.buffer;
  k.HEAP8 = D = new Int8Array(a);
  k.HEAP16 = za = new Int16Array(a);
  k.HEAPU8 = E = new Uint8Array(a);
  k.HEAPU16 = Aa = new Uint16Array(a);
  k.HEAP32 = F = new Int32Array(a);
  k.HEAPU32 = I = new Uint32Array(a);
  k.HEAPF32 = Ba = new Float32Array(a);
  k.HEAPF64 = Ca = new Float64Array(a);
}
var Ea = [],
  Fa = [],
  Ga = [];
function Ha() {
  var a = k.preRun.shift();
  Ea.unshift(a);
}
var J = 0,
  Ia = null,
  Ja = null;
function Ka(a) {
  var _k$onAbort;
  (_k$onAbort = k.onAbort) === null || _k$onAbort === void 0 || _k$onAbort.call(k, a);
  a = "Aborted(" + a + ")";
  va(a);
  ya = !0;
  a = new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
  ba(a);
  throw a;
}
var La = a => a.startsWith("data:application/octet-stream;base64,"),
  qa = a => a.startsWith("file://"),
  Ma;
function Na(a) {
  if (a == Ma && wa) {
    return new Uint8Array(wa);
  }
  if (pa) {
    return pa(a);
  }
  throw "both async and sync fetching of the wasm failed";
}
function Oa(a) {
  return wa ? Promise.resolve().then(() => Na(a)) : new Promise((b, c) => {
    oa(a, d => b(new Uint8Array(d)), () => {
      try {
        b(Na(a));
      } catch (d) {
        c(d);
      }
    });
  });
}
function Pa(a, b, c) {
  return Oa(a).then(d => WebAssembly.instantiate(d, b)).then(c, d => {
    va("failed to asynchronously prepare wasm: ".concat(d));
    Ka(d);
  });
}
function Qa(a, b) {
  var c = Ma;
  return wa || "function" != typeof WebAssembly.instantiateStreaming || La(c) || qa(c) || "function" != typeof fetch ? Pa(c, a, b) : fetch(c, {
    credentials: "same-origin"
  }).then(d => WebAssembly.instantiateStreaming(d, a).then(b, function (e) {
    va("wasm streaming compile failed: ".concat(e));
    va("falling back to ArrayBuffer instantiation");
    return Pa(c, a, b);
  }));
}
var Ra = a => {
    for (; 0 < a.length;) {
      a.shift()(k);
    }
  },
  Sa = (a, b) => Object.defineProperty(b, "name", {
    value: a
  }),
  Ta = [],
  M = [],
  N,
  P = a => {
    if (!a) {
      throw new N("Cannot use deleted val. handle = " + a);
    }
    return M[a];
  },
  Q = a => {
    switch (a) {
      case void 0:
        return 2;
      case null:
        return 4;
      case !0:
        return 6;
      case !1:
        return 8;
      default:
        const b = Ta.pop() || M.length;
        M[b] = a;
        M[b + 1] = 1;
        return b;
    }
  },
  Ua = a => {
    var b = Error,
      c = Sa(a, function (d) {
        this.name = a;
        this.message = d;
        d = Error(d).stack;
        void 0 !== d && (this.stack = this.toString() + "\n" + d.replace(/^Error(:[^\n]*)?\n/, ""));
      });
    c.prototype = Object.create(b.prototype);
    c.prototype.constructor = c;
    c.prototype.toString = function () {
      return void 0 === this.message ? this.name : "".concat(this.name, ": ").concat(this.message);
    };
    return c;
  },
  Va,
  Wa,
  R = a => {
    for (var b = ""; E[a];) {
      b += Wa[E[a++]];
    }
    return b;
  },
  Xa = [],
  Ya = () => {
    for (; Xa.length;) {
      var a = Xa.pop();
      a.g.M = !1;
      a["delete"]();
    }
  },
  Za,
  S = {},
  $a = (a, b) => {
    if (void 0 === b) {
      throw new N("ptr should not be undefined");
    }
    for (; a.m;) {
      b = a.R(b), a = a.m;
    }
    return b;
  },
  T = {},
  bb = a => {
    a = ab(a);
    var b = R(a);
    U(a);
    return b;
  },
  cb = (a, b) => {
    var c = T[a];
    if (void 0 === c) {
      throw a = "".concat(b, " has unknown type ").concat(bb(a)), new N(a);
    }
    return c;
  },
  db = () => {},
  eb = !1,
  fb = (a, b, c) => {
    if (b === c) {
      return a;
    }
    if (void 0 === c.m) {
      return null;
    }
    a = fb(a, b, c.m);
    return null === a ? null : c.wa(a);
  },
  gb = {},
  ib = (a, b) => {
    b = $a(a, b);
    return S[b];
  },
  jb,
  lb = (a, b) => {
    if (!b.j || !b.i) {
      throw new jb("makeClassHandle requires ptr and ptrType");
    }
    if (!!b.s !== !!b.o) {
      throw new jb("Both smartPtrType and smartPtr must be specified");
    }
    b.count = {
      value: 1
    };
    return kb(Object.create(a, {
      g: {
        value: b,
        writable: !0
      }
    }));
  },
  kb = a => {
    if ("undefined" === typeof FinalizationRegistry) {
      return kb = b => b, a;
    }
    eb = new FinalizationRegistry(b => {
      b = b.g;
      --b.count.value;
      0 === b.count.value && (b.o ? b.s.C(b.o) : b.j.h.C(b.i));
    });
    kb = b => {
      var c = b.g;
      c.o && eb.register(b, {
        g: c
      }, b);
      return b;
    };
    db = b => {
      eb.unregister(b);
    };
    return kb(a);
  },
  mb = {},
  nb = a => {
    for (; a.length;) {
      var b = a.pop();
      a.pop()(b);
    }
  };
function ob(a) {
  return this.fromWireType(I[a >> 2]);
}
var pb = {},
  qb = {},
  W = (a, b, c) => {
    function d(g) {
      g = c(g);
      if (g.length !== a.length) {
        throw new jb("Mismatched type converter count");
      }
      for (var p = 0; p < a.length; ++p) {
        V(a[p], g[p]);
      }
    }
    a.forEach(function (g) {
      qb[g] = b;
    });
    var e = Array(b.length),
      f = [],
      l = 0;
    b.forEach((g, p) => {
      T.hasOwnProperty(g) ? e[p] = T[g] : (f.push(g), pb.hasOwnProperty(g) || (pb[g] = []), pb[g].push(() => {
        e[p] = T[g];
        ++l;
        l === f.length && d(e);
      }));
    });
    0 === f.length && d(e);
  };
function rb(a, b) {
  let c = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var d = b.name;
  if (!a) {
    throw new N("type \"".concat(d, "\" must have a positive integer typeid pointer"));
  }
  if (T.hasOwnProperty(a)) {
    if (c.Fa) {
      return;
    }
    throw new N("Cannot register type '".concat(d, "' twice"));
  }
  T[a] = b;
  delete qb[a];
  pb.hasOwnProperty(a) && (b = pb[a], delete pb[a], b.forEach(e => e()));
}
function V(a, b) {
  let c = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  if (!("argPackAdvance" in b)) {
    throw new TypeError("registerType registeredInstance requires argPackAdvance");
  }
  return rb(a, b, c);
}
var sb = a => {
  throw new N(a.g.j.h.name + " instance already deleted");
};
function tb() {}
var ub = (a, b, c) => {
    if (void 0 === a[b].l) {
      var d = a[b];
      a[b] = function () {
        for (var _len2 = arguments.length, e = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          e[_key2] = arguments[_key2];
        }
        if (!a[b].l.hasOwnProperty(e.length)) {
          throw new N("Function '".concat(c, "' called with an invalid number of arguments (").concat(e.length, ") - expects one of (").concat(a[b].l, ")!"));
        }
        return a[b].l[e.length].apply(this, e);
      };
      a[b].l = [];
      a[b].l[d.L] = d;
    }
  },
  vb = (a, b, c) => {
    if (k.hasOwnProperty(a)) {
      if (void 0 === c || void 0 !== k[a].l && void 0 !== k[a].l[c]) {
        throw new N("Cannot register public name '".concat(a, "' twice"));
      }
      ub(k, a, a);
      if (k.hasOwnProperty(c)) {
        throw new N("Cannot register multiple overloads of a function with the same number of arguments (".concat(c, ")!"));
      }
      k[a].l[c] = b;
    } else {
      k[a] = b, void 0 !== c && (k[a].Sa = c);
    }
  },
  wb = a => {
    if (void 0 === a) {
      return "_unknown";
    }
    a = a.replace(/[^a-zA-Z0-9_]/g, "$");
    var b = a.charCodeAt(0);
    return 48 <= b && 57 >= b ? "_".concat(a) : a;
  };
function xb(a, b, c, d, e, f, l, g) {
  this.name = a;
  this.constructor = b;
  this.B = c;
  this.C = d;
  this.m = e;
  this.Aa = f;
  this.R = l;
  this.wa = g;
  this.ma = [];
}
var yb = (a, b, c) => {
  for (; b !== c;) {
    if (!b.R) {
      throw new N("Expected null or instance of ".concat(c.name, ", got an instance of ").concat(b.name));
    }
    a = b.R(a);
    b = b.m;
  }
  return a;
};
function zb(a, b) {
  if (null === b) {
    if (this.$) {
      throw new N("null is not a valid ".concat(this.name));
    }
    return 0;
  }
  if (!b.g) {
    throw new N("Cannot pass \"".concat(Ab(b), "\" as a ").concat(this.name));
  }
  if (!b.g.i) {
    throw new N("Cannot pass deleted object as a pointer of type ".concat(this.name));
  }
  return yb(b.g.i, b.g.j.h, this.h);
}
function Bb(a, b) {
  if (null === b) {
    if (this.$) {
      throw new N("null is not a valid ".concat(this.name));
    }
    if (this.U) {
      var c = this.aa();
      null !== a && a.push(this.C, c);
      return c;
    }
    return 0;
  }
  if (!b || !b.g) {
    throw new N("Cannot pass \"".concat(Ab(b), "\" as a ").concat(this.name));
  }
  if (!b.g.i) {
    throw new N("Cannot pass deleted object as a pointer of type ".concat(this.name));
  }
  if (!this.T && b.g.j.T) {
    throw new N("Cannot convert argument of type ".concat(b.g.s ? b.g.s.name : b.g.j.name, " to parameter type ").concat(this.name));
  }
  c = yb(b.g.i, b.g.j.h, this.h);
  if (this.U) {
    if (void 0 === b.g.o) {
      throw new N("Passing raw pointer to smart pointer is illegal");
    }
    switch (this.Ma) {
      case 0:
        if (b.g.s === this) {
          c = b.g.o;
        } else {
          throw new N("Cannot convert argument of type ".concat(b.g.s ? b.g.s.name : b.g.j.name, " to parameter type ").concat(this.name));
        }
        break;
      case 1:
        c = b.g.o;
        break;
      case 2:
        if (b.g.s === this) {
          c = b.g.o;
        } else {
          var d = b.clone();
          c = this.Ia(c, Q(() => d["delete"]()));
          null !== a && a.push(this.C, c);
        }
        break;
      default:
        throw new N("Unsupporting sharing policy");
    }
  }
  return c;
}
function Cb(a, b) {
  if (null === b) {
    if (this.$) {
      throw new N("null is not a valid ".concat(this.name));
    }
    return 0;
  }
  if (!b.g) {
    throw new N("Cannot pass \"".concat(Ab(b), "\" as a ").concat(this.name));
  }
  if (!b.g.i) {
    throw new N("Cannot pass deleted object as a pointer of type ".concat(this.name));
  }
  if (b.g.j.T) {
    throw new N("Cannot convert argument of type ".concat(b.g.j.name, " to parameter type ").concat(this.name));
  }
  return yb(b.g.i, b.g.j.h, this.h);
}
function Db(a, b, c, d, e, f, l, g, p, m, q) {
  this.name = a;
  this.h = b;
  this.$ = c;
  this.T = d;
  this.U = e;
  this.Ha = f;
  this.Ma = l;
  this.na = g;
  this.aa = p;
  this.Ia = m;
  this.C = q;
  e || void 0 !== b.m ? this.toWireType = Bb : (this.toWireType = d ? zb : Cb, this.u = null);
}
var Eb = (a, b, c) => {
    if (!k.hasOwnProperty(a)) {
      throw new jb("Replacing nonexistent public symbol");
    }
    void 0 !== k[a].l && void 0 !== c ? k[a].l[c] = b : (k[a] = b, k[a].L = c);
  },
  Fb = [],
  Gb,
  Hb = a => {
    var b = Fb[a];
    b || (a >= Fb.length && (Fb.length = a + 1), Fb[a] = b = Gb.get(a));
    return b;
  },
  Ib = function (a, b) {
    let c = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
    a.includes("j") ? (a = a.replace(/p/g, "i"), b = (0, k["dynCall_" + a])(b, ...c)) : b = Hb(b)(...c);
    return b;
  },
  Jb = (a, b) => function () {
    for (var _len3 = arguments.length, c = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
      c[_key3] = arguments[_key3];
    }
    return Ib(a, b, c);
  },
  X = (a, b) => {
    a = R(a);
    var c = a.includes("j") ? Jb(a, b) : Hb(b);
    if ("function" != typeof c) {
      throw new N("unknown function pointer with signature ".concat(a, ": ").concat(b));
    }
    return c;
  },
  Kb,
  Y = (a, b) => {
    function c(f) {
      e[f] || T[f] || (qb[f] ? qb[f].forEach(c) : (d.push(f), e[f] = !0));
    }
    var d = [],
      e = {};
    b.forEach(c);
    throw new Kb("".concat(a, ": ") + d.map(bb).join([", "]));
  };
function Lb(a) {
  for (var b = 1; b < a.length; ++b) {
    if (null !== a[b] && void 0 === a[b].u) {
      return !0;
    }
  }
  return !1;
}
function Mb(a, b, c, d, e) {
  var f = b.length;
  if (2 > f) {
    throw new N("argTypes array size mismatch! Must at least get return value and 'this' types!");
  }
  var l = null !== b[1] && null !== c,
    g = Lb(b),
    p = "void" !== b[0].name,
    m = f - 2,
    q = Array(m),
    u = [],
    x = [];
  return Sa(a, function () {
    for (var _len4 = arguments.length, h = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      h[_key4] = arguments[_key4];
    }
    if (h.length !== m) {
      throw new N("function ".concat(a, " called with ").concat(h.length, " arguments, expected ").concat(m));
    }
    x.length = 0;
    u.length = l ? 2 : 1;
    u[0] = e;
    if (l) {
      var t = b[1].toWireType(x, this);
      u[1] = t;
    }
    for (var v = 0; v < m; ++v) {
      q[v] = b[v + 2].toWireType(x, h[v]), u.push(q[v]);
    }
    h = d(...u);
    if (g) {
      nb(x);
    } else {
      for (v = l ? 1 : 2; v < b.length; v++) {
        var B = 1 === v ? t : q[v - 2];
        null !== b[v].u && b[v].u(B);
      }
    }
    t = p ? b[0].fromWireType(h) : void 0;
    return t;
  });
}
var Nb = (a, b) => {
    for (var c = [], d = 0; d < a; d++) {
      c.push(I[b + 4 * d >> 2]);
    }
    return c;
  },
  Ob = a => {
    a = a.trim();
    const b = a.indexOf("(");
    return -1 !== b ? a.substr(0, b) : a;
  },
  Pb = (a, b, c) => {
    if (!(a instanceof Object)) {
      throw new N("".concat(c, " with invalid \"this\": ").concat(a));
    }
    if (!(a instanceof b.h.constructor)) {
      throw new N("".concat(c, " incompatible with \"this\" of type ").concat(a.constructor.name));
    }
    if (!a.g.i) {
      throw new N("cannot call emscripten binding method ".concat(c, " on deleted object"));
    }
    return yb(a.g.i, a.g.j.h, b.h);
  },
  Qb = a => {
    9 < a && 0 === --M[a + 1] && (M[a] = void 0, Ta.push(a));
  },
  Rb = {
    name: "emscripten::val",
    fromWireType: a => {
      var b = P(a);
      Qb(a);
      return b;
    },
    toWireType: (a, b) => Q(b),
    argPackAdvance: 8,
    readValueFromPointer: ob,
    u: null
  },
  Sb = (a, b, c) => {
    switch (b) {
      case 1:
        return c ? function (d) {
          return this.fromWireType(D[d]);
        } : function (d) {
          return this.fromWireType(E[d]);
        };
      case 2:
        return c ? function (d) {
          return this.fromWireType(za[d >> 1]);
        } : function (d) {
          return this.fromWireType(Aa[d >> 1]);
        };
      case 4:
        return c ? function (d) {
          return this.fromWireType(F[d >> 2]);
        } : function (d) {
          return this.fromWireType(I[d >> 2]);
        };
      default:
        throw new TypeError("invalid integer width (".concat(b, "): ").concat(a));
    }
  },
  Ab = a => {
    if (null === a) {
      return "null";
    }
    var b = typeof a;
    return "object" === b || "array" === b || "function" === b ? a.toString() : "" + a;
  },
  Tb = (a, b) => {
    switch (b) {
      case 4:
        return function (c) {
          return this.fromWireType(Ba[c >> 2]);
        };
      case 8:
        return function (c) {
          return this.fromWireType(Ca[c >> 3]);
        };
      default:
        throw new TypeError("invalid float width (".concat(b, "): ").concat(a));
    }
  },
  Ub = (a, b, c) => {
    switch (b) {
      case 1:
        return c ? d => D[d] : d => E[d];
      case 2:
        return c ? d => za[d >> 1] : d => Aa[d >> 1];
      case 4:
        return c ? d => F[d >> 2] : d => I[d >> 2];
      default:
        throw new TypeError("invalid integer width (".concat(b, "): ").concat(a));
    }
  },
  Vb = (a, b, c, d) => {
    if (0 < d) {
      d = c + d - 1;
      for (var e = 0; e < a.length; ++e) {
        var f = a.charCodeAt(e);
        if (55296 <= f && 57343 >= f) {
          var l = a.charCodeAt(++e);
          f = 65536 + ((f & 1023) << 10) | l & 1023;
        }
        if (127 >= f) {
          if (c >= d) {
            break;
          }
          b[c++] = f;
        } else {
          if (2047 >= f) {
            if (c + 1 >= d) {
              break;
            }
            b[c++] = 192 | f >> 6;
          } else {
            if (65535 >= f) {
              if (c + 2 >= d) {
                break;
              }
              b[c++] = 224 | f >> 12;
            } else {
              if (c + 3 >= d) {
                break;
              }
              b[c++] = 240 | f >> 18;
              b[c++] = 128 | f >> 12 & 63;
            }
            b[c++] = 128 | f >> 6 & 63;
          }
          b[c++] = 128 | f & 63;
        }
      }
      b[c] = 0;
    }
  },
  Wb = a => {
    for (var b = 0, c = 0; c < a.length; ++c) {
      var d = a.charCodeAt(c);
      127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3;
    }
    return b;
  },
  Zb = "undefined" != typeof TextDecoder ? new TextDecoder("utf8") : void 0,
  $b = (a, b, c) => {
    var d = b + c;
    for (c = b; a[c] && !(c >= d);) {
      ++c;
    }
    if (16 < c - b && a.buffer && Zb) {
      return Zb.decode(a.subarray(b, c));
    }
    for (d = ""; b < c;) {
      var e = a[b++];
      if (e & 128) {
        var f = a[b++] & 63;
        if (192 == (e & 224)) {
          d += String.fromCharCode((e & 31) << 6 | f);
        } else {
          var l = a[b++] & 63;
          e = 224 == (e & 240) ? (e & 15) << 12 | f << 6 | l : (e & 7) << 18 | f << 12 | l << 6 | a[b++] & 63;
          65536 > e ? d += String.fromCharCode(e) : (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023));
        }
      } else {
        d += String.fromCharCode(e);
      }
    }
    return d;
  },
  ac = "undefined" != typeof TextDecoder ? new TextDecoder("utf-16le") : void 0,
  bc = (a, b) => {
    var c = a >> 1;
    for (var d = c + b / 2; !(c >= d) && Aa[c];) {
      ++c;
    }
    c <<= 1;
    if (32 < c - a && ac) {
      return ac.decode(E.subarray(a, c));
    }
    c = "";
    for (d = 0; !(d >= b / 2); ++d) {
      var e = za[a + 2 * d >> 1];
      if (0 == e) {
        break;
      }
      c += String.fromCharCode(e);
    }
    return c;
  },
  cc = (a, b, c) => {
    var _c;
    (_c = c) !== null && _c !== void 0 ? _c : c = 2147483647;
    if (2 > c) {
      return 0;
    }
    c -= 2;
    var d = b;
    c = c < 2 * a.length ? c / 2 : a.length;
    for (var e = 0; e < c; ++e) {
      za[b >> 1] = a.charCodeAt(e), b += 2;
    }
    za[b >> 1] = 0;
    return b - d;
  },
  dc = a => 2 * a.length,
  ec = (a, b) => {
    for (var c = 0, d = ""; !(c >= b / 4);) {
      var e = F[a + 4 * c >> 2];
      if (0 == e) {
        break;
      }
      ++c;
      65536 <= e ? (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023)) : d += String.fromCharCode(e);
    }
    return d;
  },
  fc = (a, b, c) => {
    var _c2;
    (_c2 = c) !== null && _c2 !== void 0 ? _c2 : c = 2147483647;
    if (4 > c) {
      return 0;
    }
    var d = b;
    c = d + c - 4;
    for (var e = 0; e < a.length; ++e) {
      var f = a.charCodeAt(e);
      if (55296 <= f && 57343 >= f) {
        var l = a.charCodeAt(++e);
        f = 65536 + ((f & 1023) << 10) | l & 1023;
      }
      F[b >> 2] = f;
      b += 4;
      if (b + 4 > c) {
        break;
      }
    }
    F[b >> 2] = 0;
    return b - d;
  },
  gc = a => {
    for (var b = 0, c = 0; c < a.length; ++c) {
      var d = a.charCodeAt(c);
      55296 <= d && 57343 >= d && ++c;
      b += 4;
    }
    return b;
  },
  hc = (a, b, c) => {
    var d = [];
    a = a.toWireType(d, c);
    d.length && (I[b >> 2] = Q(d));
    return a;
  },
  ic = {},
  jc = a => {
    var b = ic[a];
    return void 0 === b ? R(a) : b;
  },
  kc = [],
  lc = a => {
    var b = kc.length;
    kc.push(a);
    return b;
  },
  mc = (a, b) => {
    for (var c = Array(a), d = 0; d < a; ++d) {
      c[d] = cb(I[b + 4 * d >> 2], "parameter " + d);
    }
    return c;
  },
  nc = Reflect.construct,
  oc = {},
  qc = () => {
    if (!pc) {
      var a = {
          USER: "web_user",
          LOGNAME: "web_user",
          PATH: "/",
          PWD: "/",
          HOME: "/home/web_user",
          LANG: ("object" == typeof navigator && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8",
          _: na || "./this.program"
        },
        b;
      for (b in oc) {
        void 0 === oc[b] ? delete a[b] : a[b] = oc[b];
      }
      var c = [];
      for (b in a) {
        c.push("".concat(b, "=").concat(a[b]));
      }
      pc = c;
    }
    return pc;
  },
  pc,
  rc = [null, [], []],
  sc = a => 0 === a % 4 && (0 !== a % 100 || 0 === a % 400),
  tc = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  uc = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function vc(a) {
  var b = Array(Wb(a) + 1);
  Vb(a, b, 0, b.length);
  return b;
}
var wc = (a, b, c, d) => {
  function e(h, t, v) {
    for (h = "number" == typeof h ? h.toString() : h || ""; h.length < t;) {
      h = v[0] + h;
    }
    return h;
  }
  function f(h, t) {
    return e(h, t, "0");
  }
  function l(h, t) {
    function v(L) {
      return 0 > L ? -1 : 0 < L ? 1 : 0;
    }
    var B;
    0 === (B = v(h.getFullYear() - t.getFullYear())) && 0 === (B = v(h.getMonth() - t.getMonth())) && (B = v(h.getDate() - t.getDate()));
    return B;
  }
  function g(h) {
    switch (h.getDay()) {
      case 0:
        return new Date(h.getFullYear() - 1, 11, 29);
      case 1:
        return h;
      case 2:
        return new Date(h.getFullYear(), 0, 3);
      case 3:
        return new Date(h.getFullYear(), 0, 2);
      case 4:
        return new Date(h.getFullYear(), 0, 1);
      case 5:
        return new Date(h.getFullYear() - 1, 11, 31);
      case 6:
        return new Date(h.getFullYear() - 1, 11, 30);
    }
  }
  function p(h) {
    var t = h.J;
    for (h = new Date(new Date(h.K + 1900, 0, 1).getTime()); 0 < t;) {
      var v = h.getMonth(),
        B = (sc(h.getFullYear()) ? tc : uc)[v];
      if (t > B - h.getDate()) {
        t -= B - h.getDate() + 1, h.setDate(1), 11 > v ? h.setMonth(v + 1) : (h.setMonth(0), h.setFullYear(h.getFullYear() + 1));
      } else {
        h.setDate(h.getDate() + t);
        break;
      }
    }
    v = new Date(h.getFullYear() + 1, 0, 4);
    t = g(new Date(h.getFullYear(), 0, 4));
    v = g(v);
    return 0 >= l(t, h) ? 0 >= l(v, h) ? h.getFullYear() + 1 : h.getFullYear() : h.getFullYear() - 1;
  }
  var m = I[d + 40 >> 2];
  d = {
    Pa: F[d >> 2],
    Oa: F[d + 4 >> 2],
    W: F[d + 8 >> 2],
    ca: F[d + 12 >> 2],
    X: F[d + 16 >> 2],
    K: F[d + 20 >> 2],
    D: F[d + 24 >> 2],
    J: F[d + 28 >> 2],
    Ta: F[d + 32 >> 2],
    Na: F[d + 36 >> 2],
    Qa: m ? m ? $b(E, m) : "" : ""
  };
  c = c ? $b(E, c) : "";
  m = {
    "%c": "%a %b %d %H:%M:%S %Y",
    "%D": "%m/%d/%y",
    "%F": "%Y-%m-%d",
    "%h": "%b",
    "%r": "%I:%M:%S %p",
    "%R": "%H:%M",
    "%T": "%H:%M:%S",
    "%x": "%m/%d/%y",
    "%X": "%H:%M:%S",
    "%Ec": "%c",
    "%EC": "%C",
    "%Ex": "%m/%d/%y",
    "%EX": "%H:%M:%S",
    "%Ey": "%y",
    "%EY": "%Y",
    "%Od": "%d",
    "%Oe": "%e",
    "%OH": "%H",
    "%OI": "%I",
    "%Om": "%m",
    "%OM": "%M",
    "%OS": "%S",
    "%Ou": "%u",
    "%OU": "%U",
    "%OV": "%V",
    "%Ow": "%w",
    "%OW": "%W",
    "%Oy": "%y"
  };
  for (var q in m) {
    c = c.replace(new RegExp(q, "g"), m[q]);
  }
  var u = "Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" "),
    x = "January February March April May June July August September October November December".split(" ");
  m = {
    "%a": h => u[h.D].substring(0, 3),
    "%A": h => u[h.D],
    "%b": h => x[h.X].substring(0, 3),
    "%B": h => x[h.X],
    "%C": h => f((h.K + 1900) / 100 | 0, 2),
    "%d": h => f(h.ca, 2),
    "%e": h => e(h.ca, 2, " "),
    "%g": h => p(h).toString().substring(2),
    "%G": p,
    "%H": h => f(h.W, 2),
    "%I": h => {
      h = h.W;
      0 == h ? h = 12 : 12 < h && (h -= 12);
      return f(h, 2);
    },
    "%j": h => {
      for (var t = 0, v = 0; v <= h.X - 1; t += (sc(h.K + 1900) ? tc : uc)[v++]) {}
      return f(h.ca + t, 3);
    },
    "%m": h => f(h.X + 1, 2),
    "%M": h => f(h.Oa, 2),
    "%n": () => "\n",
    "%p": h => 0 <= h.W && 12 > h.W ? "AM" : "PM",
    "%S": h => f(h.Pa, 2),
    "%t": () => "\t",
    "%u": h => h.D || 7,
    "%U": h => f(Math.floor((h.J + 7 - h.D) / 7), 2),
    "%V": h => {
      var t = Math.floor((h.J + 7 - (h.D + 6) % 7) / 7);
      2 >= (h.D + 371 - h.J - 2) % 7 && t++;
      if (t) {
        53 == t && (v = (h.D + 371 - h.J) % 7, 4 == v || 3 == v && sc(h.K) || (t = 1));
      } else {
        t = 52;
        var v = (h.D + 7 - h.J - 1) % 7;
        (4 == v || 5 == v && sc(h.K % 400 - 1)) && t++;
      }
      return f(t, 2);
    },
    "%w": h => h.D,
    "%W": h => f(Math.floor((h.J + 7 - (h.D + 6) % 7) / 7), 2),
    "%y": h => (h.K + 1900).toString().substring(2),
    "%Y": h => h.K + 1900,
    "%z": h => {
      h = h.Na;
      var t = 0 <= h;
      h = Math.abs(h) / 60;
      return (t ? "+" : "-") + String("0000" + (h / 60 * 100 + h % 60)).slice(-4);
    },
    "%Z": h => h.Qa,
    "%%": () => "%"
  };
  c = c.replace(/%%/g, "\x00\x00");
  for (q in m) {
    c.includes(q) && (c = c.replace(new RegExp(q, "g"), m[q](d)));
  }
  c = c.replace(/\0\0/g, "%");
  q = vc(c);
  if (q.length > b) {
    return 0;
  }
  D.set(q, a);
  return q.length - 1;
};
N = k.BindingError = class extends Error {
  constructor(a) {
    super(a);
    this.name = "BindingError";
  }
};
M.push(0, 1, void 0, 1, null, 1, !0, 1, !1, 1);
k.count_emval_handles = () => M.length / 2 - 5 - Ta.length;
Va = k.PureVirtualError = Ua("PureVirtualError");
for (var xc = Array(256), yc = 0; 256 > yc; ++yc) {
  xc[yc] = String.fromCharCode(yc);
}
Wa = xc;
k.getInheritedInstanceCount = () => Object.keys(S).length;
k.getLiveInheritedInstances = () => {
  var a = [],
    b;
  for (b in S) {
    S.hasOwnProperty(b) && a.push(S[b]);
  }
  return a;
};
k.flushPendingDeletes = Ya;
k.setDelayFunction = a => {
  Za = a;
  Xa.length && Za && Za(Ya);
};
jb = k.InternalError = class extends Error {
  constructor(a) {
    super(a);
    this.name = "InternalError";
  }
};
Object.assign(tb.prototype, {
  isAliasOf: function (a) {
    if (!(this instanceof tb && a instanceof tb)) {
      return !1;
    }
    var b = this.g.j.h,
      c = this.g.i;
    a.g = a.g;
    var d = a.g.j.h;
    for (a = a.g.i; b.m;) {
      c = b.R(c), b = b.m;
    }
    for (; d.m;) {
      a = d.R(a), d = d.m;
    }
    return b === d && c === a;
  },
  clone: function () {
    this.g.i || sb(this);
    if (this.g.N) {
      return this.g.count.value += 1, this;
    }
    var a = kb,
      b = Object,
      c = b.create,
      d = Object.getPrototypeOf(this),
      e = this.g;
    a = a(c.call(b, d, {
      g: {
        value: {
          count: e.count,
          M: e.M,
          N: e.N,
          i: e.i,
          j: e.j,
          o: e.o,
          s: e.s
        }
      }
    }));
    a.g.count.value += 1;
    a.g.M = !1;
    return a;
  },
  ["delete"]() {
    this.g.i || sb(this);
    if (this.g.M && !this.g.N) {
      throw new N("Object already scheduled for deletion");
    }
    db(this);
    var a = this.g;
    --a.count.value;
    0 === a.count.value && (a.o ? a.s.C(a.o) : a.j.h.C(a.i));
    this.g.N || (this.g.o = void 0, this.g.i = void 0);
  },
  isDeleted: function () {
    return !this.g.i;
  },
  deleteLater: function () {
    this.g.i || sb(this);
    if (this.g.M && !this.g.N) {
      throw new N("Object already scheduled for deletion");
    }
    Xa.push(this);
    1 === Xa.length && Za && Za(Ya);
    this.g.M = !0;
    return this;
  }
});
Object.assign(Db.prototype, {
  Ba(a) {
    this.na && (a = this.na(a));
    return a;
  },
  ga(a) {
    var _this$C;
    (_this$C = this.C) === null || _this$C === void 0 || _this$C.call(this, a);
  },
  argPackAdvance: 8,
  readValueFromPointer: ob,
  fromWireType: function (a) {
    function b() {
      return this.U ? lb(this.h.B, {
        j: this.Ha,
        i: c,
        s: this,
        o: a
      }) : lb(this.h.B, {
        j: this,
        i: a
      });
    }
    var c = this.Ba(a);
    if (!c) {
      return this.ga(a), null;
    }
    var d = ib(this.h, c);
    if (void 0 !== d) {
      if (0 === d.g.count.value) {
        return d.g.i = c, d.g.o = a, d.clone();
      }
      d = d.clone();
      this.ga(a);
      return d;
    }
    d = this.h.Aa(c);
    d = gb[d];
    if (!d) {
      return b.call(this);
    }
    d = this.T ? d.ua : d.pointerType;
    var e = fb(c, this.h, d.h);
    return null === e ? b.call(this) : this.U ? lb(d.h.B, {
      j: d,
      i: e,
      s: this,
      o: a
    }) : lb(d.h.B, {
      j: d,
      i: e
    });
  }
});
Kb = k.UnboundTypeError = Ua("UnboundTypeError");
var Ac = {
    _abort_js: () => {
      Ka("");
    },
    _embind_create_inheriting_constructor: (a, b, c) => {
      a = R(a);
      b = cb(b, "wrapper");
      c = P(c);
      var d = b.h,
        e = d.B,
        f = d.m.B,
        l = d.m.constructor;
      a = Sa(a, function () {
        d.m.ma.forEach(function (p) {
          if (this[p] === f[p]) {
            throw new Va("Pure virtual function ".concat(p, " must be implemented in JavaScript"));
          }
        }.bind(this));
        Object.defineProperty(this, "__parent", {
          value: e
        });
        this.__construct(...arguments);
      });
      e.__construct = function () {
        for (var _len5 = arguments.length, g = new Array(_len5), _key5 = 0; _key5 < _len5; _key5++) {
          g[_key5] = arguments[_key5];
        }
        if (this === e) {
          throw new N("Pass correct 'this' to __construct");
        }
        g = l.implement(this, ...g);
        db(g);
        var p = g.g;
        g.notifyOnDestruction();
        p.N = !0;
        Object.defineProperties(this, {
          g: {
            value: p
          }
        });
        kb(this);
        g = p.i;
        g = $a(d, g);
        if (S.hasOwnProperty(g)) {
          throw new N("Tried to register registered instance: ".concat(g));
        }
        S[g] = this;
      };
      e.__destruct = function () {
        if (this === e) {
          throw new N("Pass correct 'this' to __destruct");
        }
        db(this);
        var g = this.g.i;
        g = $a(d, g);
        if (S.hasOwnProperty(g)) {
          delete S[g];
        } else {
          throw new N("Tried to unregister unregistered instance: ".concat(g));
        }
      };
      a.prototype = Object.create(e);
      Object.assign(a.prototype, c);
      return Q(a);
    },
    _embind_finalize_value_object: a => {
      var b = mb[a];
      delete mb[a];
      var c = b.aa,
        d = b.C,
        e = b.ja,
        f = e.map(l => l.Ea).concat(e.map(l => l.Ka));
      W([a], f, l => {
        var g = {};
        e.forEach((p, m) => {
          var q = l[m],
            u = p.Ca,
            x = p.Da,
            h = l[m + e.length],
            t = p.Ja,
            v = p.La;
          g[p.ya] = {
            read: B => q.fromWireType(u(x, B)),
            write: (B, L) => {
              var H = [];
              t(v, B, h.toWireType(H, L));
              nb(H);
            }
          };
        });
        return [{
          name: b.name,
          fromWireType: p => {
            var m = {},
              q;
            for (q in g) {
              m[q] = g[q].read(p);
            }
            d(p);
            return m;
          },
          toWireType: (p, m) => {
            for (var q in g) {
              if (!(q in m)) {
                throw new TypeError("Missing field: \"".concat(q, "\""));
              }
            }
            var u = c();
            for (q in g) {
              g[q].write(u, m[q]);
            }
            null !== p && p.push(d, u);
            return u;
          },
          argPackAdvance: 8,
          readValueFromPointer: ob,
          u: d
        }];
      });
    },
    _embind_register_bigint: () => {},
    _embind_register_bool: (a, b, c, d) => {
      b = R(b);
      V(a, {
        name: b,
        fromWireType: function (e) {
          return !!e;
        },
        toWireType: function (e, f) {
          return f ? c : d;
        },
        argPackAdvance: 8,
        readValueFromPointer: function (e) {
          return this.fromWireType(E[e]);
        },
        u: null
      });
    },
    _embind_register_class: (a, b, c, d, e, f, l, g, p, m, q, u, x) => {
      q = R(q);
      f = X(e, f);
      g && (g = X(l, g));
      m && (m = X(p, m));
      x = X(u, x);
      var h = wb(q);
      vb(h, function () {
        Y("Cannot construct ".concat(q, " due to unbound types"), [d]);
      });
      W([a, b, c], d ? [d] : [], t => {
        t = t[0];
        if (d) {
          var v = t.h;
          var B = v.B;
        } else {
          B = tb.prototype;
        }
        t = Sa(q, function () {
          if (Object.getPrototypeOf(this) !== L) {
            throw new N("Use 'new' to construct " + q);
          }
          if (void 0 === H.I) {
            throw new N(q + " has no accessible constructor");
          }
          for (var _len6 = arguments.length, fa = new Array(_len6), _key6 = 0; _key6 < _len6; _key6++) {
            fa[_key6] = arguments[_key6];
          }
          var n = H.I[fa.length];
          if (void 0 === n) {
            throw new N("Tried to invoke ctor of ".concat(q, " with invalid number of parameters (").concat(fa.length, ") - expected (").concat(Object.keys(H.I).toString(), ") parameters instead!"));
          }
          return n.apply(this, fa);
        });
        var L = Object.create(B, {
          constructor: {
            value: t
          }
        });
        t.prototype = L;
        var H = new xb(q, t, L, x, v, f, g, m);
        if (H.m) {
          var _O$S;
          var O;
          (_O$S = (O = H.m).S) !== null && _O$S !== void 0 ? _O$S : O.S = [];
          H.m.S.push(H);
        }
        v = new Db(q, H, !0, !1, !1);
        O = new Db(q + "*", H, !1, !1, !1);
        B = new Db(q + " const*", H, !1, !0, !1);
        gb[a] = {
          pointerType: O,
          ua: B
        };
        Eb(h, t);
        return [v, O, B];
      });
    },
    _embind_register_class_class_function: (a, b, c, d, e, f, l) => {
      var g = Nb(c, d);
      b = R(b);
      b = Ob(b);
      f = X(e, f);
      W([], [a], p => {
        function m() {
          Y("Cannot call ".concat(q, " due to unbound types"), g);
        }
        p = p[0];
        var q = "".concat(p.name, ".").concat(b);
        b.startsWith("@@") && (b = Symbol[b.substring(2)]);
        var u = p.h.constructor;
        void 0 === u[b] ? (m.L = c - 1, u[b] = m) : (ub(u, b, q), u[b].l[c - 1] = m);
        W([], g, x => {
          x = Mb(q, [x[0], null].concat(x.slice(1)), null, f, l);
          void 0 === u[b].l ? (x.L = c - 1, u[b] = x) : u[b].l[c - 1] = x;
          if (p.h.S) {
            for (const h of p.h.S) {
              h.constructor.hasOwnProperty(b) || (h.constructor[b] = x);
            }
          }
          return [];
        });
        return [];
      });
    },
    _embind_register_class_class_property: (a, b, c, d, e, f, l, g) => {
      b = R(b);
      f = X(e, f);
      W([], [a], p => {
        p = p[0];
        var m = "".concat(p.name, ".").concat(b),
          q = {
            get() {
              Y("Cannot access ".concat(m, " due to unbound types"), [c]);
            },
            enumerable: !0,
            configurable: !0
          };
        q.set = g ? () => {
          Y("Cannot access ".concat(m, " due to unbound types"), [c]);
        } : () => {
          throw new N("".concat(m, " is a read-only property"));
        };
        Object.defineProperty(p.h.constructor, b, q);
        W([], [c], u => {
          u = u[0];
          var x = {
            get() {
              return u.fromWireType(f(d));
            },
            enumerable: !0
          };
          g && (g = X(l, g), x.set = h => {
            var t = [];
            g(d, u.toWireType(t, h));
            nb(t);
          });
          Object.defineProperty(p.h.constructor, b, x);
          return [];
        });
        return [];
      });
    },
    _embind_register_class_constructor: (a, b, c, d, e, f) => {
      var l = Nb(b, c);
      e = X(d, e);
      W([], [a], g => {
        g = g[0];
        var p = "constructor ".concat(g.name);
        void 0 === g.h.I && (g.h.I = []);
        if (void 0 !== g.h.I[b - 1]) {
          throw new N("Cannot register multiple constructors with identical number of parameters (".concat(b - 1, ") for class '").concat(g.name, "'! Overload resolution is currently only performed using the parameter count, not actual type info!"));
        }
        g.h.I[b - 1] = () => {
          Y("Cannot construct ".concat(g.name, " due to unbound types"), l);
        };
        W([], l, m => {
          m.splice(1, 0, null);
          g.h.I[b - 1] = Mb(p, m, null, e, f);
          return [];
        });
        return [];
      });
    },
    _embind_register_class_function: (a, b, c, d, e, f, l, g) => {
      var p = Nb(c, d);
      b = R(b);
      b = Ob(b);
      f = X(e, f);
      W([], [a], m => {
        function q() {
          Y("Cannot call ".concat(u, " due to unbound types"), p);
        }
        m = m[0];
        var u = "".concat(m.name, ".").concat(b);
        b.startsWith("@@") && (b = Symbol[b.substring(2)]);
        g && m.h.ma.push(b);
        var x = m.h.B,
          h = x[b];
        void 0 === h || void 0 === h.l && h.className !== m.name && h.L === c - 2 ? (q.L = c - 2, q.className = m.name, x[b] = q) : (ub(x, b, u), x[b].l[c - 2] = q);
        W([], p, t => {
          t = Mb(u, t, m, f, l);
          void 0 === x[b].l ? (t.L = c - 2, x[b] = t) : x[b].l[c - 2] = t;
          return [];
        });
        return [];
      });
    },
    _embind_register_class_property: (a, b, c, d, e, f, l, g, p, m) => {
      b = R(b);
      e = X(d, e);
      W([], [a], q => {
        q = q[0];
        var u = "".concat(q.name, ".").concat(b),
          x = {
            get() {
              Y("Cannot access ".concat(u, " due to unbound types"), [c, l]);
            },
            enumerable: !0,
            configurable: !0
          };
        x.set = p ? () => Y("Cannot access ".concat(u, " due to unbound types"), [c, l]) : () => {
          throw new N(u + " is a read-only property");
        };
        Object.defineProperty(q.h.B, b, x);
        W([], p ? [c, l] : [c], h => {
          var t = h[0],
            v = {
              get() {
                var L = Pb(this, q, u + " getter");
                return t.fromWireType(e(f, L));
              },
              enumerable: !0
            };
          if (p) {
            p = X(g, p);
            var B = h[1];
            v.set = function (L) {
              var H = Pb(this, q, u + " setter"),
                O = [];
              p(m, H, B.toWireType(O, L));
              nb(O);
            };
          }
          Object.defineProperty(q.h.B, b, v);
          return [];
        });
        return [];
      });
    },
    _embind_register_emval: a => V(a, Rb),
    _embind_register_enum: (a, b, c, d) => {
      function e() {}
      b = R(b);
      e.values = {};
      V(a, {
        name: b,
        constructor: e,
        fromWireType: function (f) {
          return this.constructor.values[f];
        },
        toWireType: (f, l) => l.value,
        argPackAdvance: 8,
        readValueFromPointer: Sb(b, c, d),
        u: null
      });
      vb(b, e);
    },
    _embind_register_enum_value: (a, b, c) => {
      var d = cb(a, "enum");
      b = R(b);
      a = d.constructor;
      d = Object.create(d.constructor.prototype, {
        value: {
          value: c
        },
        constructor: {
          value: Sa("".concat(d.name, "_").concat(b), function () {})
        }
      });
      a.values[c] = d;
      a[b] = d;
    },
    _embind_register_float: (a, b, c) => {
      b = R(b);
      V(a, {
        name: b,
        fromWireType: d => d,
        toWireType: (d, e) => e,
        argPackAdvance: 8,
        readValueFromPointer: Tb(b, c),
        u: null
      });
    },
    _embind_register_function: (a, b, c, d, e, f) => {
      var l = Nb(b, c);
      a = R(a);
      a = Ob(a);
      e = X(d, e);
      vb(a, function () {
        Y("Cannot call ".concat(a, " due to unbound types"), l);
      }, b - 1);
      W([], l, g => {
        Eb(a, Mb(a, [g[0], null].concat(g.slice(1)), null, e, f), b - 1);
        return [];
      });
    },
    _embind_register_integer: (a, b, c, d, e) => {
      b = R(b);
      -1 === e && (e = 4294967295);
      e = g => g;
      if (0 === d) {
        var f = 32 - 8 * c;
        e = g => g << f >>> f;
      }
      var l = b.includes("unsigned") ? function (g, p) {
        return p >>> 0;
      } : function (g, p) {
        return p;
      };
      V(a, {
        name: b,
        fromWireType: e,
        toWireType: l,
        argPackAdvance: 8,
        readValueFromPointer: Ub(b, c, 0 !== d),
        u: null
      });
    },
    _embind_register_memory_view: (a, b, c) => {
      function d(f) {
        return new e(D.buffer, I[f + 4 >> 2], I[f >> 2]);
      }
      var e = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array][b];
      c = R(c);
      V(a, {
        name: c,
        fromWireType: d,
        argPackAdvance: 8,
        readValueFromPointer: d
      }, {
        Fa: !0
      });
    },
    _embind_register_std_string: (a, b) => {
      b = R(b);
      var c = "std::string" === b;
      V(a, {
        name: b,
        fromWireType: function (d) {
          var e = I[d >> 2],
            f = d + 4;
          if (c) {
            for (var l = f, g = 0; g <= e; ++g) {
              var p = f + g;
              if (g == e || 0 == E[p]) {
                l = l ? $b(E, l, p - l) : "";
                if (void 0 === m) {
                  var m = l;
                } else {
                  m += String.fromCharCode(0), m += l;
                }
                l = p + 1;
              }
            }
          } else {
            m = Array(e);
            for (g = 0; g < e; ++g) {
              m[g] = String.fromCharCode(E[f + g]);
            }
            m = m.join("");
          }
          U(d);
          return m;
        },
        toWireType: function (d, e) {
          e instanceof ArrayBuffer && (e = new Uint8Array(e));
          var f = "string" == typeof e;
          if (!(f || e instanceof Uint8Array || e instanceof Uint8ClampedArray || e instanceof Int8Array)) {
            throw new N("Cannot pass non-string to std::string");
          }
          var l = c && f ? Wb(e) : e.length;
          var g = zc(4 + l + 1),
            p = g + 4;
          I[g >> 2] = l;
          if (c && f) {
            Vb(e, E, p, l + 1);
          } else {
            if (f) {
              for (f = 0; f < l; ++f) {
                var m = e.charCodeAt(f);
                if (255 < m) {
                  throw U(p), new N("String has UTF-16 code units that do not fit in 8 bits");
                }
                E[p + f] = m;
              }
            } else {
              for (f = 0; f < l; ++f) {
                E[p + f] = e[f];
              }
            }
          }
          null !== d && d.push(U, g);
          return g;
        },
        argPackAdvance: 8,
        readValueFromPointer: ob,
        u(d) {
          U(d);
        }
      });
    },
    _embind_register_std_wstring: (a, b, c) => {
      c = R(c);
      if (2 === b) {
        var d = bc;
        var e = cc;
        var f = dc;
        var l = g => Aa[g >> 1];
      } else {
        4 === b && (d = ec, e = fc, f = gc, l = g => I[g >> 2]);
      }
      V(a, {
        name: c,
        fromWireType: g => {
          for (var p = I[g >> 2], m, q = g + 4, u = 0; u <= p; ++u) {
            var x = g + 4 + u * b;
            if (u == p || 0 == l(x)) {
              q = d(q, x - q), void 0 === m ? m = q : (m += String.fromCharCode(0), m += q), q = x + b;
            }
          }
          U(g);
          return m;
        },
        toWireType: (g, p) => {
          if ("string" != typeof p) {
            throw new N("Cannot pass non-string to C++ string type ".concat(c));
          }
          var m = f(p),
            q = zc(4 + m + b);
          I[q >> 2] = m / b;
          e(p, q + 4, m + b);
          null !== g && g.push(U, q);
          return q;
        },
        argPackAdvance: 8,
        readValueFromPointer: ob,
        u(g) {
          U(g);
        }
      });
    },
    _embind_register_value_object: (a, b, c, d, e, f) => {
      mb[a] = {
        name: R(b),
        aa: X(c, d),
        C: X(e, f),
        ja: []
      };
    },
    _embind_register_value_object_field: (a, b, c, d, e, f, l, g, p, m) => {
      mb[a].ja.push({
        ya: R(b),
        Ea: c,
        Ca: X(d, e),
        Da: f,
        Ka: l,
        Ja: X(g, p),
        La: m
      });
    },
    _embind_register_void: (a, b) => {
      b = R(b);
      V(a, {
        Ra: !0,
        name: b,
        argPackAdvance: 0,
        fromWireType: () => {},
        toWireType: () => {}
      });
    },
    _emscripten_get_now_is_monotonic: () => 1,
    _emscripten_memcpy_js: (a, b, c) => E.copyWithin(a, b, b + c),
    _emval_as: (a, b, c) => {
      a = P(a);
      b = cb(b, "emval::as");
      return hc(b, c, a);
    },
    _emval_call_method: (a, b, c, d, e) => {
      a = kc[a];
      b = P(b);
      c = jc(c);
      return a(b, b[c], d, e);
    },
    _emval_decref: Qb,
    _emval_get_method_caller: (a, b, c) => {
      var d = mc(a, b),
        e = d.shift();
      a--;
      var f = Array(a);
      b = "methodCaller<(".concat(d.map(l => l.name).join(", "), ") => ").concat(e.name, ">");
      return lc(Sa(b, (l, g, p, m) => {
        for (var q = 0, u = 0; u < a; ++u) {
          f[u] = d[u].readValueFromPointer(m + q), q += d[u].argPackAdvance;
        }
        l = 1 === c ? nc(g, f) : g.apply(l, f);
        return hc(e, p, l);
      }));
    },
    _emval_get_module_property: a => {
      a = jc(a);
      return Q(k[a]);
    },
    _emval_get_property: (a, b) => {
      a = P(a);
      b = P(b);
      return Q(a[b]);
    },
    _emval_incref: a => {
      9 < a && (M[a + 1] += 1);
    },
    _emval_new_array: () => Q([]),
    _emval_new_cstring: a => Q(jc(a)),
    _emval_new_object: () => Q({}),
    _emval_run_destructors: a => {
      var b = P(a);
      nb(b);
      Qb(a);
    },
    _emval_set_property: (a, b, c) => {
      a = P(a);
      b = P(b);
      c = P(c);
      a[b] = c;
    },
    _emval_take_value: (a, b) => {
      a = cb(a, "_emval_take_value");
      a = a.readValueFromPointer(b);
      return Q(a);
    },
    emscripten_date_now: () => Date.now(),
    emscripten_get_now: () => Date.now(),
    emscripten_resize_heap: a => {
      var b = E.length;
      a >>>= 0;
      if (2147483648 < a) {
        return !1;
      }
      for (var c = 1; 4 >= c; c *= 2) {
        var d = b * (1 + 0.2 / c);
        d = Math.min(d, a + 100663296);
        var e = Math;
        d = Math.max(a, d);
        a: {
          e = (e.min.call(e, 2147483648, d + (65536 - d % 65536) % 65536) - xa.buffer.byteLength + 65535) / 65536;
          try {
            xa.grow(e);
            Da();
            var f = 1;
            break a;
          } catch (l) {}
          f = void 0;
        }
        if (f) {
          return !0;
        }
      }
      return !1;
    },
    environ_get: (a, b) => {
      var c = 0;
      qc().forEach((d, e) => {
        var f = b + c;
        e = I[a + 4 * e >> 2] = f;
        for (f = 0; f < d.length; ++f) {
          D[e++] = d.charCodeAt(f);
        }
        D[e] = 0;
        c += d.length + 1;
      });
      return 0;
    },
    environ_sizes_get: (a, b) => {
      var c = qc();
      I[a >> 2] = c.length;
      var d = 0;
      c.forEach(e => d += e.length + 1);
      I[b >> 2] = d;
      return 0;
    },
    fd_close: () => 52,
    fd_seek: function () {
      return 70;
    },
    fd_write: (a, b, c, d) => {
      for (var e = 0, f = 0; f < c; f++) {
        var l = I[b >> 2],
          g = I[b + 4 >> 2];
        b += 8;
        for (var p = 0; p < g; p++) {
          var m = E[l + p],
            q = rc[a];
          0 === m || 10 === m ? ((1 === a ? ua : va)($b(q, 0)), q.length = 0) : q.push(m);
        }
        e += g;
      }
      I[d >> 2] = e;
      return 0;
    },
    strftime_l: (a, b, c, d) => wc(a, b, c, d)
  },
  Z = function (_k$monitorRunDependen2) {
    function a(c) {
      var _k$monitorRunDependen;
      Z = c.exports;
      xa = Z.memory;
      Da();
      Gb = Z.__indirect_function_table;
      Fa.unshift(Z.__wasm_call_ctors);
      J--;
      (_k$monitorRunDependen = k.monitorRunDependencies) === null || _k$monitorRunDependen === void 0 || _k$monitorRunDependen.call(k, J);
      0 == J && (null !== Ia && (clearInterval(Ia), Ia = null), Ja && (c = Ja, Ja = null, c()));
      return Z;
    }
    var b = {
      env: Ac,
      wasi_snapshot_preview1: Ac
    };
    J++;
    (_k$monitorRunDependen2 = k.monitorRunDependencies) === null || _k$monitorRunDependen2 === void 0 || _k$monitorRunDependen2.call(k, J);
    if (k.instantiateWasm) {
      try {
        return k.instantiateWasm(b, a);
      } catch (c) {
        va("Module.instantiateWasm callback failed with error: ".concat(c)), ba(c);
      }
    }
    Ma || (Ma = La("canvas_advanced.wasm") ? "canvas_advanced.wasm" : k.locateFile ? k.locateFile("canvas_advanced.wasm", w) : w + "canvas_advanced.wasm");
    Qa(b, function (c) {
      a(c.instance);
    }).catch(ba);
    return {};
  }(),
  U = a => (U = Z.free)(a),
  zc = a => (zc = Z.malloc)(a),
  ab = a => (ab = Z.__getTypeName)(a);
k.dynCall_jiji = (a, b, c, d, e) => (k.dynCall_jiji = Z.dynCall_jiji)(a, b, c, d, e);
k.dynCall_viijii = (a, b, c, d, e, f, l) => (k.dynCall_viijii = Z.dynCall_viijii)(a, b, c, d, e, f, l);
k.dynCall_iiiiij = (a, b, c, d, e, f, l) => (k.dynCall_iiiiij = Z.dynCall_iiiiij)(a, b, c, d, e, f, l);
k.dynCall_iiiiijj = (a, b, c, d, e, f, l, g, p) => (k.dynCall_iiiiijj = Z.dynCall_iiiiijj)(a, b, c, d, e, f, l, g, p);
k.dynCall_iiiiiijj = (a, b, c, d, e, f, l, g, p, m) => (k.dynCall_iiiiiijj = Z.dynCall_iiiiiijj)(a, b, c, d, e, f, l, g, p, m);
var Bc;
Ja = function Cc() {
  Bc || Dc();
  Bc || (Ja = Cc);
};
function Dc() {
  function a() {
    if (!Bc && (Bc = !0, k.calledRun = !0, !ya)) {
      Ra(Fa);
      aa(k);
      if (k.onRuntimeInitialized) {
        k.onRuntimeInitialized();
      }
      if (k.postRun) {
        for ("function" == typeof k.postRun && (k.postRun = [k.postRun]); k.postRun.length;) {
          var b = k.postRun.shift();
          Ga.unshift(b);
        }
      }
      Ra(Ga);
    }
  }
  if (!(0 < J)) {
    if (k.preRun) {
      for ("function" == typeof k.preRun && (k.preRun = [k.preRun]); k.preRun.length;) {
        Ha();
      }
    }
    Ra(Ea);
    0 < J || (k.setStatus ? (k.setStatus("Running..."), setTimeout(function () {
      setTimeout(function () {
        k.setStatus("");
      }, 1);
      a();
    }, 1)) : a());
  }
}
if (k.preInit) {
  for ("function" == typeof k.preInit && (k.preInit = [k.preInit]); 0 < k.preInit.length;) {
    k.preInit.pop()();
  }
}
Dc();
moduleRtn = ca;


  return moduleRtn;
}
);
})();
module.exports = Rive;;
