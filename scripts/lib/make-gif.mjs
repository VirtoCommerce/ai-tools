#!/usr/bin/env node
/**
 * make-gif — build an animated GIF from still PNG screenshots.
 *
 * Exists because `.claude/knowledge/execution/reports-policy.md` §5.2 requires motion evidence for a
 * transition defect, and nothing in this repo could produce it: no ffmpeg on PATH, no encoder
 * dependency, no script. A rule with no tool is a rule that gets silently skipped, so this closes it.
 *
 * Deliberately DEPENDENCY-FREE: PNG inflate comes from node:zlib, and the GIF89a writer (median-cut
 * palette + LZW) is implemented here. Nothing to install, works offline, and no supply-chain surface
 * added for what is ultimately a reporting convenience.
 *
 * Usage:
 *   node scripts/lib/make-gif.mjs --out clip.gif [options] a.png b.png c.png
 *
 *   --out <path>        output .gif                                  (required)
 *   --delay <ms>        per-frame delay                              (default 2000; §5.2 floor 1500)
 *   --width <px>        canvas width                                 (default 960; §5.2 cap)
 *   --max-height <px>   canvas height cap                            (default 720)
 *   --colors <n>        palette size, 2..256                         (default 256)
 *   --loop <n>          0 = forever                                  (default 0)
 *   --fit contain|width scale-to-fit (letterbox) or scale-to-width (top-crop)  (default contain)
 *
 * The §5.2 budget (1 GIF/bug, <=8 frames, >=1.5s/frame, <=960px, <=5MB) is reported as warnings on
 * stderr, never as a hard failure — the policy says a miss is a gap to log, not a build break.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/* ---------------------------------------------------------------- PNG decode */

/** Decode an 8-bit non-interlaced PNG to {width, height, rgb: Uint8Array(w*h*3)}. */
export function decodePng(buf) {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error("not a PNG");

  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];

  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    off += 12 + len;
  }

  if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth} (need 8)`);
  if (interlace !== 0) throw new Error("interlaced PNG not supported");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  // Undo the per-scanline filters (PNG spec 9.2); `prev` is the already-reconstructed line above.
  for (let y = 0, pos = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[pos + x];
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + a; break;
        case 2: v = rawByte + b; break;
        case 3: v = rawByte + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad PNG filter ${filter} on row ${y}`);
      }
      line[x] = v & 0xff;
    }
    pos += stride;
  }

  // Flatten to RGB, compositing any alpha over white — a GIF frame here is opaque.
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, n = width * height; i < n; i++) {
    let r, g, b, alpha = 255;
    const s = i * bpp;
    if (colorType === 0) { r = g = b = out[s]; }
    else if (colorType === 4) { r = g = b = out[s]; alpha = out[s + 1]; }
    else if (colorType === 2) { r = out[s]; g = out[s + 1]; b = out[s + 2]; }
    else if (colorType === 6) { r = out[s]; g = out[s + 1]; b = out[s + 2]; alpha = out[s + 3]; }
    else {
      const idx = out[s];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) alpha = trns[idx];
    }
    if (alpha !== 255) {
      const t = alpha / 255;
      r = Math.round(r * t + 255 * (1 - t));
      g = Math.round(g * t + 255 * (1 - t));
      b = Math.round(b * t + 255 * (1 - t));
    }
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
  }
  return { width, height, rgb };
}

/* ------------------------------------------------------------------- resize */

/**
 * Box-average scale `img` onto a canvasW x canvasH frame.
 *
 * Box-averaging (not nearest-neighbour) because screenshots are always downscaled here and the
 * rendered numbers are the whole point of the evidence — aliasing small UI text into noise would
 * defeat the §5.2 rule that the stills carry the values.
 *
 * `fit` decides what happens when the frame's aspect differs from the canvas:
 *   "contain" (default) — scale to fit entirely, centre, letterbox on white. Never hides anything,
 *                         but a tall full-page shot becomes an unreadable thumbnail.
 *   "width"             — scale to the canvas width and crop the overflow from the BOTTOM, keeping
 *                         the top of the page readable. Crops silently, so it is opt-in: evidence
 *                         that misleads is worse than evidence that is small.
 */
