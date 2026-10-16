/**
 * image-thumbnails-specs.mjs — SINGLE SOURCE OF TRUTH for the VCST-6268 Image Tools (thumbnails) source-image
 * fixture set. Side-effect free: importable by the drift guard and by any future helper.
 *
 * WHAT THIS IS. VCST-6268 replaces ImageSharp with SkiaSharp in vc-module-image-tools (PR #130). Suite 069b
 * (layer api) uploads these files into a per-run disposable assets folder `AGENT-TEST-6268-<runid>/` (the CASE
 * creates and deletes it — FIFTH RULE: nothing is seeded on the platform), runs a thumbnail task, then downloads
 * and measures the generated `<name>_<suffix>.<ext>` blobs. No platform entity, no runtime id, no env write:
 * every alias field below is a static fact about a committed file.
 *
 * PROVENANCE.
 *   source = 'pr'        — byte-for-byte copy of the PR's own unit-test fixture
 *                          (PROVENANCE.repo @ PROVENANCE.sha, PROVENANCE.dir/<sourceName>), verified by magic bytes
 *                          and sha256 on download 2026-10-12.
 *   source = 'generated' — produced ONCE, outside the repo, with Pillow 12.2 (recipe in GENERATED_RECIPE). The
 *                          committed bytes ARE the fixture: sha256 pins them, so a re-generation is never required
 *                          and never silently substituted.
 *   The PR ships no SVG; IMG_THUMB_SVG is generated (hand-written markup).
 *
 * DISCRIMINATION (SECOND RULE — what each file can tell apart).
 *   - Most PR fixtures are 80x40: SMALLER than typical thumbnail sizes, so on them a resize task UPSCALES. A
 *     downscale assertion must use IMG_THUMB_JPEG_LARGE / IMG_THUMB_QUADRANT_JPEG / IMG_THUMB_CHECKERBOARD /
 *     IMG_THUMB_JPEG_NOISE (larger than common thumb sizes).
 *   - IMG_THUMB_CHECKERBOARD is a 1-px black/white checkerboard: a correct (area/linear) downscale averages to mid
 *     grey (~128); nearest-neighbour or a broken sampler yields pure black/white or moire. Resampling quality is
 *     decidable on it, on nothing else in the set.
 *   - IMG_THUMB_QUADRANT_JPEG is 301x199 (both odd, aspect 1.513) with four flat, maximally different quadrant
 *     colours split at x=150 / y=99 (left/top quadrants get the floor). Pad vs crop vs stretch, the crop anchor
 *     (which colours survive at which edge) and odd-size rounding (+-1 px) all produce DIFFERENT observations.
 *   - IMG_THUMB_JPG_BASELINE and IMG_THUMB_JPEG_BASELINE are BYTE-IDENTICAL (same sha256) and differ ONLY in
 *     extension (.jpg / .jpeg) and share the basename `jpeg-baseline`: output-extension preservation and
 *     thumbnail-name collisions are decidable; pixel output of the two must be equal.
 *   - Alpha: PNG_RGBA and WEBP_LOSSLESS_ALPHA carry real alpha (extrema 0..255) — transparency preservation vs
 *     flattening is decidable when the thumb is PNG/WebP, and the JPEG-output background colour when it is not.
 *     PNG_RGB / WEBP_LOSSY are the no-alpha siblings. BMP32 is BI_RGB (compression 0): its 4th byte is NOT alpha
 *     by the BMP spec (Pillow decodes RGB), so hasAlpha=false — a decoder that treats it as alpha is the finding.
 *   - CMYK / grayscale JPEGs: colour-space conversion (a CMYK source rendered inverted or tinted) is decidable.
 *   - WEBP_ANIMATED has 2 frames: first-frame vs failure vs animated output.
 *   - CORRUPT_JPEG is 16 bytes (SOI + truncated JFIF): the task must report/skip it, never hang or emit a blob.
 *
 * LIMITS (stated, not hidden). The 80x40 PR fixtures cannot prove downscale quality. The guard checks headers,
 * size and sha256 — it does not decode pixels (no image codec dependency); the pixel facts above (quadrant
 * colours, alpha extrema, checker cell) were measured with Pillow once at authoring time and are pinned by sha256.
 * Text files (SVG) are hashed with CRLF normalised to LF, because core.autocrlf may rewrite them on checkout.
 */

