#!/usr/bin/env node
/**
 * contact-sheet — tile many screenshots into ONE PNG so a whole capture walk can be checked at a glance
 * before any film or GIF is built. Dependency-free (node:zlib only). Tiles go left→right, top→bottom;
 * the index→file mapping is printed, since the sheet carries no text.
 *
 *   npm run contact-sheet -- --out sheet.png [--cols 4] [--tile 480] a.png b.png …
 *
 * Look for: wrong element clicked, blank/white frame, a dialog missing from the frame, the control hidden
 * under the caption band, a cropped modal, a datum that should have been masked.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodePng } from "./make-gif.mjs";

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, "ascii"); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Box-average downscale of an RGB image to targetW (aspect kept). */
function scaleToWidth(img, targetW) {
  const h = Math.max(1, Math.round((img.height * targetW) / img.width));
  const out = new Uint8Array(targetW * h * 3);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * img.height) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < targetW; x++) {
      const x0 = Math.floor((x * img.width) / targetW), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / targetW));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * img.width + xx) * 3; r += img.rgb[i]; g += img.rgb[i + 1]; b += img.rgb[i + 2]; n++; }
      const o = (y * targetW + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return { width: targetW, height: h, rgb: out };
}

export function contactSheet(paths, { cols = 4, tile = 480 } = {}) {
  const tiles = paths.map((p) => scaleToWidth(decodePng(readFileSync(p)), tile));
  const cellH = Math.min(Math.max(...tiles.map((t) => t.height)), Math.round(tile * 0.75)), gap = 8;
  const rows = Math.ceil(tiles.length / cols), W = cols * (tile + gap) + gap, H = rows * (cellH + gap) + gap;
  const sheet = new Uint8Array(W * H * 3).fill(60);
  tiles.forEach((t, k) => {
    const ox = gap + (k % cols) * (tile + gap), oy = gap + Math.floor(k / cols) * (cellH + gap);
    for (let y = 0; y < Math.min(t.height, cellH); y++) for (let x = 0; x < tile; x++) {
      const s = (y * tile + x) * 3, d = ((oy + y) * W + ox + x) * 3; sheet[d] = t.rgb[s]; sheet[d + 1] = t.rgb[s + 1]; sheet[d + 2] = t.rgb[s + 2];
    }
  });
  return { png: encodePng(W, H, sheet), width: W, height: H };
}

if (process.argv[1]?.endsWith("contact-sheet.mjs")) {
  try {
    const a = process.argv.slice(2), inputs = []; let out = null, cols = 4, tile = 480;
    for (let i = 0; i < a.length; i++) { if (a[i] === "--out") out = a[++i]; else if (a[i] === "--cols") cols = +a[++i]; else if (a[i] === "--tile") tile = +a[++i]; else if (a[i].startsWith("--")) throw new Error(`unknown flag ${a[i]}`); else inputs.push(a[i]); }
    if (!out || !inputs.length) throw new Error("usage: --out sheet.png [--cols 4] [--tile 480] a.png b.png …");
    const { png, width, height } = contactSheet(inputs, { cols, tile });
    writeFileSync(out, png);
    inputs.forEach((f, i) => console.log(`${String(i + 1).padStart(2)}  ${f}`));
    console.log(`[contact-sheet] ${out} — ${inputs.length} tiles, ${width}x${height}`);
  } catch (e) { console.error(`[contact-sheet] ${e.message}`); process.exit(1); }
}
