import { checkedBlobFetch } from '../../server/blob-fetch.js';
import { getStore } from '@netlify/blobs';
import { createOtaHandler } from '../../server/ota.js';
export default createOtaHandler({
  getStore:()=>getStore({name:'t100-ota',consistency:'strong',fetch:checkedBlobFetch}),
  token:()=>process.env.T100_OTA_UPLOAD_TOKEN,
});
export const config = {path:['/api/ota/latest','/api/ota/download/:sha']};
