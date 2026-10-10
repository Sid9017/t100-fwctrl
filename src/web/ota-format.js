// APP-only OAD limits match projects/t100/tools/check_oad.pl.
export const OAD_MAX_BYTES = 240 * 1024;
export function validateOad(bytes, metadata) {
  if (!(bytes instanceof Uint8Array) || bytes.length <= 16 || bytes.length > OAD_MAX_BYTES || bytes.length % 16)
    throw new Error('Invalid APP-only OAD size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8, true) !== 0x42424242 || view.getUint16(6, true) * 4 !== bytes.length)
    throw new Error('Invalid APP-only OAD header');
  const version = `0x${view.getUint16(4, true).toString(16).padStart(4, '0')}`;
  if (metadata && (metadata.size !== bytes.length || metadata.version !== version))
    throw new Error('OAD metadata does not match the firmware');
  return {version, size: bytes.length};
}
