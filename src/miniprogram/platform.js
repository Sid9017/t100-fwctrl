import {Buffer} from 'buffer';
import {p256} from '@noble/curves/nist.js';
import {sha256} from '@noble/hashes/sha2.js';
import {verifyAdmissionToken} from '../web/auth.js';
const bytesOf=data=>data instanceof ArrayBuffer?new Uint8Array(data):Uint8Array.from(data);
// Preserve WebCrypto's raw P-256 / IEEE-P1363 verification semantics.
export const miniSubtle={
  async digest(algorithm,data){if(algorithm!=='SHA-256')throw new Error('Unsupported digest');return Uint8Array.from(sha256(new Uint8Array(data))).buffer;},
  async importKey(format,raw,algorithm){if(format!=='raw'||algorithm.namedCurve!=='P-256')throw new Error('Unsupported key');const bytes=bytesOf(raw);p256.Point.fromBytes(bytes).assertValidity();return bytes;},
  async verify(algorithm,key,signature,data){if(algorithm.name!=='ECDSA'||algorithm.hash!=='SHA-256')throw new Error('Unsupported signature');return p256.verify(bytesOf(signature),bytesOf(data),key,{prehash:true,lowS:false});}
};
export const verifyMiniToken=token=>verifyAdmissionToken(token,Math.floor(Date.now()/1000),miniSubtle);
export function wxCall(api,name,options={},timeoutMs=20000){
  return new Promise((resolve,reject)=>{
    if(typeof api[name]!=='function'){reject(new Error(`${name} is unavailable. Update WeChat.`));return;}
    let settled=false,task;const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
    const timer=setTimeout(()=>{finish(reject,new Error(`${name} timed out`));task?.abort?.();},timeoutMs);
    try{task=api[name]({...options,success:value=>finish(resolve,value),fail:error=>finish(reject,new Error(error.errMsg||`${name} failed`))});}catch(error){finish(reject,error);}
  });
}
export function miniStorage(api){return {getItem:key=>api.getStorageSync(key)||null,setItem:(key,value)=>api.setStorageSync(key,value),removeItem:key=>api.removeStorageSync(key)};}
export async function randomUuid(api){
  const result=await wxCall(api,'getRandomValues',{length:16});const bytes=new Uint8Array(result.randomValues);
  if(bytes.length!==16)throw new Error('Secure random UUID generation failed');bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Buffer.from(bytes).toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function byteFile(name,bytes){const data=Uint8Array.from(bytes);return {name,size:data.length,arrayBuffer:async()=>data.slice().buffer};}
export async function readLocalFile(api,path,{text=false,max=1024*1024}={}){
  const fs=api.getFileSystemManager();const info=await wxCall(fs,'stat',{path});if(info.stats.size>max)throw new Error('Selected file is too large');
  const result=await wxCall(fs,'readFile',{filePath:path,...(text?{encoding:'utf8'}:{})});return text?result.data:new Uint8Array(result.data);
}
