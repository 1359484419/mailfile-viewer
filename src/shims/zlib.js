// Browser replacement for the two zlib calls pst-extractor makes (OST 2013+ compressed blocks).
import { Buffer } from 'buffer';
import { decompressSync } from 'fflate';

export function unzipSync(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  return Buffer.from(decompressSync(u8));
}
export const inflateSync = unzipSync;
export default { unzipSync, inflateSync };