export function fitOnCanvas(img, canvasW, canvasH, { fit = "contain", bg = 255 } = {}) {
  const scale = fit === "width"
    ? canvasW / img.width
    : Math.min(canvasW / img.width, canvasH / img.height);
  const dw = Math.max(1, Math.round(img.width * scale));
  const dh = Math.max(1, Math.round(img.height * scale));
  const offX = (canvasW - dw) >> 1;
  const offY = fit === "width" ? 0 : (canvasH - dh) >> 1;

  const out = new Uint8Array(canvasW * canvasH * 3).fill(bg);
  for (let y = 0; y < dh; y++) {
    const dy = offY + y;
    if (dy < 0 || dy >= canvasH) continue; // cropped away in "width" mode
    const sy0 = Math.floor((y * img.height) / dh);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / dh));
    for (let x = 0; x < dw; x++) {
      const dx = offX + x;
      if (dx < 0 || dx >= canvasW) continue;
      const sx0 = Math.floor((x * img.width) / dw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / dw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        let p = (sy * img.width + sx0) * 3;
        for (let sx = sx0; sx < sx1; sx++, p += 3) {
          r += img.rgb[p]; g += img.rgb[p + 1]; b += img.rgb[p + 2]; n++;
        }
      }
      const d = (dy * canvasW + dx) * 3;
      out[d] = (r / n) | 0; out[d + 1] = (g / n) | 0; out[d + 2] = (b / n) | 0;
    }
  }
  return out;
}

/* ----------------------------------------------------------------- quantize */

/** Median-cut a sampled pixel set down to <=`max` colors. One GLOBAL palette serves every frame. */
export function medianCut(samples, max) {
  const rangeOf = (px) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const p of px) for (let c = 0; c < 3; c++) {
      if (p[c] < lo[c]) lo[c] = p[c];
      if (p[c] > hi[c]) hi[c] = p[c];
    }
    return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  };

  const boxes = [{ px: samples }];
  while (boxes.length < max) {
    let best = -1, bestSpread = 0, bestAxis = 0;
    boxes.forEach((box, i) => {
      if (box.px.length < 2) return;
      const r = rangeOf(box.px);
      const axis = r.indexOf(Math.max(...r));
      if (r[axis] > bestSpread) { bestSpread = r[axis]; best = i; bestAxis = axis; }
    });
    if (best < 0 || bestSpread === 0) break;
    const box = boxes[best];
    box.px.sort((a, b) => a[bestAxis] - b[bestAxis]);
    const mid = box.px.length >> 1;
    boxes.splice(best, 1, { px: box.px.slice(0, mid) }, { px: box.px.slice(mid) });
  }

  return boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const p of box.px) { r += p[0]; g += p[1]; b += p[2]; }
    const n = box.px.length || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

/** Map RGB -> palette index, cached on a 5-bit-per-channel key so the nearest search runs once per bucket. */
function makeMapper(palette) {
  const cache = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key];
    if (hit >= 0) return hit;
    let idx = 0, bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; idx = i; }
    }
    cache[key] = idx;
    return idx;
  };
}

/* ------------------------------------------------------------------ GIF/LZW */

/** GIF-variant LZW over `indices`; returns the packed code stream (not yet split into sub-blocks). */
export function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let dict = new Map();
  let next = eoi + 1;
  let codeSize = minCodeSize + 1;
  const out = [];
  let bitBuf = 0, bitCount = 0;

  const emit = (code) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) { out.push(bitBuf & 0xff); bitBuf >>>= 8; bitCount -= 8; }
  };

  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next === 4095) {
      // Dictionary full: flush with a clear code and start over, per the GIF spec.
      emit(clear);
      dict = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    } else {
      dict.set(key, next);
      next++;
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bitCount > 0) out.push(bitBuf & 0xff);
  return Uint8Array.from(out);
}

const subBlocks = (bytes) => {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.subarray(i, i + 255);
    parts.push(Buffer.from([chunk.length]), Buffer.from(chunk));
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
};

