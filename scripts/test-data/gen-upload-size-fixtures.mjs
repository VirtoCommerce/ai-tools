#!/usr/bin/env node
/**
 * Generate the large upload fixtures that only exist to test a SIZE limit, instead of committing them.
 *
 *   node scripts/test-data/gen-upload-size-fixtures.mjs
 *   npm run td:gen:uploads
 *
 * Suite 072b CFG-FILE-008 checks the 9.5 MB File-section limit with two files: one under it that must
 * be accepted and one over it that must be rejected. The content of either file is never asserted,
 * only its size and that it is a real file of its type, so a script can recreate it and git does not
 * need to carry it (`.claude/knowledge/execution/test-data-authoring.md` §Large fixtures).
 *
 * `OUTPUTS` below is the one list of what this writes: `.gitignore` ignores those paths, and the regression
 * pre-flight (`scripts/regression/requirements.ts`) imports it to flag a run whose cases need a missing one.
 *
 * Determinism: the bytes come from a fixed-seed PRNG. The MP4 is therefore byte-identical everywhere. The
 * PNG's pixels are identical too, but its compressed bytes depend on the zlib build Node ships, so its hash
 * can differ between machines — harmless, because only its size and type are under test. Both files are
 * incompressible on purpose: a solid-colour PNG of the same dimensions would deflate to a few KB and stop
 * testing the limit.
 *
 *   large_test.png — a real PNG of random pixels, UNDER the limit (LARGE_PNG_BYTES of raw pixels).
 *   video.mp4      — an ISO-BMFF file (`ftyp` + `mdat`), OVER the limit (VIDEO_BYTES). It has no `moov`
 *                    box, so it is not playable; the case only needs a file the browser and platform see
 *                    as video/mp4 and that is too big.
 */
import { makePng } from '../lib/png.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MiB = 1024 * 1024;
const LARGE_PNG_BYTES = 5 * MiB;
const VIDEO_BYTES = 24 * MiB;

/** Repo-relative paths this script writes. */
export const OUTPUTS = ['test-data/uploads/large_test.png', 'test-data/uploads/video.mp4'];

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

/** Write every OUTPUT under `root` (the repo root by default, whatever the current directory). */
export function generate(root = ROOT) {
  const bytes = {
    'test-data/uploads/large_test.png': noisePng(LARGE_PNG_BYTES, 0x5a17),
    'test-data/uploads/video.mp4': mp4(VIDEO_BYTES, 0x0b24),
  };
  for (const rel of OUTPUTS) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes[rel]);
  }
  return OUTPUTS.map((rel) => ({ rel, size: bytes[rel].length, head: bytes[rel].subarray(0, 8).toString('hex') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const written = generate();
  console.log(`wrote ${written.length} size fixtures under ${ROOT}`);
  for (const w of written) console.log(`  ${w.rel.padEnd(34)} ${(w.size / MiB).toFixed(2).padStart(6)} MiB  ${w.head}`);
}
