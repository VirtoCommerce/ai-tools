#!/usr/bin/env node
/**
 * Generate the image fixtures the Page Builder Asset Library upload cases need
 * (suite 060b, CMS-143..CMS-185).
 *
 *   node scripts/test-data/gen-cms-upload-fixtures.mjs
 *   npm run td:gen:cms-uploads
 *
 * Why generated and not committed: `.gitignore` excludes `*.png` repo-wide, so
 * image fixtures under test-data/ were never actually tracked — every asset
 * upload case referenced a file that existed on exactly one machine. Rather than
 * carve out a negation and commit binaries, the bytes are derived here: the
 * files are tiny, deterministic, and identical on every machine and in CI.
 *
 * The PNG colours are the point. A replace is only observable if the two
 * versions are unmistakable at a glance, so v1 is red and v2 is blue — that is
 * the RED->BLUE evidence in VCST-5725.
 *
 * Layout (under test-data/cms/uploads-5725/):
 *   v1/AGENT-TEST-overwrite-5725.png    red   — the stored original
 *   v2/AGENT-TEST-overwrite-5725.png    blue  — same name, different content
 *   v2/AGENT-TEST-OVERWRITE-5725.png    blue  — case-only variant of the name
 *   v1/AGENT-TEST-overwrite-5725.jpg          — same base name, other extension
 *   v1/AGENT-TEST-batch-a-5725.png      red   — batch member, no conflict
 *   v1/AGENT-TEST-unsupported-5725.txt        — not an image, for the type guard
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('test-data/cms/uploads-5725');
const W = 200, H = 120;

const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = buf => {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

/** Solid-colour 8-bit truecolour PNG. */
function png([r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;                       // bit depth 8, colour type 2 (RGB)
  const row = Buffer.alloc(1 + W * 3);            // leading filter byte per scanline
  for (let x = 0; x < W; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: H }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Minimal baseline JPEG. Hand-assembled rather than canvas-rendered so the
 * script stays dependency-free: one block per component, DC only, AC all zero.
 *
 * Deliberately NO colour claim. Verified 2026-09-10: the output is a real
 * baseline JPEG (SOI `ffd8ff`) that decodes at 200x120, but the DC levels below
 * do not survive as the intended colour — it renders flat white. That is fine,
 * and it is the whole point of the fixture: the case it serves (CMS-180) proves
 * only that a different EXTENSION is treated as a different file, and never
 * asserts a pixel. Do not describe this file by colour, and do not "fix" the
 * colour by adding a headless-browser dependency unless a case actually needs it.
 */
function jpeg([r, g, b]) {
  const Y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const Cb = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
  const Cr = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);

  const qt = Buffer.concat([Buffer.from([0x00]), Buffer.alloc(64, 1)]);           // quality ~max
  const sof = Buffer.from([0x08, (H >> 8) & 0xFF, H & 0xFF, (W >> 8) & 0xFF, W & 0xFF, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00]);
  // One DC table, one AC table, shared by all three components.
  const dcBits = Buffer.from([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  const dcVals = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const acBits = Buffer.from([0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d]);
  const acVals = Buffer.from(Array.from({ length: 162 }, (_, i) => i));
  const dht = (id, bits, vals) => Buffer.concat([Buffer.from([id]), bits, vals]);
  const sos = Buffer.from([0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00]);

  // Entropy-coded payload: per component a DC category-8 code carrying the level,
  // then EOB. Encoded MSB-first into a bit writer with 0xFF byte-stuffing.
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  for (const level of [Y - 128, Cb - 128, Cr - 128]) {
    put(0x1FE, 9);                                  // DC Huffman code for category 8
    put(level < 0 ? level + 255 : level, 8);        // 8-bit signed magnitude
    put(0x0A, 4);                                   // EOB
  }
  while (bits.length % 8) bits.push(1);
  const scan = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k];
    scan.push(byte);
    if (byte === 0xFF) scan.push(0x00);             // stuff, so it is not read as a marker
  }

  const seg = (marker, payload) => {
    const len = Buffer.alloc(2); len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([Buffer.from([0xFF, marker]), len, payload]);
  };
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]),
    seg(0xDB, qt), seg(0xC0, sof),
    seg(0xC4, dht(0x00, dcBits, dcVals)), seg(0xC4, dht(0x10, acBits, acVals)),
    seg(0xDA, sos), Buffer.from(scan),
    Buffer.from([0xFF, 0xD9]),
  ]);
}

const RED = [220, 20, 20], BLUE = [20, 60, 220];

const files = [
  ['v1/AGENT-TEST-overwrite-5725.png',  png(RED)],
  ['v1/AGENT-TEST-batch-a-5725.png',    png(RED)],
  ['v1/AGENT-TEST-overwrite-5725.jpg',  jpeg(RED)],
  ['v2/AGENT-TEST-overwrite-5725.png',  png(BLUE)],
  ['v2/AGENT-TEST-OVERWRITE-5725.png',  png(BLUE)],
  ['v1/AGENT-TEST-unsupported-5725.txt', Buffer.from('not an image — fixture for the upload type guard\n')],
];

for (const [rel, buf] of files) {
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

console.log(`wrote ${files.length} fixtures to ${OUT}`);
for (const [rel, buf] of files) {
  console.log(`  ${rel.padEnd(38)} ${String(buf.length).padStart(5)} B  ${buf.slice(0, 3).toString('hex')}`);
}
