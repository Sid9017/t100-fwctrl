import { checkedBlobFetch } from '../../server/blob-fetch.js';
import { getStore } from '@netlify/blobs';
import { createSignedOtaHandler } from '../../server/signed-ota.js';
export default createSignedOtaHandler({
  getStore:()=>getStore({name:'t100-signed-ota',consistency:'strong',fetch:checkedBlobFetch}),
  token:()=>process.env.T100_OTA_UPLOAD_TOKEN,
});
export const config={path:['/api/ota/signed/latest','/api/ota/signed/download/:sha/:manifestSha','/api/ota/signed/manifest/:sha/:manifestSha']};
