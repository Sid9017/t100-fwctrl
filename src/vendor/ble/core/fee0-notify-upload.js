'use strict';

const {
  buildBeginPayload,
  buildChunkSequence,
  buildCommitPayload,
  buildAbortPayload,
  resolveChunkDataMax,
  estimateUploadTimeoutMs,
  maxChunkData,
  NOTIFY_UTC_IMMEDIATE,
  assertGrayPayload,
  assertNotifyColor,
  assertNotifyUtc,
  crc32,
} = require('./fee0-notify-wire');

const DEFAULT_CHUNK_SETTLE_MS = 8;
const DEFAULT_TOPIC_SETTLE_MS = 20;

/**
 * Upload a 24×H gray notify bitmap over FEE2/FEE3 (BEGIN→CHUNK→COMMIT).
 *
 * @param {object} session - with writeVendorPayload(connection, payload, opts)
 * @param {object} connection
 * @param {object} opts
 * @param {Buffer|Uint8Array} opts.gray - 24×H gray (H <= 212)
 * @param {number} opts.colorRgb565
 * @param {number} [opts.utc=0xFFFFFFFF] - immediate when all FF
 * @param {function} [opts.wrapPayload] - (buf) => wire bytes (auth for every topic)
 * @param {object} [opts.writeOpts]
 * @param {function} [opts.delay]
 * @param {object|null} [opts.mtuProbe]
 * @param {number} [opts.chunkSettleMs]
 * @param {number} [opts.topicSettleMs]
 * @param {function} [opts.onProgress] - (stage: string) => void
 * @param {function} [opts.onChunkProgress] - (done: number, total: number) => void
 */
async function uploadNotifyBitmap(session, connection, opts = {}) {
  if (!session || typeof session.writeVendorPayload !== 'function') {
    throw new Error('session.writeVendorPayload required');
  }
  const {
    gray,
    colorRgb565,
    utc = NOTIFY_UTC_IMMEDIATE,
    wrapPayload = (buf) => buf,
    writeOpts = { requireWriteResponse: true },
    delay = async (ms) => new Promise((r) => setTimeout(r, ms)),
    mtuProbe = null,
    chunkSettleMs = DEFAULT_CHUNK_SETTLE_MS,
    topicSettleMs = DEFAULT_TOPIC_SETTLE_MS,
    onProgress = null,
    onChunkProgress = null,
    abortRef = null,
  } = opts;

  const report = (stage) => {
    if (typeof onProgress === 'function') onProgress(stage);
  };
  const reportChunk = (done, total) => {
    if (typeof onChunkProgress === 'function') onChunkProgress(done, total);
  };
  const throwIfAborted = () => {
    if (abortRef && abortRef.aborted) {
      throw new Error('Notify upload aborted after timeout');
    }
  };

  const grayBuf = assertGrayPayload(gray);
  const color = assertNotifyColor(colorRgb565);
  const utcN = assertNotifyUtc(utc);
  const payloadCrc32 = crc32(grayBuf);

  const beginPayload = wrapPayload(
    buildBeginPayload({
      utc: utcN,
      colorRgb565: color,
      payload: grayBuf,
      payloadCrc32,
    })
  );
  report('BEGIN writing');
  await session.writeVendorPayload(connection, beginPayload, {
    ...writeOpts,
    refreshDownlink: true,
  });
  throwIfAborted();
  report('BEGIN written');
  await delay(topicSettleMs);

  const chunkDataMax = resolveChunkDataMax(mtuProbe);
  const chunks = buildChunkSequence(grayBuf, chunkDataMax);
  reportChunk(0, chunks.length);
  for (let i = 0; i < chunks.length; i += 1) {
    throwIfAborted();
    await session.writeVendorPayload(connection, wrapPayload(chunks[i]), writeOpts);
    reportChunk(i + 1, chunks.length);
    if (i + 1 < chunks.length) {
      await delay(chunkSettleMs);
    }
  }
  throwIfAborted();
  await delay(topicSettleMs);

  throwIfAborted();
  report('COMMIT writing');
  await session.writeVendorPayload(
    connection,
    wrapPayload(buildCommitPayload()),
    writeOpts
  );
  report('COMMIT written');

  return {
    ok: true,
    utc: utcN,
    colorRgb565: color,
    payloadBytes: grayBuf.length,
    payloadCrc32,
    chunkCount: chunks.length,
    chunkDataMax,
  };
}

async function abortNotifyUpload(session, connection, writeOpts = {}) {
  await session.writeVendorPayload(connection, buildAbortPayload(), writeOpts);
  return { ok: true };
}

function estimateNotifyUploadTimeoutMs(
  gray,
  mtu = 23,
  chunkSettleMs = DEFAULT_CHUNK_SETTLE_MS,
  extras = {}
) {
  const chunks = buildChunkSequence(gray, maxChunkData(mtu));
  return estimateUploadTimeoutMs(chunks.length, chunkSettleMs, extras);
}

module.exports = {
  DEFAULT_CHUNK_SETTLE_MS,
  DEFAULT_TOPIC_SETTLE_MS,
  uploadNotifyBitmap,
  abortNotifyUpload,
  estimateNotifyUploadTimeoutMs,
  resolveChunkDataMax,
  buildChunkSequence,
  maxChunkData,
};
