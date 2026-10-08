import test from 'node:test';
import assert from 'node:assert/strict';
import { capability, scanError } from '../src/bluetooth.js';
test('insecure and unsupported browsers explain requirements', () => {
  assert.equal(capability({ isSecureContext: false, navigator: { bluetooth: { requestDevice() {} } } }).ok, false);
  assert.equal(capability({ isSecureContext: true, navigator: {} }).ok, false);
  assert.equal(capability({ isSecureContext: true, navigator: { bluetooth: { requestDevice() {} } } }).ok, true);
});
test('cancellation and permission failures produce English guidance', () => {
  assert.equal(scanError({name:'NotFoundError'}).kind,'info');
  assert.match(scanError({name:'SecurityError'}).message,/permissions/);
});