export const TICKET = 'VCST-6268';
export const ALIAS_PREFIX = 'IMG_THUMB_';
export const IMAGE_DIR = 'test-data/uploads/image-thumbnails';
/** Per-run assets folder the CASE creates and deletes (never seeded). `<runid>` is supplied by the run. */
export const RUN_FOLDER_PATTERN = 'AGENT-TEST-6268-<runid>';

export const PROVENANCE = Object.freeze({
  repo: 'VirtoCommerce/vc-module-image-tools',
  pr: 130,
  sha: '6db0e3bac6ef8ec19e7eb8591c2b55cb5deaf13d',
  dir: 'tests/VirtoCommerce.ImageToolsModule.Tests/media/formats',
});

export const GENERATED_RECIPE = [
  'Pillow 12.2, run once outside the repo:',
  'QUADRANT: Image.new("RGB",(301,199)); rectangles TL red (0..149,0..98), TR green (150..300,0..98), BL blue (0..149,99..198), BR yellow (150..300,99..198); save JPEG quality=95 subsampling=0.',
  'LARGE: 400x300 base of smooth sin/cos gradients + 40 random ellipses (random.Random(6268)), GaussianBlur(3), BICUBIC resize to 4000x3000, blend 4% Image.effect_noise(6); save JPEG quality=82 progressive=True optimize=True.',
  'SVG: hand-written 200x120 four-quadrant markup (red/green/blue/yellow), LF line endings.',
].join(' ');

/**
 * One row per alias. Static facts only. `colorModel` is what the decoder reports (Pillow mode at authoring);
 * `width/height/frames/progressive/bitsPerPixel` are re-derived from the file header by the guard.
 */
