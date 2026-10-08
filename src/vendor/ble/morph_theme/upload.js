'use strict';

const {
  buildBeginPayload,
  buildChunkSequence,
  buildCommitPayload,
  buildAbortPayload,
  buildFactoryPayload,
  buildThemeIdPayload,
  resolveChunkDataMax,
  estimateUploadTimeoutMs,
  maxChunkData,
} = require('./wire');

const DEFAULT_CHUNK_SETTLE_MS = 8;
const DEFAULT_TOPIC_SETTLE_MS = 20;

/**
 * Upload a V2 emotion resource pack or legacy mouth theme over FEE2/FEE3.
 *
 * @param {object} session - t100 session with writeVendorPayload()
 * @param {object} connection
 * @param {object} opts
 * @param {Buffer|Uint8Array} opts.payload - V2 resource bytes (actual length), or 1125 B legacy keyframes
 * @param {number} [opts.revision=1] - theme revision (uint32)
 * @param {number} [opts.themeId=1] - catalog theme ID (uint8, non-zero)
 * @param {object} [opts.writeOpts] - passed to writeVendorPayload
 * @param {function} [opts.delay] - async (ms) => void
 * @param {object|null} [opts.mtuProbe] - { mtu, negotiated }
 * @param {number} [opts.chunkSettleMs]
 * @param {number} [opts.topicSettleMs]
 * @param {function} [opts.onProgress] - (stage: string) => void
 * @param {function} [opts.onChunkProgress] - (done: number, total: number) => void
 * @param {function} [opts.wrapPayload] - (buf) => wire bytes with session auth
 * @param {function} opts.writeThemeId - writes FEE4 payload (id + crc)
 */
async function uploadMorphTheme(session, connection, opts = {}) {
  if (!session || typeof session.writeVendorPayload !== 'function') {
    throw new Error('session.writeVendorPayload required');
  }
  const {
    payload,
    revision = 1,
    themeId = 1,
    writeOpts = { requireWriteResponse: true },
    delay = async (ms) => new Promise((r) => setTimeout(r, ms)),
    mtuProbe = null,
    chunkSettleMs = DEFAULT_CHUNK_SETTLE_MS,
    topicSettleMs = DEFAULT_TOPIC_SETTLE_MS,
    onProgress = null,
    onChunkProgress = null,
    wrapPayload = (buf) => buf,
    writeThemeId = null,
    abortRef = null,
  } = opts;
  if (typeof writeThemeId !== 'function') {
    throw new Error('writeThemeId required');
  }

  const report = (stage) => {
    if (typeof onProgress === 'function') onProgress(stage);
  };
  const reportChunk = (done, total) => {
    if (typeof onChunkProgress === 'function') onChunkProgress(done, total);
  };
  const throwIfAborted = () => {
    if (abortRef && abortRef.aborted) {
      throw new Error('Morph theme upload aborted after timeout');
    }
  };

  const beginPayload = buildBeginPayload({ revision, payload });
  report('BEGIN writing');
  await session.writeVendorPayload(connection, wrapPayload(beginPayload), {
    ...writeOpts,
    refreshDownlink: true,
  });
  throwIfAborted();
  report('BEGIN written');
  await delay(topicSettleMs);

  const chunkDataMax = resolveChunkDataMax(mtuProbe);
  const chunks = buildChunkSequence(payload, chunkDataMax);
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
  await session.writeVendorPayload(connection, wrapPayload(buildCommitPayload()), writeOpts);
  report('COMMIT written');
  throwIfAborted();
  await delay(topicSettleMs);

  report('THEME_ID writing');
  await writeThemeId(buildThemeIdPayload({ themeId, payload }));
  report('THEME_ID written');

  return {
    ok: true,
    themeId,
    revision,
    payloadBytes: payload.length,
    chunkCount: chunks.length,
    chunkDataMax,
  };
}

async function abortMorphThemeUpload(session, connection, writeOpts = {}) {
  await session.writeVendorPayload(connection, buildAbortPayload(), writeOpts);
  return { ok: true };
}

async function factoryResetMorphTheme(session, connection, writeOpts = {}) {
  await session.writeVendorPayload(connection, buildFactoryPayload(), writeOpts);
  return { ok: true };
}

function estimateMorphThemeUploadTimeoutMs(
  payload,
  mtu = 23,
  chunkSettleMs = DEFAULT_CHUNK_SETTLE_MS,
  extras = {}
) {
  const chunks = buildChunkSequence(payload, maxChunkData(mtu));
  return estimateUploadTimeoutMs(chunks.length, chunkSettleMs, extras);
}

module.exports = {
  DEFAULT_CHUNK_SETTLE_MS,
  DEFAULT_TOPIC_SETTLE_MS,
  uploadMorphTheme,
  abortMorphThemeUpload,
  factoryResetMorphTheme,
  estimateMorphThemeUploadTimeoutMs,
  resolveChunkDataMax,
  buildChunkSequence,
  maxChunkData,
};
