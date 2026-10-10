'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const core = require('./index');

test('uuidMatchesShort accepts short, SIG base, and Beken base forms', () => {
  assert.equal(core.uuidMatchesShort('fee0', 'fee0'), true);
  assert.equal(core.uuidMatchesShort('0000fee0-0000-1000-8000-00805f9b34fb', 'fee0'), true);
  assert.equal(core.uuidMatchesShort('f000fee0-0451-4000-b000-000000000000', 'fee0'), true);
  assert.equal(core.uuidMatchesShort('2a26', 'fee0'), false);
});

test('findGattService resolves vendor FEE0 under Beken 128-bit UUID', () => {
  const services = [
    { uuid: 'f000fee0-0451-4000-b000-000000000000' },
    { uuid: 'fee0' },
  ];
  assert.equal(core.findGattService(services, 'fee0').uuid, 'f000fee0-0451-4000-b000-000000000000');
  assert.equal(
    core.findGattCharacteristic(
      [
        {
          serviceUuid: 'f000fee0-0451-4000-b000-000000000000',
          uuid: 'f000fee1-0451-4000-b000-000000000000',
        },
      ],
      'fee0',
      'fee1'
    ).uuid,
    'f000fee1-0451-4000-b000-000000000000'
  );
});

test('decodeDisUtf8 handles DIS firmware revision payload', () => {
  assert.equal(core.decodeDisUtf8(Buffer.from('T100_v1.2.3\0\0', 'utf8')), 'T100_v1.2.3');
});

test('vendor service and transfer characteristics accept short, SIG and Beken UUIDs',()=>{
  const forms=[id=>id,id=>`0000${id}-0000-1000-8000-00805f9b34fb`,id=>`f000${id}-0451-4000-b000-000000000000`];
  for(const serviceForm of forms) for(const charForm of forms){
    const service={uuid:serviceForm('fee0').toUpperCase()};
    assert.equal(core.findGattService([service],'fee0'),service);
    for(const id of ['fee1','fee3']){
      const char={serviceUuid:service.uuid,uuid:charForm(id).toUpperCase()};
      assert.equal(core.findGattCharacteristic([char],'fee0',id),char);
    }
  }
});