export const FIXTURES = Object.freeze([
  { alias: 'IMG_THUMB_JPG_BASELINE', file: 'jpeg-baseline.jpg', source: 'pr', format: 'jpeg', mime: 'image/jpeg', width: 80, height: 40, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 795, sha256: '606066ce492250d5e01cdc1fb2967d362b2e43feba43afc8f5a22833270d3a58', role: 'baseline JPEG, .jpg extension (byte-identical to IMG_THUMB_JPEG_BASELINE)' },
  { alias: 'IMG_THUMB_JPEG_BASELINE', file: 'jpeg-baseline.jpeg', source: 'pr', format: 'jpeg', mime: 'image/jpeg', width: 80, height: 40, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 795, sha256: '606066ce492250d5e01cdc1fb2967d362b2e43feba43afc8f5a22833270d3a58', role: 'baseline JPEG, .jpeg extension (byte-identical to IMG_THUMB_JPG_BASELINE)' },
  { alias: 'IMG_THUMB_JPEG_PROGRESSIVE', file: 'jpeg-progressive.jpg', source: 'pr', format: 'jpeg', mime: 'image/jpeg', width: 80, height: 40, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: true, bytes: 592, sha256: '55040a73ddbf1716ed57f55392f5ca305324e9825249576aba4d52ad599bba86', role: 'progressive JPEG (SOF2)' },
  { alias: 'IMG_THUMB_JPEG_CMYK', file: 'jpeg-cmyk.jpg', source: 'pr', format: 'jpeg', mime: 'image/jpeg', width: 80, height: 40, colorModel: 'CMYK', hasAlpha: false, frames: 1, progressive: false, bytes: 396, sha256: 'f44727a456034920a5d0e5a701a26fc4e4a2b30b1292ef7369c096ca41192acb', role: 'CMYK JPEG (4 components) — colour conversion' },
  { alias: 'IMG_THUMB_JPEG_GRAY', file: 'jpeg-grayscale.jpg', source: 'pr', format: 'jpeg', mime: 'image/jpeg', width: 80, height: 40, colorModel: 'L', hasAlpha: false, frames: 1, progressive: false, bytes: 384, sha256: 'f9e174768f60b96f6f93c178f6d4b574420093541cf23c6dccd4770fd8247113', role: 'grayscale JPEG (1 component)' },
  { alias: 'IMG_THUMB_JPEG_NOISE', file: 'jpeg-noise.jpg', source: 'pr', format: 'jpeg', mime: 'image/jpeg', width: 128, height: 128, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 33029, sha256: '39c8d953f28d7d9ad52d428157ae80c06f1b45166f9c982807ea6da82cccab63', role: 'high-entropy JPEG — output size / quality setting' },
  { alias: 'IMG_THUMB_JPEG_LARGE', file: 'photo-4000x3000.jpg', source: 'generated', format: 'jpeg', mime: 'image/jpeg', width: 4000, height: 3000, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: true, bytes: 244675, sha256: '7ea27a2cbbf4419b56295ee299a1ac4d7b7421ad48f6f362b72a45335811486e', role: '12 MP photo-like progressive JPEG — large-source decode / memory / time' },
  { alias: 'IMG_THUMB_QUADRANT_JPEG', file: 'quadrant-301x199.jpg', source: 'generated', format: 'jpeg', mime: 'image/jpeg', width: 301, height: 199, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 5581, sha256: '1be439b5ff273978bb781c62eadd13e0ba98c4f611f367a494ba75385b557276', role: 'odd-aspect four-quadrant JPEG (TL red, TR green, BL blue, BR yellow; split x=150 y=99) — pad / crop anchor / rounding', quadrants: 'TL=#FF0000,TR=#00FF00,BL=#0000FF,BR=#FFFF00', splitX: 150, splitY: 99 },
  { alias: 'IMG_THUMB_PNG_RGBA', file: 'png-rgba.png', source: 'pr', format: 'png', mime: 'image/png', width: 80, height: 40, colorModel: 'RGBA', hasAlpha: true, frames: 1, progressive: false, bytes: 192, sha256: 'eb19f78a3d0e960516b2dced9f0cf006c64f96525afb97bff76c5050413e74c8', role: 'PNG with real alpha (0..255)' },
  { alias: 'IMG_THUMB_PNG_RGB', file: 'png-rgb.png', source: 'pr', format: 'png', mime: 'image/png', width: 80, height: 40, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 153, sha256: 'c5c58be65452cf1b41c9e0390ea6eb71dd2996a19b93e98ffa5a08ccb255d1dc', role: 'PNG without alpha (sibling of PNG_RGBA)' },
  { alias: 'IMG_THUMB_CHECKERBOARD', file: 'checkerboard-512.png', source: 'pr', format: 'png', mime: 'image/png', width: 512, height: 512, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 2225, sha256: 'd44a2e19cf0513a4acb360ec7c13fa6eb746edbecbc319c69918c71a52f4cc38', role: '1-px black/white checkerboard — downscale must average to mid grey (~128); nearest-neighbour gives black/white/moire', cellPx: 1 },
  { alias: 'IMG_THUMB_WEBP_LOSSY', file: 'webp-lossy.webp', source: 'pr', format: 'webp', mime: 'image/webp', width: 80, height: 40, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 106, sha256: '3a6a5e1f7b9e5a97226c68e429d68a64fb54a1385dd09fa27641baee769d7f4f', role: 'lossy WebP (VP8)' },
  { alias: 'IMG_THUMB_WEBP_LOSSLESS_ALPHA', file: 'webp-lossless-alpha.webp', source: 'pr', format: 'webp', mime: 'image/webp', width: 80, height: 40, colorModel: 'RGBA', hasAlpha: true, frames: 1, progressive: false, bytes: 50, sha256: '8ce74acd5e38a183ff340c6ec9bcc407534ce4fe8689512566cf1583ce0055d4', role: 'lossless WebP with alpha (VP8L)' },
  { alias: 'IMG_THUMB_WEBP_ANIMATED', file: 'webp-animated.webp', source: 'pr', format: 'webp', mime: 'image/webp', width: 80, height: 40, colorModel: 'RGB', hasAlpha: false, frames: 2, progressive: false, bytes: 160, sha256: 'fdd22a5dfe6fe227fd94e8e2ce1156ed6e8789aa03fe86acb79cc3930e51202f', role: 'animated WebP, 2 frames (VP8X + ANMF)' },
  { alias: 'IMG_THUMB_BMP24', file: 'bmp-24.bmp', source: 'pr', format: 'bmp', mime: 'image/bmp', width: 80, height: 40, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 9654, sha256: 'b00cdaa8b4144bc3ab5308ded7c6a6af2e54e206de15d09f4b44ccc0fe8dbaab', role: '24-bit BMP', bitsPerPixel: 24 },
  { alias: 'IMG_THUMB_BMP32', file: 'bmp-32.bmp', source: 'pr', format: 'bmp', mime: 'image/bmp', width: 80, height: 40, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 12854, sha256: '74004ce302da540e1bde5d81c9f8b0edb9eb209b96e168daeafc117a380aff9f', role: '32-bit BMP, BI_RGB (4th byte is not alpha by spec)', bitsPerPixel: 32 },
  { alias: 'IMG_THUMB_SVG', file: 'vector-200x120.svg', source: 'generated', format: 'svg', mime: 'image/svg+xml', width: 200, height: 120, colorModel: 'vector', hasAlpha: false, frames: 1, progressive: false, bytes: 345, sha256: 'd75fd1b64e00d391748c1baca0f08ac77d92eb1106d6d6cd54cfc7f0bbdba3b9', role: 'small valid SVG (four-quadrant, 200x120) — vector source handling', text: true },
  { alias: 'IMG_THUMB_GIF', file: 'gif.gif', source: 'pr', format: 'gif', mime: 'image/gif', width: 80, height: 40, colorModel: 'P', hasAlpha: false, frames: 1, progressive: false, bytes: 983, sha256: '9a8e6c5efe969dadccb82a7ae9e57d917811582c7be8860e9c87fb84458776e0', role: 'GIF89a, palette, single frame' },
  { alias: 'IMG_THUMB_TIFF', file: 'tiff.tif', source: 'pr', format: 'tiff', mime: 'image/tiff', width: 80, height: 40, colorModel: 'RGB', hasAlpha: false, frames: 1, progressive: false, bytes: 9832, sha256: '9f464952b7075e64c0ddc7343f1eb3cfec729d250b5f17fedca3aa3730cbb52e', role: 'little-endian TIFF (.tif)' },
  { alias: 'IMG_THUMB_CORRUPT_JPEG', file: 'corrupt.jpg', source: 'pr', format: 'jpeg-corrupt', mime: 'image/jpeg', width: 0, height: 0, colorModel: 'none', hasAlpha: false, frames: 0, progressive: false, bytes: 16, sha256: 'eb5a550e38b8b038f777c0371e11b844b45f53e9559c45e66d76bbc7a19cbc4d', role: 'truncated JPEG (SOI + partial JFIF, no SOF) — must fail cleanly, no thumbnail blob', corrupt: true },
]);

