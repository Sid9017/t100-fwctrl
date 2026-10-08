'use strict';


const { GATT_WRITE_TYPE } = require('../adapters');
const { findGattCharacteristic, findGattService } = require('../core/uuids');
const { GATT } = require('../protocol');
const {
  OAD_BLOCK_PAYLOAD,
  OAD_FFC1_WRITE_LEN,
  OAD_FLASH_WORD,
  buildChunkxWriteBuffer,
  computeChunkxLayout,
  parseFfc3Notify,
  parseOadHeader,
  waitForNegotiatedMtu,
} = require('./chunkx');

const OAD_WRITE_TIMEOUT_MS = 180000;
const OAD_IDENTIFY_SETTLE_MS = 5000;
const OAD_ROUND_WAIT_FULL_MS = 5000;
const OAD_ROUND_WAIT_PARTIAL_MS = 120000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function charHas(characteristic, property) {
  return (characteristic && characteristic.properties ? characteristic.properties : []).includes(property);
}

function writeTypeFromWithoutResponse(withoutResponse) {
  return withoutResponse ? GATT_WRITE_TYPE.WITHOUT_RESPONSE : GATT_WRITE_TYPE.WITH_RESPONSE;
}

/**
 * Run OAD download on an existing GATT connection (FFC1/FFC3 payload only; no session_auth).
 * @param {object} opts
 * @param {import('../adapters').GattAdapter} opts.adapter
 * @param {object} opts.connection
 * @param {object[]} opts.services
 * @param {object[]} opts.characteristics
 * @param {string} opts.filePath
 * @param {(progress: number) => void} [opts.onProgress]
 */
