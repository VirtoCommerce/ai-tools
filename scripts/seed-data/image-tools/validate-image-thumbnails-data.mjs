#!/usr/bin/env node
/**
 * validate-image-thumbnails-data.mjs — STATIC drift guard for the VCST-6268 Image Tools source-image fixtures
 * (no network). Wired as `td:validate:image-thumbnails`. It owns the fixture's DATA contract (FOURTH RULE):
 *
 *   1. the spec still describes DISCRIMINATING fixtures (validateFixtureShape — odd-aspect quadrant, 1-px
 *      checker, byte-identical .jpg/.jpeg pair, alpha vs no-alpha siblings, animated vs static, …);
 *   2. every IMG_THUMB_* alias is registered in test-data/aliases.json as `_inline` and its fields EQUAL the
 *      spec-derived ones (aliasStaticFields) — and no IMG_THUMB_* alias exists that the spec does not declare;
 *   3. no aliases.<env>.json overlay overrides an IMG_THUMB_* alias (these are static files, never per-env);
 *   4. every alias `.path` resolves to an existing file whose byte size + sha256 equal the spec (SVG hashed with
 *      CRLF→LF, since core.autocrlf may rewrite text on checkout), whose MAGIC BYTES match its format, and whose
 *      HEADER-derived width / height / frames / progressive / bit depth / alpha flag equal the spec (no codec
 *      dependency — headers are parsed here). The corrupt JPEG must have NO decodable frame header.
 *
 * Exit 1 on any violation.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES, ALIAS_PREFIX, aliasStaticFields, validateFixtureShape } from './image-thumbnails-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };

// ---------------------------------------------------------------- header parsers (derive, never trust names)
function parseJpeg(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return { magic: false };
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return { magic: true };
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m === 0xd9 || m === 0xda) return { magic: true };
    const len = b.readUInt16BE(i + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m)) {
      if (i + 10 > b.length) return { magic: true };
      return { magic: true, height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7), components: b[i + 9], progressive: m === 0xc2 || m === 0xc6 || m === 0xca || m === 0xce, frames: 1 };
    }
    i += 2 + len;
  }
  return { magic: true };
}
function parsePng(b) {
  if (b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || b.subarray(12, 16).toString('latin1') !== 'IHDR') return { magic: false };
  const colorType = b[25];
  return { magic: true, width: b.readUInt32BE(16), height: b.readUInt32BE(20), hasAlpha: colorType === 4 || colorType === 6 || b.includes(Buffer.from('tRNS')), progressive: b[28] === 1, frames: b.includes(Buffer.from('acTL')) ? -1 : 1 };
}
function parseGif(b) {
  const sig = b.subarray(0, 6).toString('latin1');
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return { magic: false };
  const width = b.readUInt16LE(6), height = b.readUInt16LE(8);
  let i = 13; if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));
  const skipSub = () => { while (i < b.length && b[i] !== 0) i += b[i] + 1; i += 1; };
  let frames = 0;
  while (i < b.length) {
    const t = b[i];
    if (t === 0x3b) break;
    if (t === 0x21) { i += 2; skipSub(); continue; }
    if (t === 0x2c) { frames += 1; const f = b[i + 9]; i += 10; if (f & 0x80) i += 3 * (1 << ((f & 7) + 1)); i += 1; skipSub(); continue; }
    break;
  }
  return { magic: true, width, height, frames, progressive: false };
}
function parseBmp(b) {
  if (b[0] !== 0x42 || b[1] !== 0x4d) return { magic: false };
  return { magic: true, width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)), bitsPerPixel: b.readUInt16LE(28), compression: b.readUInt32LE(30), frames: 1, progressive: false };
}
function parseWebp(b) {
  if (b.subarray(0, 4).toString('latin1') !== 'RIFF' || b.subarray(8, 12).toString('latin1') !== 'WEBP') return { magic: false };
  let i = 12, out = { magic: true, progressive: false };
  let anmf = 0;
  while (i + 8 <= b.length) {
    const id = b.subarray(i, i + 4).toString('latin1'), size = b.readUInt32LE(i + 4), d = i + 8;
    if (id === 'VP8X') { out.hasAlpha = (b[d] & 0x10) !== 0; out.animated = (b[d] & 0x02) !== 0; out.width = 1 + b.readUIntLE(d + 4, 3); out.height = 1 + b.readUIntLE(d + 7, 3); }
    else if (id === 'VP8 ' && out.width == null) { out.width = b.readUInt16LE(d + 6) & 0x3fff; out.height = b.readUInt16LE(d + 8) & 0x3fff; out.hasAlpha = false; out.codec = 'VP8'; }
    else if (id === 'VP8L' && out.width == null) { const v = b.readUInt32LE(d + 1); out.width = (v & 0x3fff) + 1; out.height = ((v >> 14) & 0x3fff) + 1; out.hasAlpha = ((v >> 28) & 1) === 1; out.codec = 'VP8L'; }
    else if (id === 'ANMF') anmf += 1;
    i = d + size + (size & 1);
  }
  out.frames = anmf || 1;
  return out;
}
function parseTiff(b) {
  const bo = b.subarray(0, 4).toString('hex');
  const le = bo === '49492a00'; if (!le && bo !== '4d4d002a') return { magic: false };
  const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o)), u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const ifd = u32(4), n = u16(ifd), tags = {};
  for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12, tag = u16(e), type = u16(e + 2); tags[tag] = type === 3 ? u16(e + 8) : u32(e + 8); }
  return { magic: true, width: tags[256], height: tags[257], samples: tags[277] ?? 1, frames: u32(ifd + 2 + n * 12) === 0 ? 1 : 2, progressive: false };
}
function parseSvg(b) {
  const s = b.toString('utf8'), m = /<svg\b[^>]*>/i.exec(s);
  if (!m) return { magic: false };
  const attr = (a) => { const r = new RegExp(`\\b${a}="([0-9.]+)"`).exec(m[0]); return r ? Number(r[1]) : undefined; };
  return { magic: /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(m[0]) && /<\/svg>\s*$/.test(s), width: attr('width'), height: attr('height'), frames: 1, progressive: false };
}
const PARSERS = { jpeg: parseJpeg, 'jpeg-corrupt': parseJpeg, png: parsePng, gif: parseGif, bmp: parseBmp, webp: parseWebp, tiff: parseTiff, svg: parseSvg };

// ---------------------------------------------------------------- 1. non-vacuity contract
console.log('=== validate image-thumbnails fixtures (VCST-6268, static drift guard) ===');
const shape = validateFixtureShape();
if (shape.length) shape.forEach(fail); else ok(`spec describes discriminating fixtures (${FIXTURES.length} sources: quadrant/checker/jpg-jpeg pair/alpha siblings/animated/CMYK/gray/large/corrupt)`);

// ---------------------------------------------------------------- 2. alias registry == spec
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const declared = new Set(FIXTURES.map((f) => f.alias));
for (const k of Object.keys(aliases)) if (k.startsWith(ALIAS_PREFIX) && !declared.has(k)) fail(`${k}: in aliases.json but not declared in image-thumbnails-specs.mjs`);
for (const f of FIXTURES) {
  const a = aliases[f.alias];
  if (!a) { fail(`${f.alias}: not registered in test-data/aliases.json`); continue; }
  if (a._inline !== true) fail(`${f.alias}: must be an _inline alias`);
  const want = aliasStaticFields(f);
  const bad = Object.entries(want).filter(([k, v]) => a[k] !== v).map(([k, v]) => `${k}: alias=${JSON.stringify(a[k])} spec=${JSON.stringify(v)}`);
  const extra = Object.keys(a).filter((k) => !k.startsWith('_') && !(k in want));
  if (bad.length) fail(`${f.alias}: alias drifted from spec — ${bad.join('; ')}`);
  else if (extra.length) fail(`${f.alias}: alias carries fields the spec does not derive: ${extra.join(', ')}`);
  else ok(`${f.alias} registered, ${Object.keys(want).length} fields == spec`);
}

// ---------------------------------------------------------------- 3. no env overlay touches these
for (const name of readdirSync(join(ROOT, 'test-data')).filter((n) => /^aliases\..+\.json$/.test(n))) {
  let o; try { o = JSON.parse(readFileSync(join(ROOT, 'test-data', name), 'utf8')); } catch { continue; }
  const hits = Object.keys(o).filter((k) => k.startsWith(ALIAS_PREFIX));
  if (hits.length) fail(`${name} overrides ${hits.join(', ')} — image fixtures are static files, never per-env`);
}
ok('no aliases.<env>.json overlay overrides an IMG_THUMB_* alias');

// ---------------------------------------------------------------- 4. files: exist, size, sha256, magic, header
for (const f of FIXTURES) {
  const rel = aliasStaticFields(f).path, abs = join(ROOT, rel);
  if (!existsSync(abs)) { fail(`${f.alias}: ${rel} does not exist`); continue; }
  let buf = readFileSync(abs);
  if (f.text) buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  const sha = createHash('sha256').update(buf).digest('hex');
  const errs = [];
  if (buf.length !== f.bytes) errs.push(`bytes ${buf.length} != ${f.bytes}`);
  if (sha !== f.sha256) errs.push(`sha256 ${sha.slice(0, 12)}… != ${f.sha256.slice(0, 12)}…`);
  const h = PARSERS[f.format](buf);
  if (!h.magic) errs.push(`magic bytes are not ${f.format}`);
  if (f.corrupt) {
    if (h.width != null) errs.push('corrupt JPEG unexpectedly has a decodable frame header');
  } else if (h.magic) {
    if (h.width !== f.width || h.height !== f.height) errs.push(`header ${h.width}x${h.height} != ${f.width}x${f.height}`);
    if (h.frames !== f.frames) errs.push(`frames ${h.frames} != ${f.frames}`);
    if (h.progressive !== f.progressive) errs.push(`progressive ${h.progressive} != ${f.progressive}`);
    if (f.format === 'png' || f.format === 'webp') { if (h.hasAlpha !== f.hasAlpha) errs.push(`alpha ${h.hasAlpha} != ${f.hasAlpha}`); }
    if (f.format === 'jpeg') { const want = { CMYK: 4, L: 1, RGB: 3 }[f.colorModel]; if (h.components !== want) errs.push(`JPEG components ${h.components} != ${want} (${f.colorModel})`); }
    if (f.format === 'bmp') { if (h.bitsPerPixel !== f.bitsPerPixel) errs.push(`bpp ${h.bitsPerPixel} != ${f.bitsPerPixel}`); if (f.bitsPerPixel === 32 && h.compression !== 0) errs.push(`BMP32 compression ${h.compression} != 0 (BI_RGB) — hasAlpha=false no longer holds`); }
  }
  if (errs.length) fail(`${f.alias} (${rel}): ${errs.join('; ')}`);
  else ok(`${f.alias}: ${rel} ${f.format} ${f.corrupt ? 'corrupt (no SOF) as declared' : `${f.width}x${f.height}`} ${buf.length} B sha256 ok`);
}

console.log(problems.length ? `\n✗ ${problems.length} problem(s)` : `\n✓ image-thumbnails fixtures: all checks passed`);
process.exit(problems.length ? 1 : 0);
