/**
 * scripts/lib/png.mjs — the one zero-dependency RGB PNG encoder for seeders.
 *
 * SIDE-EFFECT-FREE (no env load, no network) so a `*-specs.mjs` module can import it; seed-common.mjs
 * re-exports `makePng` and builds `makeProductPng` on it. Output is deterministic for the same
 * arguments — callers that upload to a content-addressed store (Sanity) rely on that.
 */
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/**
 * 8-bit RGB PNG of w×h. `rgb` is a constant [r,g,b] or a function (x, y) => [r,g,b].
 * `deflate` is passed to zlib.deflateSync (e.g. { level: 9 }); it changes the bytes, so keep it stable.
 */
export function makePng(w, h, rgb, { deflate } = {}) {
  const px = typeof rgb === 'function' ? rgb : () => rgb;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rowLen = w * 3;
  const raw = Buffer.alloc((rowLen + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (rowLen + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const idat = deflate ? zlib.deflateSync(raw, deflate) : zlib.deflateSync(raw);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