/** Assemble a GIF89a from canvas-sized RGB frames sharing one global palette. */
export function encodeGif(frames, width, height, { delayMs = 2000, colors = 256, loop = 0 } = {}) {
  // Sample across EVERY frame, so the palette serves the whole clip rather than just frame 1.
  const samples = [];
  const total = frames.length * width * height;
  const step = Math.max(1, Math.floor(total / 120000));
  for (const rgb of frames) {
    for (let i = 0; i < width * height; i += step) {
      samples.push([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]);
    }
  }
  const palette = medianCut(samples, Math.max(2, Math.min(256, colors)));
  const mapTo = makeMapper(palette);

  // A GIF global color table must be a power of two.
  let tableSize = 2;
  while (tableSize < palette.length) tableSize <<= 1;
  const gctBits = Math.log2(tableSize) - 1;

  const parts = [];
  const header = Buffer.alloc(13);
  header.write("GIF89a", 0, "latin1");
  header.writeUInt16LE(width, 6);
  header.writeUInt16LE(height, 8);
  header[10] = 0x80 | (7 << 4) | gctBits; // GCT present, 8-bit color resolution
  header[11] = 0; // background color index
  header[12] = 0; // pixel aspect ratio
  parts.push(header);

  const gct = Buffer.alloc(tableSize * 3);
  palette.forEach(([r, g, b], i) => { gct[i * 3] = r; gct[i * 3 + 1] = g; gct[i * 3 + 2] = b; });
  parts.push(gct);

  // NETSCAPE2.0 looping extension
  const netscape = Buffer.alloc(19);
  netscape[0] = 0x21; netscape[1] = 0xff; netscape[2] = 11;
  netscape.write("NETSCAPE2.0", 3, "latin1");
  netscape[14] = 3; netscape[15] = 1;
  netscape.writeUInt16LE(loop, 16);
  netscape[18] = 0;
  parts.push(netscape);

  const delayCs = Math.max(1, Math.round(delayMs / 10));
  for (const rgb of frames) {
    const gce = Buffer.alloc(8);
    gce[0] = 0x21; gce[1] = 0xf9; gce[2] = 4;
    gce[3] = 0; // no transparency, no disposal
    gce.writeUInt16LE(delayCs, 4);
    gce[6] = 0; // transparent color index (unused)
    gce[7] = 0; // block terminator
    parts.push(gce);

    const desc = Buffer.alloc(10);
    desc[0] = 0x2c;
    desc.writeUInt16LE(0, 1); desc.writeUInt16LE(0, 3);
    desc.writeUInt16LE(width, 5); desc.writeUInt16LE(height, 7);
    desc[9] = 0; // no local color table
    parts.push(desc);

    const indices = new Uint8Array(width * height);
    for (let i = 0; i < indices.length; i++) {
      indices[i] = mapTo(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    }
    parts.push(Buffer.from([8]), subBlocks(lzwEncode(indices, 8)));
  }

  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

/* --------------------------------------------------------------------- main */

/** Build the GIF from PNG paths. Returns {buffer, width, height, warnings}. */
export function makeGif(pngPaths, opts = {}) {
  const { delayMs = 2000, width = 960, maxHeight = 720, colors = 256, loop = 0, fit = "contain" } = opts;
  if (!pngPaths.length) throw new Error("no input PNGs");
  if (fit !== "contain" && fit !== "width") throw new Error(`--fit must be contain|width, got ${fit}`);

  const images = pngPaths.map((p) => {
    try { return decodePng(readFileSync(p)); }
    catch (e) { throw new Error(`${p}: ${e.message}`); }
  });

  // Frames routinely differ in size (a viewport shot beside a full-page shot), so the canvas comes
  // from the FIRST frame's aspect and every other frame is letterboxed into it, never stretched.
  const canvasW = Math.max(2, Math.round(width));
  const canvasH = Math.max(2, Math.min(
    Math.round(maxHeight),
    Math.round((canvasW * images[0].height) / images[0].width),
  ));

  const frames = images.map((img) => fitOnCanvas(img, canvasW, canvasH, { fit }));
  const buffer = encodeGif(frames, canvasW, canvasH, { delayMs, colors, loop });

  // reports-policy.md §5.2 budget — reported, never enforced.
  const warnings = [];
  if (pngPaths.length > 8) warnings.push(`${pngPaths.length} frames (§5.2 cap is 8)`);
  if (delayMs < 1500) warnings.push(`${delayMs}ms per frame (§5.2 floor is 1500ms)`);
  if (canvasW > 960) warnings.push(`width ${canvasW}px (§5.2 cap is 960px)`);
  if (buffer.length > 5 * 1024 * 1024) {
    warnings.push(`${(buffer.length / 1048576).toFixed(1)}MB (§5.2 cap is 5MB) — drop a frame or pass --colors 128`);
  }
  return { buffer, width: canvasW, height: canvasH, warnings };
}

function cli(argv) {
  const opts = { delayMs: 2000, width: 960, maxHeight: 720, colors: 256, loop: 0, fit: "contain" };
  const inputs = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i];
    else if (a === "--delay") opts.delayMs = Number(argv[++i]);
    else if (a === "--width") opts.width = Number(argv[++i]);
    else if (a === "--max-height") opts.maxHeight = Number(argv[++i]);
    else if (a === "--colors") opts.colors = Number(argv[++i]);
    else if (a === "--loop") opts.loop = Number(argv[++i]);
    else if (a === "--fit") opts.fit = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else inputs.push(a);
  }
  if (!out) throw new Error("--out <path.gif> is required");
  if (!inputs.length) throw new Error("give at least one input .png");

  const { buffer, width, height, warnings } = makeGif(inputs, opts);
  writeFileSync(out, buffer);
  for (const w of warnings) console.error(`[make-gif] WARN ${w}`);
  console.log(
    `[make-gif] ${out} — ${inputs.length} frame(s), ${width}x${height}, ` +
    `${(buffer.length / 1024).toFixed(0)} KB, ${opts.delayMs}ms/frame`,
  );
}

if (process.argv[1]?.endsWith("make-gif.mjs")) {
  try { cli(process.argv.slice(2)); }
  catch (e) { console.error(`[make-gif] ${e.message}`); process.exit(1); }
}
