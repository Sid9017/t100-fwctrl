import { Buffer } from 'buffer';
const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const mod = n => ((n % P) + P) % P;
function pow(base, exponent) {
  let result = 1n;
  for (; exponent; exponent >>= 1n, base = mod(base * base)) if (exponent & 1n) result = mod(result * base);
  return result;
}
export function decompressP256(publicKey) {
  if (publicKey.length !== 33 || ![2,3].includes(publicKey[0])) throw new Error('Invalid device public key');
  const x = BigInt(`0x${publicKey.subarray(1).toString('hex')}`);
  if (x >= P) throw new Error('Invalid device public key');
  const y2 = mod(x*x*x - 3n*x + B);
  let y = pow(y2, (P+1n)/4n);
  if (mod(y*y) !== y2) throw new Error('Invalid device public key');
  if (Number(y & 1n) !== (publicKey[0] & 1)) y = P-y;
  return Buffer.concat([Buffer.from([4]), publicKey.subarray(1), Buffer.from(y.toString(16).padStart(64,'0'),'hex')]);
}
export async function verifyAdmissionToken(token, now = Math.floor(Date.now()/1000)) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(s => !/^[A-Za-z0-9_-]+$/.test(s))) throw new Error('Invalid binding token');
  const [pub, payload, sig] = parts.map(s => Buffer.from(s.replaceAll('-','+').replaceAll('_','/'),'base64'));
  const publicHex = pub.toString('hex');
  if (sig.length !== 64 || payload.length < 16) throw new Error('Invalid binding token length');
  const key = await crypto.subtle.importKey('raw', decompressP256(pub), { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
  if (!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,sig,Buffer.from(`${parts[0]}.${parts[1]}`))) {
    throw new Error('Binding token signature verification failed');
  }
  const iat = payload.readUInt32LE(8), exp = payload.readUInt32LE(12);
  if (exp <= iat || exp-iat > 900 || now+120 < iat || now > exp+120) throw new Error('Binding token expired or device time is invalid. Reconnect to sync time.');
  const auth = payload.subarray(0,8);
  if (!auth.every(b => b >= 32 && b <= 126)) throw new Error('Invalid binding auth key');
  return { pub_key: publicHex, auth_key: auth.toString('ascii') };
}
