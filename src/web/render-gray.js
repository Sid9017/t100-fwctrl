'use strict';

/**
 * Render notify text to 24×H 8-bit grayscale (black bg, white ink).
 * H grows with measured text width up to H_MAX. When text is wider than
 * H_MAX (common for bold CJK: advance > em), shrink font so the full string
 * still fits — never clip mid-glyph at the canvas edge.
 */
(function (root, factory) {
  root.NotifyRender = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const NOTIFY_BMP_W = 24;
  /** Aligned with firmware RAM budget: 24×212 gray (~15 CJK @ ≤14px). */
  const NOTIFY_BMP_H_MAX = 212;
  const NOTIFY_FONT_PX = 14;
  const NOTIFY_FONT_PX_MIN = 8;
  const NOTIFY_FONT_FAMILY =
    '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif';

  function createCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(w, h);
    }
    if (typeof document !== 'undefined') {
      const el = document.createElement('canvas');
      el.width = w;
      el.height = h;
      return el;
    }
    throw new Error('Notify render requires canvas (run in renderer)');
  }

  function fontCss(px) {
    return `bold ${px}px ${NOTIFY_FONT_FAMILY}`;
  }

  /**
   * Pick the largest font ≤ NOTIFY_FONT_PX whose measured width fits in H_MAX.
   * @returns {{ fontPx: number, textW: number, bmpH: number }}
   */
  function fitTextMetrics(measureCtx, s) {
    let fontPx = NOTIFY_FONT_PX;
    let textW = 0;
    for (;;) {
      measureCtx.font = fontCss(fontPx);
      textW = Math.ceil(measureCtx.measureText(s).width);
      if (textW + 2 <= NOTIFY_BMP_H_MAX || fontPx <= NOTIFY_FONT_PX_MIN) {
        break;
      }
      fontPx -= 1;
    }
    const bmpH = Math.max(1, Math.min(NOTIFY_BMP_H_MAX, textW + 2));
    return { fontPx, textW, bmpH };
  }

  /**
   * @param {string} text
   * @returns {Uint8Array} length W*H (H ≤ H_MAX), row-major gray
   */
  function renderNotifyTextToGray(text) {
    const s = String(text == null ? '' : text).trim();
    if (!s) {
      throw new Error('Notify text is required');
    }

    const measureCanvas = createCanvas(1, 1);
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) {
      throw new Error('Notify render: 2d context unavailable');
    }

    const { fontPx, textW, bmpH } = fitTextMetrics(measureCtx, s);
    if (textW + 2 > NOTIFY_BMP_H_MAX) {
      throw new Error(
        `Notify text still exceeds H_MAX=${NOTIFY_BMP_H_MAX} at ${fontPx}px ` +
          `(need ~${textW + 2}px)`
      );
    }

    const canvas = createCanvas(NOTIFY_BMP_W, bmpH);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Notify render: 2d context unavailable');
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, NOTIFY_BMP_W, bmpH);
    ctx.fillStyle = '#ffffff';
    ctx.font = fontCss(fontPx);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    /*
     * Panel long axis = canvas Y. -90° runs text along the bubble.
     * scale(-1,1) un-mirrors glyphs on that axis (device-proven).
     * Left-align into the H band using measured textW (not bmpH), so
     * fit-to-H_MAX does not recenter/clip mid-string.
     */
    ctx.save();
    ctx.translate(NOTIFY_BMP_W / 2, bmpH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.scale(-1, 1);
    ctx.fillText(s, -(bmpH / 2 - 1), 0);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, NOTIFY_BMP_W, bmpH);
    const { data } = imageData;
    const out = new Uint8Array(NOTIFY_BMP_W * bmpH);
    let ink = 0;
    for (let i = 0; i < out.length; i += 1) {
      const o = i * 4;
      const g = Math.round(
        0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
      );
      out[i] = g;
      if (g >= 128) {
        ink += 1;
      }
    }
    if (ink < 16) {
      throw new Error(`Notify render too little ink (${ink} px)`);
    }
    return out;
  }

  return {
    NOTIFY_BMP_W,
    NOTIFY_BMP_H: NOTIFY_BMP_H_MAX,
    NOTIFY_BMP_H_MAX,
    NOTIFY_FONT_PX,
    NOTIFY_FONT_PX_MIN,
    fitTextMetrics,
    renderNotifyTextToGray,
  };
});