async function runOadDownload({
  adapter,
  connection,
  services,
  characteristics,
  fileBuf,
  onProgress,
  abortRef,
}) {
  if (!Buffer.isBuffer(fileBuf)) throw new Error('Select an OAD firmware file');
  const hdr = parseOadHeader(fileBuf);
  const oadBlkTot = Math.floor(hdr.len / (OAD_BLOCK_PAYLOAD / OAD_FLASH_WORD));
  if (oadBlkTot <= 0 || oadBlkTot > 0xffff) {
    throw new Error(`Invalid OAD header: len(words)=0x${hdr.len.toString(16)}`);
  }
  const imgBytes = oadBlkTot * OAD_BLOCK_PAYLOAD;
  if (fileBuf.length < imgBytes) {
    throw new Error(`Firmware too small: need ${imgBytes} bytes, got ${fileBuf.length} bytes`);
  }

  const { mtu } = await waitForNegotiatedMtu(connection);
  const { framesPerChunk, chunkTot } = computeChunkxLayout(mtu, oadBlkTot);

  if (!findGattService(services, GATT.oad.service)) throw new Error('Device does not expose OAD service FFC0');
  const ffc1 = findGattCharacteristic(characteristics, GATT.oad.service, GATT.oad.imageIdentify);
  const ffc3 = findGattCharacteristic(characteristics, GATT.oad.service, GATT.oad.chunkX);
  if (!ffc1 || !ffc3) throw new Error('Device missing OAD FFC1/FFC3 characteristics');

  const ffc1NoResp = charHas(ffc1, 'writeWithoutResponse') && !charHas(ffc1, 'write');
  const ffc3NoResp = charHas(ffc3, 'writeWithoutResponse') && !charHas(ffc3, 'write');
  const notifyQ = [];
  const subs = [];
  let oadPeripheralGone = false;
  const onDisconnect = () => { oadPeripheralGone = true; };
  connection.native?.on?.('disconnect', onDisconnect);

  const report = (pct) => {
    if (typeof onProgress === 'function') onProgress(Math.max(0, Math.min(100, pct)));
  };
  report(0);

  try {
    subs.push(
      await adapter.subscribe(connection, ffc1, (data) => {
        notifyQ.push({ source: 'ffc1', data: Buffer.from(data) });
      })
    );
    subs.push(
      await adapter.subscribe(connection, ffc3, (data) => {
        notifyQ.push({ source: 'ffc3', data: Buffer.from(data) });
      })
    );

    const idBuf = Buffer.alloc(OAD_FFC1_WRITE_LEN, 0);
    fileBuf.copy(idBuf, 0, 0, Math.min(OAD_FFC1_WRITE_LEN, fileBuf.length));
    await adapter.writeCharacteristic(
      connection,
      ffc1,
      idBuf,
      writeTypeFromWithoutResponse(ffc1NoResp)
    );
    await delay(OAD_IDENTIFY_SETTLE_MS);
    for (let i = notifyQ.length - 1; i >= 0; i--) {
      const ev = notifyQ[i];
      if (ev.source === 'ffc1' && ev.data.length >= 10) {
        const v = ev.data.readUInt16LE(0);
        const L = ev.data.readUInt16LE(2);
        const u = ev.data.readUInt32LE(4);
        const rv = ev.data.readUInt16LE(8);
        throw new Error(
          `Image identify rejected ver=0x${v.toString(16)} len=0x${L.toString(16)} uid=0x${u.toString(16)} rom=0x${rv.toString(16)}`
        );
      }
    }

    let pendingResend = new Set();
    let outerRounds = 0;
    while (true) {
      if (abortRef?.aborted) throw new Error("OAD cancelled");
      outerRounds += 1;
      if (outerRounds > 500) throw new Error('Too many ChunkX retry rounds; check link or firmware');
      const batch =
        pendingResend.size > 0
          ? [...pendingResend].sort((a, b) => a - b)
          : Array.from({ length: chunkTot }, (_, i) => i + 1);
      pendingResend = new Set();
      const fullRound = batch.length === chunkTot && batch[0] === 1 && batch[batch.length - 1] === chunkTot;

      for (const seq of batch) {
        if (abortRef?.aborted || oadPeripheralGone) throw new Error("OAD connection lost or cancelled");
        const payload = buildChunkxWriteBuffer(chunkTot, seq, fileBuf, framesPerChunk, oadBlkTot);
        let writeTimer;
        try {
          await Promise.race([
            adapter.writeCharacteristic(connection, ffc3, payload, writeTypeFromWithoutResponse(ffc3NoResp)),
            new Promise((_, reject) => { writeTimer = setTimeout(() => reject(new Error(`FFC3 write timed out (seq=${seq}/${chunkTot})`)), OAD_WRITE_TIMEOUT_MS); }),
          ]);
        } finally { clearTimeout(writeTimer); }
        const endBlk = Math.min(seq * framesPerChunk, oadBlkTot);
        report(Math.min(99, (endBlk / oadBlkTot) * 100));
      }

      const waitMs = fullRound ? OAD_ROUND_WAIT_FULL_MS : OAD_ROUND_WAIT_PARTIAL_MS;
      const t0 = Date.now();
      let outcome = null;
      while (Date.now() - t0 < waitMs) {
        if (oadPeripheralGone && fullRound) {
          throw new Error('Device disconnected before OAD acknowledgement; reconnect and verify firmware');
        }
        if (abortRef?.aborted) throw new Error('OAD cancelled');
        const idx = notifyQ.findIndex((ev) => ev.source === 'ffc3');
        if (idx >= 0) {
          const ev = notifyQ.splice(idx, 1)[0];
          outcome = parseFfc3Notify(ev.data);
          if (outcome.kind === 'ack' || outcome.kind === 'loss') break;
        }
        await delay(25);
      }
      if (outcome && (outcome.kind === 'ack' || outcome.kind === 'reboot')) break;
      if (outcome && outcome.kind === 'loss') {
        for (const s of outcome.missing) {
          if (s >= 1 && s <= chunkTot) pendingResend.add(s);
        }
        if (pendingResend.size > 0) continue;
      }
      throw new Error('Timed out waiting for ChunkX confirm');
    }
    report(100);
    return {
      ok: true,

      blocks: oadBlkTot,
      chunks: chunkTot,
    };
  } finally {
    connection.native?.off?.('disconnect', onDisconnect);
    for (const sub of subs.reverse()) await sub.unsubscribe().catch(() => {});
  }
}

module.exports = {
  runOadDownload,
  parseOadHeader,
  packChunkxHeader: require('./chunkx').packChunkxHeader,
  parseFfc3Notify,
};
