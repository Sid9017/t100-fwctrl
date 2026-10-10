import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedBlobFetch} from '../server/blob-fetch.js';
test('SDK fetch guard rejects lost conditional writes but preserves CAS 412',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:500}));
  await assert.rejects(checkedBlobFetch('https://store.test',{method:'put'}),/write failed/);
  globalThis.fetch=async()=>new Response('',{status:412});assert.equal((await checkedBlobFetch('https://store.test',{method:'PUT'})).status,412);
});
