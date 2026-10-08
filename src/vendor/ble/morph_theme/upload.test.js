'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { PAYLOAD_BYTES, crc32 } = require('./protocol');
const { uploadMorphTheme } = require('./upload');

test('uploadMorphTheme writes crc-bound theme ID after commit', async () => {
  const writes = [];
  const themeIdWrites = [];
  const session = {
    async writeVendorPayload(_connection, payload) {
      writes.push(Buffer.from(payload));
    },
  };
  const payload = Buffer.alloc(PAYLOAD_BYTES, 0x3c);

  const result = await uploadMorphTheme(session, { id: 'device' }, {
    payload,
    revision: 7,
    themeId: 0x01,
    mtuProbe: { mtu: 512, negotiated: true },
    delay: async () => {},
    writeThemeId: async (value) => themeIdWrites.push(Buffer.from(value)),
  });

  assert.equal(result.themeId, 0x01);
  assert.equal(writes[0][0], 0x6a);
  assert.equal(writes.at(-1)[0], 0x6c);
  assert.equal(themeIdWrites.length, 1);
  assert.equal(themeIdWrites[0][0], 0x01);
  assert.equal(themeIdWrites[0].readUInt32LE(1), crc32(payload));
});
