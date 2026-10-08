'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MFG_PRODUCT_ID_PEER,
  PRODUCT_T100,
  isT100ScanName,
  matchesT100ScanFilter,
  parseLegacyAdvProduct,
  productIdLabel,
} = require('./adv-filter');

test('parseLegacyAdvProduct reads mfg P block with company id', () => {
  const device = {
    advertisement: {
      manufacturerData: [
        {
          companyId: 0x6000,
          data: Buffer.from([0x50, 0x01, PRODUCT_T100]),
        },
      ],
    },
  };
  assert.deepEqual(parseLegacyAdvProduct(device), {
    subtype: 0x50,
    version: 0x01,
    productId: PRODUCT_T100,
  });
});

test('parseLegacyAdvProduct reads raw company + subtype layout', () => {
  const device = {
    advertisement: {
      manufacturerData: Buffer.from([0x00, 0x60, 0x50, 0x01, MFG_PRODUCT_ID_PEER]),
    },
  };
  assert.deepEqual(parseLegacyAdvProduct(device), {
    subtype: 0x50,
    version: 0x01,
    productId: MFG_PRODUCT_ID_PEER,
  });
});

test('isT100ScanName accepts only lowercase identity-derived names', () => {
  assert.equal(isT100ScanName('YD-T100-UNSET'), false);
  assert.equal(isT100ScanName('YD-02aabbccddee'), true);
  assert.equal(isT100ScanName('YD-TAPDOKI-UNSET'), false);
  assert.equal(isT100ScanName('YD-02AABBCCDDEE'), false);
});

test('matchesT100ScanFilter rejects peer product_id on shared bound name', () => {
  const device = {
    name: 'YD-02aabbccddee',
    advertisement: {
      manufacturerData: [{ companyId: 0x6000, data: Buffer.from([0x50, 0x01, MFG_PRODUCT_ID_PEER]) }],
    },
  };
  assert.equal(matchesT100ScanFilter(device), false);
});

test('matchesT100ScanFilter accepts T100 product on bound name', () => {
  const device = {
    name: 'YD-02aabbccddee',
    advertisement: {
      manufacturerData: [{ companyId: 0x6000, data: Buffer.from([0x50, 0x01, PRODUCT_T100]) }],
    },
  };
  assert.equal(matchesT100ScanFilter(device), true);
});

test('matchesT100ScanFilter rejects unset names', () => {
  const device = { name: 'YD-T100-UNSET', advertisement: {} };
  assert.equal(matchesT100ScanFilter(device), false);
});

test('productIdLabel maps known ids', () => {
  assert.equal(productIdLabel(PRODUCT_T100), 'T100');
  assert.equal(productIdLabel(MFG_PRODUCT_ID_PEER), 'peer');
});

test('v2 manufacturer data exposes Shell ID across adapter encodings', () => {
  for (const manufacturerData of [
    Buffer.from([0, 0x60, 0x50, 2, 1, 1]),
    [{ companyId: 0x6000, dataHex: '50020101' }],
    [{ companyId: 0x6000, dataBase64: Buffer.from([0x50, 2, 1, 1]).toString('base64') }],
  ]) {
    assert.equal(parseLegacyAdvProduct({ advertisement: { manufacturerData } }).shellId, 1);
  }
  for (const bytes of [[0x50, 1, 1], [0x50, 2, 1], [0x50, 3, 1, 9]]) {
    const parsed = parseLegacyAdvProduct({ advertisement: {
      manufacturerData: [{ companyId: 0x6000, data: Buffer.from(bytes) }],
    } });
    assert.equal(parsed.shellId, undefined);
  }
});
