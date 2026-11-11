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
 * Both are PNGs ON PURPOSE. The oversized file must be a type the section ACCEPTS, so the size check is
 * the only thing that can reject it. Measured on vcst 2026-11-11: a 24 MB MP4 was refused with "File
 * format is not allowed" before its size was ever checked, so the case could not have caught a broken
 * limit; a 24 MB PNG got "File size exceeds the allowed 9.5MB".
 *
 * `OUTPUTS` below is the one list of what this writes: `.gitignore` ignores those paths, and the regression
 * pre-flight (`scripts/regression/requirements.ts`) imports it to flag a run whose cases need a missing one.
 *
 * Determinism: the pixels come from a fixed-seed PRNG, so they are identical everywhere. The compressed
 * bytes depend on the zlib build Node ships, so a file's hash can differ between machines — harmless,
 * because only its size and type are under test. The pixels are noise on purpose: a solid-colour PNG of
 * the same dimensions would deflate to a few KB and stop testing the limit.
 *
 *   large_test.png    — UNDER the limit (UNDER_LIMIT_BYTES of raw pixels).
 *   oversize_test.png — OVER the limit (OVER_LIMIT_BYTES of raw pixels).
 */
import { makePng } from '../lib/png.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MiB = 1024 * 1024;
const UNDER_LIMIT_BYTES = 5 * MiB;
const OVER_LIMIT_BYTES = 24 * MiB;

/** Repo-relative paths this script writes. */
export const OUTPUTS = ['test-data/uploads/large_test.png', 'test-data/uploads/oversize_test.png'];

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

/** A square noise PNG whose raw scanlines come to about `targetBytes`. Deflate cannot shrink noise. */
function noisePng(targetBytes, seed) {
  const side = Math.ceil(Math.sqrt(targetBytes / 3));
  const next = prng(seed);
  return makePng(side, side, () => { const v = next(); return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff]; });
}

/** Write every OUTPUT under `root` (the repo root by default, whatever the current directory). */
export function generate(root = ROOT) {
  const bytes = {
    'test-data/uploads/large_test.png': noisePng(UNDER_LIMIT_BYTES, 0x5a17),
    'test-data/uploads/oversize_test.png': noisePng(OVER_LIMIT_BYTES, 0x0b24),
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
  for (const w of written) console.log(`  ${w.rel.padEnd(36)} ${(w.size / MiB).toFixed(2).padStart(6)} MiB  ${w.head}`);
}
