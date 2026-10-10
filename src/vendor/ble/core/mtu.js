'use strict';
const DEFAULT_MTU_FALLBACK=512, MTU_PROBE_MAX_MS=1000;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForNegotiatedMtu(connection, { minMtu = 24, maxWaitMs = MTU_PROBE_MAX_MS } = {}) {
  const native = connection && connection.native;
  const t0 = Date.now();
  while (Date.now() - t0 < maxWaitMs) {
    const m = native && native.mtu;
    if (typeof m === 'number' && m >= minMtu) {
      return { mtu: m, negotiated: true, waitMs: Date.now() - t0 };
    }
    await delay(40);
  }
  return { mtu: DEFAULT_MTU_FALLBACK, negotiated: false, waitMs: maxWaitMs };
}

module.exports={waitForNegotiatedMtu};