/** Source file name inside the PR fixture dir (same as `file` for every 'pr' row). */
export const sourceName = (f) => (f.source === 'pr' ? f.file : null);

/** The alias fields aliases.json must carry for one fixture — derived, never hand-maintained twice. */
export function aliasStaticFields(f) {
  const out = {
    path: `${IMAGE_DIR}/${f.file}`,
    file: f.file,
    ext: f.file.slice(f.file.lastIndexOf('.') + 1),
    stem: f.file.slice(0, f.file.lastIndexOf('.')),
    format: f.format,
    mime: f.mime,
    width: String(f.width),
    height: String(f.height),
    colorModel: f.colorModel,
    hasAlpha: String(f.hasAlpha),
    frames: String(f.frames),
    progressive: String(f.progressive),
    bytes: String(f.bytes),
    sha256: f.sha256,
    source: f.source === 'pr' ? `${PROVENANCE.repo}@${PROVENANCE.sha}:${PROVENANCE.dir}/${f.file}` : 'generated (scripts/seed-data/image-tools/image-thumbnails-specs.mjs GENERATED_RECIPE)',
  };
  for (const k of ['bitsPerPixel', 'quadrants', 'splitX', 'splitY', 'cellPx']) if (f[k] != null) out[k] = String(f[k]);
  return out;
}

