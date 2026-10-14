const ALPHABET='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
// Firmware Code128B stores a single nine-symbol Base85 integer, not Z85 blocks.
// Split into uint32 halves: a 57-bit payload exceeds Number's exact range.
export function decodeProvisioningBarcode(value){
  const text=String(value??'').trim();
  const plain=/^YD-([0-9a-f]{12})(?:\s*\/\s*([0-9a-f]{2}))?$/i.exec(text);
  if(plain){if(!/^0[23]/i.test(plain[1]))throw new Error('Invalid device identity');return {name:'YD-'+plain[1].toLowerCase(),shellId:plain[2]?parseInt(plain[2],16):null};}
  if(text.length!==9)throw new Error('Scan the barcode shown on your KCALACK device.');
  let hi=0,lo=0;for(const char of text){const digit=ALPHABET.indexOf(char);if(digit<0)throw new Error('Invalid device barcode');const next=lo*85+digit;hi=hi*85+Math.floor(next/4294967296);lo=next%4294967296;}
  if(hi>=33554432)throw new Error('Invalid device barcode range');const schema=Math.floor(hi/131072);if(schema!==1)throw new Error('Unsupported device barcode version');
  const bytes=[2|((hi>>>16)&1),(hi>>>8)&255,hi&255,(lo>>>24)&255,(lo>>>16)&255,(lo>>>8)&255];
  return {schema,name:'YD-'+bytes.map(b=>b.toString(16).padStart(2,'0')).join(''),shellId:lo&255};
}
export function nativeProduct(advertisData){
  if(!advertisData)return null;const data=advertisData instanceof ArrayBuffer?new Uint8Array(advertisData):new Uint8Array(advertisData.buffer,advertisData.byteOffset,advertisData.byteLength);
  // wx exposes manufacturer bytes including company ID, rather than AD framing.
  if(data.length>=5&&data[0]===0&&data[1]===0x60&&data[2]===0x50)return {version:data[3],productId:data[4],shellId:data.length>=6&&data[3]===2?data[5]:null};
  // Also accept a complete AD block for adapters that preserve its framing.
  for(let p=0;p<data.length;){const length=data[p];if(!length||p+length>=data.length)break;if(data[p+1]===0xff){const result=nativeProduct(data.subarray(p+2,p+1+length));if(result)return result;}p+=length+1;}
  return null;
}
