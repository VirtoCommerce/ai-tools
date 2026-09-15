// Guards the dependency-free GIF writer behind reports-policy.md §5.2 (motion evidence).
//
// The failure mode this exists for is SILENT: a malformed LZW stream or a bad global colour table
// still produces a file `writeFileSync` accepts and every structural check passes — the breakage
// only shows when a human opens the attachment in the tracker and sees garbage, one round trip too
// late (the §5c lesson, one layer down). So the assertions are byte-level: the LZW stream must
// round-trip through an INDEPENDENT decoder written from the GIF spec, not from this encoder.
//
// Fixtures are synthesized here, never read from `reports/**`. Report artifacts are prunable by
// policy §9 and are actively deleted between runs, so a test anchored to one is a test that fails
// for a reason that has nothing to do with the code under test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodePng, fitOnCanvas, medianCut, lzwEncode, makeGif } from "../lib/make-gif.mjs";

const TMP = mkdtempSync(join(tmpdir(), "make-gif-test-"));

/* -------------------------------------------------------------- PNG fixtures */

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/**
 * Write an 8-bit PNG. `filterMode: "cycle"` rotates through all five scanline filters so the
 * unfilter path — the most error-prone part of the decoder — is actually exercised, rather than
 * only filter 0 which any encoder emits by default.
 */
function writePng(path, width, height, pixelFn, { colorType = 2, filterMode = "cycle" } = {}) {
  const ch = colorType === 6 ? 4 : 3;
  const stride = width * ch;

  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < width; x++) {
      const px = pixelFn(x, y);
      for (let c = 0; c < ch; c++) row[x * ch + c] = px[c];
    }
    rows.push(row);
  }

  const out = [];
  for (let y = 0; y < height; y++) {
    const filter = filterMode === "cycle" ? y % 5 : 0;
    const row = rows[y];
    const prev = y ? rows[y - 1] : Buffer.alloc(stride);
    const enc = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v;
      switch (filter) {
        case 0: v = row[x]; break;
        case 1: v = row[x] - a; break;
        case 2: v = row[x] - b; break;
        case 3: v = row[x] - ((a + b) >> 1); break;
        default: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = row[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
      }
      enc[x] = v & 0xff;
    }
    out.push(Buffer.from([filter]), enc);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(out))),
    chunk("IEND", Buffer.alloc(0)),
  ]));
  return path;
}

// A wide gradient (landscape) and a narrow one (portrait) — the mismatched-aspect case makeGif has
// to letterbox or crop, which is exactly what real evidence looks like (viewport shot + full page).
const GRADIENT = (x, y) => [(x * 7) % 256, (y * 5) % 256, (x + y) % 256, 255];
const WIDE = writePng(join(TMP, "wide.png"), 64, 36, GRADIENT);
const TALL = writePng(join(TMP, "tall.png"), 40, 120, GRADIENT);

/* ------------------------------------------------- independent GIF-LZW decoder */

/** Written from the GIF spec; deliberately shares no code with the encoder under test. */
function lzwDecode(bytes, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let dict = [];
  const resetDict = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict.push([i]);
    dict.push(null, null); // clear + eoi placeholders
  };
  resetDict();

  let codeSize = minCodeSize + 1;
  let bitPos = 0;
  const readCode = () => {
    let code = 0;
    for (let i = 0; i < codeSize; i++, bitPos++) {
      code |= ((bytes[bitPos >> 3] >> (bitPos & 7)) & 1) << i;
    }
    return code;
  };

  const out = [];
  let prev = null;
  for (;;) {
    if (bitPos + codeSize > bytes.length * 8) break;
    const code = readCode();
    if (code === eoi) break;
    if (code === clear) { resetDict(); codeSize = minCodeSize + 1; prev = null; continue; }
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error(`bad LZW code ${code}`);
    out.push(...entry);
    if (prev) {
      dict.push([...prev, entry[0]]);
      if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}

/* ---------------------------------------------------------------------- tests */

test("lzwEncode round-trips through an independent spec decoder", () => {
  const cases = [
    Uint8Array.from([0]),
    Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1]),
    Uint8Array.from([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]),
    Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256),  // forces code-size growth
    Uint8Array.from({ length: 20000 }, () => 42),                // long run
  ];
  for (const input of cases) {
    assert.deepEqual(
      lzwDecode(lzwEncode(input, 8), 8),
      Array.from(input),
      `round-trip failed for length ${input.length}`,
    );
  }
});

test("lzwEncode survives a dictionary overflow (>4096 sequences, mid-stream clear)", () => {
  let seed = 12345;
  const input = Uint8Array.from({ length: 80000 }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 16) & 0xff;
  });
  assert.deepEqual(lzwDecode(lzwEncode(input, 8), 8), Array.from(input));
});

