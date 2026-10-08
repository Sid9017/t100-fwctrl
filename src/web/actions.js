import { Buffer } from 'buffer';
import { rasterFoodPng } from './assets.js';
import containerWire from '../vendor/ble/core/fee0-container-weight-wire.js';
import protocol from '../vendor/ble/protocol/index.js';
import navigationWire from '../vendor/ble/core/fee0-ui-nav-wire.js';
import notifyWire from '../vendor/ble/core/fee0-notify-wire.js';
import notifyUpload from '../vendor/ble/core/fee0-notify-upload.js';
import historyWire from '../vendor/ble/core/fee0-kcal-hist-wire.js';
import morphUpload from '../vendor/ble/morph_theme/upload.js';
import chunkx from '../vendor/ble/oad/chunkx.js';
import scaleWire from '../vendor/ble/core/fee0-scale-wire.js';
import recipeWire from '../vendor/ble/core/fee0-coffee-recipe-wire.js';
import profileWire from '../vendor/ble/core/fee0-weighing-profile-wire.js';
import lightWire from '../vendor/ble/core/fee0-light-control-wire.js';
import oadDownload from '../vendor/ble/oad/download.js';
const { buildContainerWeightPayload } = containerWire;

const { GATT, TOPICS, UI_NAV_TARGETS } = protocol;
const {
  buildFee0CountdownUpdateSequence,
  buildFee0UiNavPayload,
} = navigationWire;
const {
  NOTIFY_BMP_BYTES_MAX,
  NOTIFY_UTC_IMMEDIATE,
} = notifyWire;
const {
  uploadNotifyBitmap,
  estimateNotifyUploadTimeoutMs,
} = notifyUpload;
const {
  buildKcalHistRecordPayload,
  buildKcalHistImageBeginPayload,
  buildKcalHistImageCommitPayload,
  buildKcalHistChunkSequence,
  crc32: kcalHistCrc32,
  estimateKcalHistActionTimeoutMs,
  maxKcalHistChunkData,
  normalizeTimestampUtc,
  resolveKcalHistUuid,
  resolveKcalHistChunkDataMax,
} = historyWire;
const {
  uploadMorphTheme,
  estimateMorphThemeUploadTimeoutMs,
  resolveChunkDataMax,
} = morphUpload;
const { waitForNegotiatedMtu } = chunkx;