/** Non-vacuity contract (SECOND RULE). Returns a list of problems; empty = discriminating. */
export function validateFixtureShape() {
  const p = [];
  const by = Object.fromEntries(FIXTURES.map((f) => [f.alias, f]));
  const aliases = FIXTURES.map((f) => f.alias);
  if (new Set(aliases).size !== aliases.length) p.push('duplicate alias in FIXTURES');
  if (new Set(FIXTURES.map((f) => f.file)).size !== FIXTURES.length) p.push('two aliases point at the same file');
  for (const f of FIXTURES) if (!f.alias.startsWith(ALIAS_PREFIX)) p.push(`${f.alias}: must start with ${ALIAS_PREFIX}`);
  const j = by.IMG_THUMB_JPG_BASELINE, e = by.IMG_THUMB_JPEG_BASELINE;
  if (!j || !e || j.sha256 !== e.sha256 || !j.file.endsWith('.jpg') || !e.file.endsWith('.jpeg')) p.push('JPG/JPEG baseline pair must be byte-identical and differ only by .jpg/.jpeg extension');
  if (j && e && j.file.replace(/\.[^.]+$/, '') !== e.file.replace(/\.[^.]+$/, '')) p.push('JPG/JPEG baseline pair must share a basename (thumbnail-name collision case)');
  const q = by.IMG_THUMB_QUADRANT_JPEG;
  if (!q || q.width % 2 === 0 || q.height % 2 === 0 || q.width === q.height) p.push('QUADRANT must be non-square with BOTH dimensions odd (rounding is decidable only then)');
  if (q && new Set(String(q.quadrants).split(',').map((s) => s.split('=')[1])).size !== 4) p.push('QUADRANT must carry four DIFFERENT colours');
  const L = by.IMG_THUMB_JPEG_LARGE;
  if (!L || L.width < 4000 || L.height < 3000 || L.bytes > 3 * 1024 * 1024) p.push('JPEG_LARGE must be >= 4000x3000 and <= 3 MB committed');
  const alpha = FIXTURES.filter((f) => f.hasAlpha).map((f) => f.format);
  if (!alpha.includes('png') || !alpha.includes('webp')) p.push('need a real-alpha PNG and a real-alpha WebP');
  if (by.IMG_THUMB_PNG_RGB?.hasAlpha || by.IMG_THUMB_WEBP_LOSSY?.hasAlpha) p.push('no-alpha siblings must not carry alpha');
  if (!(by.IMG_THUMB_WEBP_ANIMATED?.frames > 1)) p.push('WEBP_ANIMATED must have > 1 frame');
  if (by.IMG_THUMB_JPEG_PROGRESSIVE?.progressive !== true || by.IMG_THUMB_JPG_BASELINE?.progressive !== false) p.push('progressive vs baseline must diverge');
  if (by.IMG_THUMB_JPEG_CMYK?.colorModel !== 'CMYK' || by.IMG_THUMB_JPEG_GRAY?.colorModel !== 'L') p.push('CMYK / grayscale JPEG colour models must be CMYK / L');
  if (by.IMG_THUMB_BMP24?.bitsPerPixel === by.IMG_THUMB_BMP32?.bitsPerPixel) p.push('BMP24 and BMP32 must differ in bit depth');
  if (!by.IMG_THUMB_CORRUPT_JPEG?.corrupt) p.push('CORRUPT_JPEG must be flagged corrupt');
  if (by.IMG_THUMB_CHECKERBOARD?.cellPx !== 1) p.push('CHECKERBOARD must be a 1-px checker (the resampling discriminator)');
  const downscalers = FIXTURES.filter((f) => !f.corrupt && f.format !== 'svg' && Math.min(f.width, f.height) >= 128);
  if (downscalers.length < 3) p.push('need >= 3 raster sources >= 128 px on the short side so a downscale is observable');
  return p;
}