test("decodePng reconstructs exact pixels across all five scanline filters", () => {
  const img = decodePng(readFileSync(WIDE));
  assert.equal(img.width, 64);
  assert.equal(img.height, 36);
  for (let y = 0; y < 36; y++) {
    for (let x = 0; x < 64; x++) {
      const [r, g, b] = GRADIENT(x, y);
      const i = (y * 64 + x) * 3;
      assert.equal(img.rgb[i], r, `red mismatch at ${x},${y}`);
      assert.equal(img.rgb[i + 1], g, `green mismatch at ${x},${y}`);
      assert.equal(img.rgb[i + 2], b, `blue mismatch at ${x},${y}`);
    }
  }
});

test("decodePng composites RGBA over white", () => {
  const path = writePng(join(TMP, "alpha.png"), 4, 4, () => [0, 0, 0, 0], { colorType: 6 });
  const img = decodePng(readFileSync(path));
  // Fully transparent black over a white ground is white, not black.
  assert.deepEqual(Array.from(img.rgb.slice(0, 3)), [255, 255, 255]);
});

test("decodePng rejects what it cannot honestly decode", () => {
  assert.throws(() => decodePng(Buffer.alloc(32)), /not a PNG/);
});

test("medianCut returns at most the requested number of colors", () => {
  const samples = [];
  for (let i = 0; i < 4000; i++) samples.push([i % 256, (i * 3) % 256, (i * 7) % 256]);
  for (const n of [2, 16, 256]) {
    const pal = medianCut(samples, n);
    assert.ok(pal.length <= n, `${pal.length} > ${n}`);
    assert.ok(pal.every((c) => c.length === 3 && c.every((v) => v >= 0 && v <= 255)));
  }
});

test("fitOnCanvas letterboxes in contain mode and crops in width mode", () => {
  const img = { width: 100, height: 400, rgb: new Uint8Array(100 * 400 * 3).fill(0) }; // black, tall
  const W = 200, H = 100;

  const contained = fitOnCanvas(img, W, H, { fit: "contain" });
  assert.equal(contained.length, W * H * 3);
  assert.equal(contained[0], 255, "contain mode should letterbox the left edge white");

  const cropped = fitOnCanvas(img, W, H, { fit: "width" });
  assert.equal(cropped[0], 0, "width mode should fill from the top-left with image pixels");
});

test("makeGif emits a well-formed GIF89a whose frames decode back to canvas size", () => {
  const { buffer, width, height, warnings } = makeGif([WIDE, TALL], {
    delayMs: 2000, width: 320, maxHeight: 240, colors: 64,
  });

  assert.equal(buffer.subarray(0, 6).toString("latin1"), "GIF89a");
  assert.equal(buffer.readUInt16LE(6), width);
  assert.equal(buffer.readUInt16LE(8), height);
  assert.equal(buffer[buffer.length - 1], 0x3b, "missing GIF trailer");
  assert.deepEqual(warnings, [], "a 2-frame 320px clip should breach no §5.2 budget");

  // Walk the block stream the way a decoder does, and decode each frame's LZW payload.
  const gctSize = 2 << (buffer[10] & 0x07);
  let off = 13 + gctSize * 3;
  let frames = 0;
  while (off < buffer.length) {
    const marker = buffer[off];
    if (marker === 0x3b) break;
    if (marker === 0x21) {          // extension — skip its sub-blocks
      off += 2;
      while (buffer[off] !== 0) off += buffer[off] + 1;
      off += 1;
    } else if (marker === 0x2c) {   // image descriptor
      assert.equal(buffer.readUInt16LE(off + 5), width);
      assert.equal(buffer.readUInt16LE(off + 7), height);
      assert.equal(buffer[off + 9] & 0x80, 0, "frame should use the global color table");
      off += 10;
      const minCodeSize = buffer[off++];
      assert.equal(minCodeSize, 8);
      const chunks = [];
      while (buffer[off] !== 0) {
        const len = buffer[off];
        chunks.push(buffer.subarray(off + 1, off + 1 + len));
        off += len + 1;
      }
      off += 1;
      const pixels = lzwDecode(Buffer.concat(chunks), minCodeSize);
      assert.equal(pixels.length, width * height, `frame ${frames} decoded to the wrong pixel count`);
      assert.ok(pixels.every((p) => p < gctSize), "a pixel indexes outside the global color table");
      frames++;
    } else {
      throw new Error(`unexpected block marker 0x${marker.toString(16)} at ${off}`);
    }
  }
  assert.equal(frames, 2, "expected one image block per input PNG");
});

test("makeGif reports §5.2 budget breaches as warnings rather than throwing", () => {
  const { warnings } = makeGif([WIDE], { delayMs: 500, width: 1200, maxHeight: 400, colors: 32 });
  assert.ok(warnings.some((w) => w.includes("1500ms")), "should flag a too-fast frame delay");
  assert.ok(warnings.some((w) => w.includes("960px")), "should flag an over-wide canvas");
});

test("makeGif rejects an unknown fit mode and an empty frame list", () => {
  assert.throws(() => makeGif([WIDE], { fit: "cover" }), /--fit must be contain\|width/);
  assert.throws(() => makeGif([]), /no input PNGs/);
});