const { formatFee0ScaleReading, FEE0_SCALE_UNIT_G, FEE0_SCALE_UNIT_OZ } = scaleWire;
const { buildCoffeeRecipePayload } = recipeWire;
const {
  buildWeighingProfilePayload,
} = profileWire;
const { buildLightControlPayload } = lightWire;
const { runOadDownload } = oadDownload;
const VENDOR_TOPIC_SETTLE_MS=400, KCAL_HIST_CHUNK_SETTLE_MS=10,
KCAL_HIST_MTU_PROBE_MS=1000, MORPH_THEME_CHUNK_SETTLE_MS=10,
MORPH_THEME_MTU_PROBE_MS=1000, GATT_ACTION_TIMEOUT_MS=15000;
const GATT_WRITE_TYPE={WITH_RESPONSE:'withResponse',WITHOUT_RESPONSE:'withoutResponse'};
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** In-place log progress bar for chunk uploads, e.g. `[████░░░░] 4/10 40%`. */
function formatChunkProgressBar(done, total, width = 20) {
  const t = Math.max(0, Number(total) || 0);
  const d = Math.max(0, Math.min(t, Number(done) || 0));
  if (t <= 0) return `[${'░'.repeat(width)}] 0/0 0%`;
  const filled = Math.round((d / t) * width);
  const bar = `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
  const pct = Math.floor((d / t) * 100);
  return `[${bar}] ${d}/${t} ${pct}%`;
}

function throwIfGattAborted(abortRef, label = 'GATT action') {
  if (abortRef && abortRef.aborted) {
    throw new Error(`${label} aborted after timeout`);
  }
}

function fee0TopicPublic(topicByte) {
  return topicByte === TOPICS.factoryReset
    || topicByte === TOPICS.bindCommit
    || topicByte === TOPICS.lightControl;
}

function fee0WrapWithAuthIfNeeded(buf, auth8) {
  const payload = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (payload.length < 1 || fee0TopicPublic(payload[0])) {
    return payload;
  }
  if (!auth8 || auth8.length !== 8) {
    throw new Error('Local auth record is missing; bind first');
  }
  return Buffer.concat([payload.subarray(0, 1), auth8, payload.subarray(1)]);
}

/** Every non-public FEE0 topic requires the session auth prefix. */
function buildFee0VendorWirePayload(payload, { auth8 }) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (buf.length < 1) {
    throw new Error('vendor payload is empty');
  }
  if (fee0TopicPublic(buf[0])) {
    return buf;
  }
  if (!auth8 || auth8.length !== 8) {
    throw new Error('Local auth record is missing; bind first');
  }
  return fee0WrapWithAuthIfNeeded(buf, auth8);
}


export { buildFee0VendorWirePayload, fee0TopicPublic };
export class DeviceActions {
  async scaleTare() {
    return this.runGattAction('Tare', async () => {
      await this.writeVendorPayloadWithOptionalAuth([TOPICS.scaleTare]);
      return {
        ok: true,
        message: 'Tare command sent',
      };
    });
  }

  async scaleSetUnit(unitByte) {
    const unit = Number(unitByte);
    if (unit !== FEE0_SCALE_UNIT_G && unit !== FEE0_SCALE_UNIT_OZ) {
      throw new Error('Toggle unit failed: invalid unit');
    }
    const label = unit === FEE0_SCALE_UNIT_OZ ? 'Toggle unit to oz' : 'Toggle unit to g';
    return this.runGattAction(label, async () => {
      await this.writeVendorPayloadWithOptionalAuth([TOPICS.scaleUnit, unit]);
      return {
        ok: true,
        message: `${label} command sent`,
      };
    });
  }

  async scaleToggleUnit(currentUnit = null) {
    const nextUnit =
      currentUnit === FEE0_SCALE_UNIT_OZ ? FEE0_SCALE_UNIT_G : FEE0_SCALE_UNIT_OZ;
    return this.scaleSetUnit(nextUnit);
  }

  async navigateToScale() {
    return this.runGattAction('Navigate to scale', async () => {
      await this.writeVendorPayloadWithOptionalAuth(
        buildFee0UiNavPayload(UI_NAV_TARGETS.scale)
      );
      return {
        ok: true,
        message: 'Navigate-to-scale command sent',
      };
    });
  }

  async scaleSetCoffeeRecipe(recipe = {}) {
    const payload = buildCoffeeRecipePayload(recipe);
    const label = recipe.persist ? 'Persist coffee recipe' : 'Preview coffee recipe';
    return this.runGattAction(label, async () => {
      await this.writeVendorPayloadWithOptionalAuth(payload);
      return {
        ok: true,
        message: `${label} sent`,
      };
    });
  }

  async scaleSetWeighingProfile(profile = {}) {
    const payload = buildWeighingProfilePayload(profile);
    return this.runGattAction('Persist scale mode', async () => {
      await this.writeVendorPayloadWithOptionalAuth(payload);
      return {
        ok: true,
        message: 'Scale mode saved; it applies on the next scale entry',
      };
    });
  }

  async setContainerWeight(setting = {}) {
    const payload = buildContainerWeightPayload(setting);
    return this.runGattAction('Set KCal container weight', async () => {
      await this.writeVendorPayloadWithOptionalAuth(payload);
      return { ok: true, message: payload[2]
        ? `Container weight command sent: ${payload.readUInt32LE(3) / 1000} g (KCal only, until Reset or reboot)`
        : 'Clear container weight command sent' };
    });
  }

  async setLightControl(control = {}) {
    const payload = buildLightControlPayload(control);
    return this.runGattAction('Set lights', async () => {
      await this.writeVendorPayloadWithOptionalAuth(payload);
      return {
        ok: true,
        message: `Lights updated: mask=0x${payload[2].toString(16)}, brightness=${payload[3]}%`,
      };
    });
  }

  async scaleUpdateKcal({ currentKcal, targetKcal } = {}) {
    const [target, current, navigate] = buildFee0CountdownUpdateSequence({
      currentKcal,
      targetKcal,
    });
    return this.runGattAction('Countdown update', async () => {
      const { connection, entry } = this.requireConnectedEntry();
      const { services, characteristics } = await this.discoverAll(connection);
      const { auth8 } = await this.runFeeSessionAuth(connection, entry, characteristics, true);
      const wireCurrent = buildFee0VendorWirePayload(current, { auth8 });
      const wireTarget = buildFee0VendorWirePayload(target, { auth8 });
      const wireNavigate = buildFee0VendorWirePayload(navigate, { auth8 });
      await this.session.writeVendorPayload(connection, wireTarget, {
        requireWriteResponse: true,
      });
      await delay(VENDOR_TOPIC_SETTLE_MS);
      await this.session.writeVendorPayload(connection, wireCurrent, {
        requireWriteResponse: true,
      });
      await delay(VENDOR_TOPIC_SETTLE_MS);
      await this.session.writeVendorPayload(connection, wireNavigate, {
        requireWriteResponse: true,
      });
      return {
        ok: true,
        message: `Countdown updated and opened: current ${Number(currentKcal)}, target ${Number(targetKcal)}`,
      };
    });
  }

  async notifyDisplay({ colorRgb565, text, gray, utc } = {}) {
    let grayBuf;
    if (gray != null) {
      grayBuf = Buffer.from(gray);
      if (grayBuf.length === 0 || grayBuf.length > NOTIFY_BMP_BYTES_MAX ||
          grayBuf.length % 24 !== 0) {
        throw new Error(
          `Notify gray must be 24×H bytes (1..${NOTIFY_BMP_BYTES_MAX})`
        );
      }
    } else {
      throw new Error('Notify display requires rendered gray bitmap from renderer');
    }
    const label = text == null ? '' : String(text);
    const utcN = utc == null ? NOTIFY_UTC_IMMEDIATE : Number(utc);
    const grayH = grayBuf.length / 24;
    this._actionLog(
      `Notify: gray payload accepted (24×${grayH}, ${grayBuf.length} B); waiting for GATT slot`
    );
    const actionTimeoutMs = estimateNotifyUploadTimeoutMs(
      grayBuf,
      23,
      8,
      {
        mtuProbeMs: MORPH_THEME_MTU_PROBE_MS,
        topicSettleMs: VENDOR_TOPIC_SETTLE_MS,
        commitSlackMs: 10000,
        // discoverAll + optional FEE session auth run inside the timed action.
        authDiscoverMs: 8000,
      }
    );

    return this.runGattAction('Notify display', async (abortRef) => {
      this._actionLog(
        `Notify: GATT action started (timeout budget ${actionTimeoutMs} ms; includes auth/MTU/upload)`
      );
      const { connection, entry } = this.requireConnectedEntry();
      const { services, characteristics } = await this.discoverAll(connection);
      throwIfGattAborted(abortRef, 'Notify display');
      const { auth8 } = await this.runFeeSessionAuth(connection, entry, characteristics, true);
      throwIfGattAborted(abortRef, 'Notify display');
      const wrapPayload = (payload) =>
        buildFee0VendorWirePayload(payload, { auth8 });

      const mtuProbe = await waitForNegotiatedMtu(connection, {
        minMtu: 23,
        maxWaitMs: MORPH_THEME_MTU_PROBE_MS,
      });
      throwIfGattAborted(abortRef, 'Notify display');

      this._actionLog('Notify: GATT send start (BEGIN→CHUNK→COMMIT)');
      const result = await uploadNotifyBitmap(this.session, connection, {
        gray: grayBuf,
        colorRgb565,
        utc: utcN,
        wrapPayload,
        writeOpts: { requireWriteResponse: true },
        delay,
        mtuProbe,
        chunkSettleMs: 8,
        topicSettleMs: VENDOR_TOPIC_SETTLE_MS,
        onProgress: (stage) => {
          throwIfGattAborted(abortRef, 'Notify display');
          this._actionLog(`Notify: ${stage}`);
        },
        onChunkProgress: (done, total) => {
          throwIfGattAborted(abortRef, 'Notify display');
          this._actionLog(
            `Notify: chunks ${formatChunkProgressBar(done, total)}`,
            { progressKey: 'notify-chunks' }
          );
        },
        abortRef,
      });
      throwIfGattAborted(abortRef, 'Notify display');
      this._actionLog(
        `Notify: GATT send complete (${result.chunkCount} chunks, ${result.payloadBytes} B)`
      );

      const mode = utcN === NOTIFY_UTC_IMMEDIATE ? 'immediate' : `utc=${utcN}`;
      return {
        ok: true,
        message:
          `Notify sent (${mode}): "${label}" ` +
          `crc=0x${(result.payloadCrc32 >>> 0).toString(16)} ` +
          `${result.chunkCount} chunks`,
        ...result,
      };
    }, actionTimeoutMs);
  }

  async appendKcalHist({ kcal, weight, unit, foodFile, foodFiles, noImage,
    uuid, timestampUtc, rating = 4 } = {}) {
    const kcalN = Number(kcal), weightN = Number(weight);
    const unitByte = unit === 'oz' || Number(unit) === 1 ? FEE0_SCALE_UNIT_OZ : FEE0_SCALE_UNIT_G;
    const recordUuid = resolveKcalHistUuid(uuid);
    const timestamp = normalizeTimestampUtc(timestampUtc == null ? Math.floor(Date.now() / 1000) : timestampUtc);
    const files = foodFiles === undefined ? (noImage ? [] : [foodFile]) : foodFiles;
    if (!Array.isArray(files) || files.length > 3 || files.some(file => !file)) {
      throw new Error('Select up to three 40x40 photos');
    }
    const images = await Promise.all(files.map(async file => {
      const raster = await rasterFoodPng(String(file));
      if (raster.wx !== 40 || raster.wy !== 40) throw new Error('Each photo must remain 40x40 pixels');
      return raster.bytes;
    }));
    const record = buildKcalHistRecordPayload({ uuid: recordUuid, timestampUtc: timestamp,
      kcal: kcalN, weight: weightN, unit: unitByte, hasImage: images.length > 0,
      rating: Number(rating), photoCount: images.length });
    const timeout = Math.max(GATT_ACTION_TIMEOUT_MS, images.length * estimateKcalHistActionTimeoutMs(
      Math.ceil(4800 / maxKcalHistChunkData(23)), KCAL_HIST_CHUNK_SETTLE_MS));
    return this.runGattAction('Append Kcal hist', async abortRef => {
      const { connection, entry } = this.requireConnectedEntry();
      const { characteristics } = await this.discoverAll(connection);
      const { auth8 } = await this.runFeeSessionAuth(connection, entry, characteristics, true);
      const wrap = payload => buildFee0VendorWirePayload(payload, { auth8 });
      const write = async payload => {
        throwIfGattAborted(abortRef, 'Append Kcal hist');
        await this.session.writeVendorPayload(connection, wrap(payload), { requireWriteResponse: true });
      };
      const mtu = await waitForNegotiatedMtu(connection, { minMtu: 23, maxWaitMs: KCAL_HIST_MTU_PROBE_MS });
      this._actionLog(`Append kcal: ${recordUuid}, rating=${rating}, photos=${images.length}`);
      await write(record);
      await delay(VENDOR_TOPIC_SETTLE_MS);
      for (let photoIndex = 0; photoIndex < images.length; photoIndex++) {
        const bytes = images[photoIndex];
        await write(buildKcalHistImageBeginPayload({ uuid: recordUuid, timestampUtc: timestamp,
          wx: 40, wy: 40, totalLen: bytes.length, payloadCrc32: kcalHistCrc32(bytes), photoIndex }));
        await delay(VENDOR_TOPIC_SETTLE_MS);
        const chunks = buildKcalHistChunkSequence(bytes, resolveKcalHistChunkDataMax(mtu));
        for (let i = 0; i < chunks.length; i++) {
          await write(chunks[i]);
          this._actionLog(`Photo ${photoIndex + 1}/${images.length}: ${formatChunkProgressBar(i + 1, chunks.length)}`,
            { progressKey: 'kcal-chunks' });
          if (i + 1 < chunks.length) await delay(KCAL_HIST_CHUNK_SETTLE_MS);
        }
        await delay(VENDOR_TOPIC_SETTLE_MS);
        await write(buildKcalHistImageCommitPayload(recordUuid, timestamp));
        await delay(VENDOR_TOPIC_SETTLE_MS);
      }
      this._actionLog('Append kcal: all history payloads sent');
      return { ok: true, uuid: recordUuid, timestampUtc: timestamp,
        message: `Kcal history submitted: ${kcalN} kcal, rating ${rating}/5, ${images.length} photos` };
    }, timeout);
  }

  async _uploadBindEmotion(connection, entry, characteristics, preset, abortRef) {
    const { loaded, themeId: themeIdN } = preset;
    const revN = loaded.revision;
    const writeOpts = { requireWriteResponse: true };
    const { auth8 } = await this.runFeeSessionAuth(connection, entry, characteristics, true);
    const wrapPayload = (payload) => buildFee0VendorWirePayload(payload, { auth8 });
    const themeIdChar = this.pickThemeIdChar(characteristics);
    if (!themeIdChar) {
      throw new Error('Set theme failed: FEE4 theme ID characteristic not found');
    }
    const themeIdWriteType = this.writeTypeFromCharacteristic(themeIdChar);
    if (themeIdWriteType !== GATT_WRITE_TYPE.WITH_RESPONSE) {
      throw new Error('Set theme failed: FEE4 theme ID is not writable with response');
    }
    const writeThemeId = (value) =>
      this.adapter.writeCharacteristic(
        connection,
        themeIdChar,
        Buffer.concat([auth8, Buffer.from(value)]),
        themeIdWriteType
      );

    const mtuProbe = await waitForNegotiatedMtu(connection, {
      minMtu: 23,
      maxWaitMs: MORPH_THEME_MTU_PROBE_MS,
    });
    throwIfGattAborted(abortRef, 'Set Theme');
    const chunkDataMax = resolveChunkDataMax(mtuProbe);

    this._actionLog('Set theme: GATT send start (BEGIN→CHUNK→COMMIT→FEE4)');
    const result = await uploadMorphTheme(this.session, connection, {
      payload: loaded.payload,
      revision: revN,
      themeId: themeIdN,
      writeOpts,
      delay,
      mtuProbe,
      chunkSettleMs: MORPH_THEME_CHUNK_SETTLE_MS,
      topicSettleMs: VENDOR_TOPIC_SETTLE_MS,
      wrapPayload,
      writeThemeId,
      onProgress: (stage) => {
        throwIfGattAborted(abortRef, 'Set Theme');
        this._actionLog(`Set theme: ${stage}`);
      },
      onChunkProgress: (done, total) => {
        throwIfGattAborted(abortRef, 'Set Theme');
        this._actionLog(
          `Set theme: chunks ${formatChunkProgressBar(done, total)}`,
          { progressKey: 'morph-chunks' }
        );
      },
      abortRef,
    });
    throwIfGattAborted(abortRef, 'Bind');

    return { chunkCount: result.chunkCount, themeId: themeIdN };
  }

}
