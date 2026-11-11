#!/usr/bin/env node
/**
 * Generate the large upload fixtures that only exist to test a SIZE limit, instead of committing them.
 *
 *   node scripts/test-data/gen-upload-size-fixtures.mjs
 *   npm run td:gen:uploads
 *
 * Suite 072b CFG-FILE-008 checks the 9.5 MB File-section limit with two files: one under it that must
 * be accepted and one over it that must be rejected. The content of either file is never asserted,
 * only its size and that it is a real file of its type. Committed, the two were 28 MB of the repo
 * (VCST-6637 follow-up); generated, they cost nothing and are identical on every machine and in CI.
 *
 * The bytes are deterministic (a fixed-seed PRNG), so a re-run rewrites the same files. They are
 * incompressible on purpose: a solid-colour PNG of the same dimensions would deflate to a few KB
 * and stop testing the limit.
 *
 * Written (gitignored, see `.gitignore`):
 *   test-data/uploads/large_test.png  ~5 MiB  — a real PNG of random pixels, UNDER the limit
 *   test-data/uploads/video.mp4        24 MiB — an ISO-BMFF file (`ftyp` + `mdat`), OVER the limit.
 *                                               It has no `moov` box, so it is not playable; the case
 *                                               only needs a file the browser and platform see as
 *                                               video/mp4 and that is too big.
 */
import { makePng } from '../lib/png.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('test-data/uploads');
const MiB = 1024 * 1024;

/** mulberry32 — small, fast, fixed-seed PRNG so the output is the same everywhere. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  };
}

function noise(bytes, seed) {
  const next = prng(seed);
  const buf = Buffer.allocUnsafe(bytes);
  let i = 0;
  for (; i + 4 <= bytes; i += 4) buf.writeUInt32LE(next(), i);
  for (; i < bytes; i++) buf[i] = next() & 0xff;
  return buf;
}

/** A square noise PNG whose raw scanlines come to about `targetBytes`. Deflate cannot shrink noise. */
function noisePng(targetBytes, seed) {
  const side = Math.ceil(Math.sqrt(targetBytes / 3));
  const next = prng(seed);
  return makePng(side, side, () => { const v = next(); return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff]; });
}

/** `ftyp` (isom) + one `mdat` box filled with noise, to exactly `totalBytes`. */
function mp4(totalBytes, seed) {
  const ftyp = Buffer.alloc(28);
  ftyp.writeUInt32BE(28, 0); ftyp.write('ftyp', 4, 'latin1'); ftyp.write('isom', 8, 'latin1');
  ftyp.writeUInt32BE(0x200, 12); ftyp.write('isomiso2mp41', 16, 'latin1');
  const mdatHead = Buffer.alloc(8);
  const payload = totalBytes - ftyp.length - mdatHead.length;
  mdatHead.writeUInt32BE(payload + 8, 0); mdatHead.write('mdat', 4, 'latin1');
  return Buffer.concat([ftyp, mdatHead, noise(payload, seed)]);
}

const files = [
  ['large_test.png', noisePng(5 * MiB, 0x5a17)],
  ['video.mp4', mp4(24 * MiB, 0x0b24)],
];

fs.mkdirSync(OUT, { recursive: true });
for (const [name, buf] of files) fs.writeFileSync(path.join(OUT, name), buf);

console.log(`wrote ${files.length} size fixtures to ${OUT}`);
for (const [name, buf] of files) {
  console.log(`  ${name.padEnd(16)} ${(buf.length / MiB).toFixed(2).padStart(6)} MiB  ${buf.subarray(0, 8).toString('hex')}`);
}
