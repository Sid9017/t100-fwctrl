'use strict';

/** Company ID in legacy manufacturer blocks (little-endian 0x00, 0x60). */
const MFG_COMPANY_ID = 0x6000;

/** Legacy manufacturer subtype `P` (version + product_id). */
const MFG_SUBTYPE_PRODUCT = 0x50;

/** product_id 0x00 in legacy mfg `P` payload (peer product line). */
const MFG_PRODUCT_ID_PEER = 0x00;
const PRODUCT_T100 = 0x01;

const T100_BOUND_NAME_RE = /^YD-[0-9a-f]{12}$/;

function asBufferMaybe(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item))) return Buffer.from(value);
  if (typeof value === 'string') {
    const hex = value.trim().replace(/^0x/i, '');
    if (hex.length % 2 === 0 && /^[0-9a-f]+$/i.test(hex)) return Buffer.from(hex, 'hex');
  }
  return null;
}

function base64BufferMaybe(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    return Buffer.from(value, 'base64');
  } catch (_) {
    return null;
  }
}

function collectManufacturerData(device) {
  const advertisement = (device && device.advertisement) || {};
  const out = [];
  const single = asBufferMaybe(advertisement.manufacturerData);
  if (single) out.push({ companyId: null, data: single });
  if (typeof advertisement.manufacturerDataHex === 'string') {
    const data = asBufferMaybe(advertisement.manufacturerDataHex);
    if (data) out.push({ companyId: null, data });
  }
  if (Array.isArray(advertisement.manufacturerData)) {
    for (const item of advertisement.manufacturerData) {
      if (item && typeof item === 'object' && !Buffer.isBuffer(item) && !(item instanceof Uint8Array) && !Array.isArray(item)) {
        const data =
          asBufferMaybe(item.dataHex) ||
          base64BufferMaybe(item.dataBase64) ||
          asBufferMaybe(item.data) ||
          base64BufferMaybe(item.data);
        out.push({
          companyId: typeof item.companyId === 'number' ? item.companyId : null,
          data,
        });
      } else {
        const data = asBufferMaybe(item);
        if (data) out.push({ companyId: null, data });
      }
    }
  }
  return out.filter((entry) => entry.data && entry.data.length > 0);
}

function parseLegacyAdvProductFromData(data, companyId = null) {
  if (!data || data.length < 3) return null;

  if (companyId === MFG_COMPANY_ID && data[0] === MFG_SUBTYPE_PRODUCT) {
    return {
      subtype: MFG_SUBTYPE_PRODUCT,
      version: data[1],
      productId: data[2],
      ...(data[1] === 2 && data.length >= 4 ? { shellId: data[3] } : {}),
    };
  }

  if (data.length >= 5 && data[0] === 0x00 && data[1] === 0x60 && data[2] === MFG_SUBTYPE_PRODUCT) {
    return {
      subtype: MFG_SUBTYPE_PRODUCT,
      version: data[3],
      productId: data[4],
      ...(data[3] === 2 && data.length >= 6 ? { shellId: data[5] } : {}),
    };
  }

  return null;
}

function parseLegacyAdvProduct(device) {
  for (const entry of collectManufacturerData(device)) {
    const parsed = parseLegacyAdvProductFromData(entry.data, entry.companyId);
    if (parsed) return parsed;
  }
  return null;
}

function isT100ScanName(name) {
  const trimmed = String(name || '').trim();
  return T100_BOUND_NAME_RE.test(trimmed);
}

/**
 * Keep only T100 advertisers.
 * Identity-ready devices use `YD-<12 hex>` and require mfg `P` product_id = 0x01.
 */
function matchesT100ScanFilter(device, ui = null) {
  const name = String((ui && ui.name) || (device && device.name) || '').trim();
  const product = parseLegacyAdvProduct(device);

  if (product && product.productId === MFG_PRODUCT_ID_PEER) {
    return false;
  }

  if (!T100_BOUND_NAME_RE.test(name)) {
    return false;
  }

  return !!product && product.productId === PRODUCT_T100;
}

function productIdLabel(productId) {
  if (productId === PRODUCT_T100) return 'T100';
  if (productId === MFG_PRODUCT_ID_PEER) return 'peer';
  if (productId == null) return '—';
  return `0x${Number(productId).toString(16).padStart(2, '0')}`;
}

module.exports = {
  MFG_COMPANY_ID,
  MFG_SUBTYPE_PRODUCT,
  MFG_PRODUCT_ID_PEER,
  PRODUCT_T100,
  collectManufacturerData,
  parseLegacyAdvProductFromData,
  parseLegacyAdvProduct,
  isT100ScanName,
  matchesT100ScanFilter,
  productIdLabel,
};
