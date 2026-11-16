// A minimal, dependency-free PNG encoder (8-bit RGBA, no interlace) using Node's zlib.
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length), typeBytes = Buffer.from(type, "ascii");
  out.writeUInt32BE(body.length, 0); typeBytes.copy(out, 4); Buffer.from(body).copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(body)])), 8 + body.length);
  return out;
}

/** Encode a framebuffer ({ width, height, data: RGBA }) as a PNG Buffer. */
export function encodePng(fb, { level = 6 } = {}) {
  const { width, height, data } = fb, row = width * 4, raw = Buffer.alloc((row + 1) * height);
  for (let y = 0; y < height; y += 1) { raw[y * (row + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * row, row).copy(raw, y * (row + 1) + 1); }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level })), chunk("IEND", Buffer.alloc(0))]);
}
