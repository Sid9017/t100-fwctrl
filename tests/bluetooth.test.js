import test from 'node:test';
import assert from 'node:assert/strict';
import { capability, scanOptions, Scanner } from '../src/bluetooth.js';

test('browser filter accepts T100 v1/v2 and excludes peer products and other subtypes', () => {
  const { filters } = scanOptions();
  assert.equal(filters.length, 1); // Separate filters are OR, which would allow peer devices.
  assert.equal(filters[0].namePrefix, 'YD-');
  const rule = filters[0].manufacturerData[0];
  assert.equal(rule.companyIdentifier, 0x6000);
  for (const version of [1, 2]) {
    for (const product of [0, 1, 2]) {
      for (const subtype of [0x50, 0x51]) {
        const bytes = Buffer.from([subtype, version, product, 1]);
        const actual = rule.dataPrefix.every((value, i) => (value & rule.mask[i]) === (bytes[i] & rule.mask[i]));
        const expected = subtype === 0x50 && product === 0x01;
        assert.equal(actual, expected);
      }
    }
  }
});

test('insecure and unsupported browsers fail capability check', () => {
  assert.equal(capability({ isSecureContext: false, navigator: { bluetooth: { requestDevice() {} } } }).ok, false);
  assert.equal(capability({ isSecureContext: true, navigator: {} }).ok, false);
  assert.equal(capability({ isSecureContext: true, navigator: { bluetooth: { requestDevice() {} } } }).ok, true);
});

test('chooser opens synchronously, ignores overlapping scans and deduplicates selections', async () => {
  let finish;
  let requests = 0;
  const scanner = new Scanner({ requestDevice() {
    requests++;
    return new Promise((resolve) => { finish = resolve; });
  } });
  const pending = scanner.select();
  assert.equal(requests, 1);
  assert.equal(scanner.busy, true);
  assert.equal((await scanner.select()).kind, 'busy');
  const device = { id: 'browser-id', name: 'YD-012345abcdef', gatt: { connect() { throw new Error('Must not connect'); } } };
  finish(device);
  assert.equal((await pending).repeated, false);
  assert.equal(scanner.busy, false);
  const again = scanner.select();
  finish(device);
  assert.equal((await again).repeated, true);
  assert.equal(scanner.devices.size, 1);
  scanner.clear();
  assert.equal(scanner.devices.size, 0);
});

test('cancel, denied permission, unsupported filter and radio failure release the scan lock', async () => {
  for (const name of ['NotFoundError', 'NotAllowedError', 'SecurityError', 'TypeError', 'NotSupportedError', 'NetworkError', 'UnknownError']) {
    const scanner = new Scanner({ requestDevice() { throw Object.assign(new Error('failure'), { name }); } });
    const result = await scanner.select();
    assert.equal(result.kind, name === 'NotFoundError' ? 'info' : 'error');
    assert.equal(scanner.busy, false);
    assert.equal(scanner.devices.size, 0);
    assert.ok(result.message);
  }
});

test('invalid device identity cannot enter the list', async () => {
  for (const name of ['YD-peer', 'YD-012345ABCDEF', undefined, '<img src=x>']) {
    const scanner = new Scanner({ requestDevice: async () => ({ id: 'device', name }) });
    assert.equal((await scanner.select()).kind, 'error');
    assert.equal(scanner.devices.size, 0);
  }
});
