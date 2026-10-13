/**
 * category-images-specs.mjs — side-effect-free source of truth for `seed-category-images.mjs` and its
 * drift guard `validate-category-images-data.mjs`. No env load, no network, no main().
 *
 * The fixture is a MAPPING, not an entity: `test-data/catalogs/category-images.csv` names an image file
 * under `test-data/uploads/categories images/` and the category NAME it belongs to. Categories are
 * resolved by name inside the store's catalog at seed time — never by a committed id — so the same CSV
 * works on every env that carries those categories (an env that lacks one just reports it as unmatched).
 */
import { extname } from 'node:path';

export const CSV_PATH = 'test-data/catalogs/category-images.csv';
export const IMAGE_DIR = 'test-data/uploads/categories images';
export const CSV_COLUMNS = ['image_file', 'category_name', 'notes'];

/**
 * Platform asset folder the images are uploaded to. It is also the TEARDOWN MARKER: an image whose url
 * contains this path segment is ours. The marker lives in the url, never in the image name, because
 * the name is a displayed field (alt text in the admin Images blade).
 */
export const ASSET_FOLDER = 'catalog/agent-test-category-images';

/** Generated placeholder images (`enrichCategoryContent` in seed-common.mjs) are replaced by the real one. */
export const PLACEHOLDER_NAME_PREFIX = 'AGENT-TEST-IMG-';

export const CONTENT_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export const contentTypeFor = (file) => CONTENT_TYPES[extname(file).toLowerCase()] || null;

/** Case/whitespace-insensitive category-name key. Punctuation is kept: "TV & Multimedia" ≠ "TV Multimedia". */
export const nameKey = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const isOurImage = (img) => String(img?.url || '').includes(`/${ASSET_FOLDER}/`);
export const isPlaceholder = (img) => String(img?.name || '').startsWith(PLACEHOLDER_NAME_PREFIX);

/**
 * The category's images[] after seeding `newImage` (`{ url, name }`): ours first (sortOrder 0), generated
 * placeholders and any previous copy of ours dropped, every other (hand-set) image kept in its order
 * behind it. Returns `{ images, changed }` — `changed` is false when the array is already in that shape.
 */
export function planImages(current, newImage) {
  const cur = current || [];
  const kept = cur.filter((im) => !isPlaceholder(im) && !isOurImage(im));
  const images = [
    { url: newImage.url, name: newImage.name, group: 'images', sortOrder: 0, languageCode: null },
    ...kept.map((im, i) => ({ ...im, sortOrder: i + 1 })),
  ];
  const sig = (arr) => JSON.stringify(arr.map((im) => [im.url, im.sortOrder ?? 0]));
  const sorted = [...cur].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return { images, changed: sig(sorted) !== sig(images) };
}

/** Teardown shape: drop our images, re-number the rest. */
export function stripOurImages(current) {
  const cur = current || [];
  const kept = cur.filter((im) => !isOurImage(im)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return { images: kept.map((im, i) => ({ ...im, sortOrder: i })), changed: kept.length !== cur.length };
}

/** Static contract problems for the CSV rows. `fileExists(name)` is injected so this stays pure. */
export function rowProblems(rows, header, fileExists) {
  const out = [];
  const missingCols = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missingCols.length) out.push(`CSV is missing column(s): ${missingCols.join(', ')}`);
  const seenFile = new Map(); const seenName = new Map();
  rows.forEach((r, i) => {
    const at = `row ${i + 2}`;
    if (!r.image_file) out.push(`${at}: empty image_file`);
    if (!r.category_name) out.push(`${at}: empty category_name`);
    if (r.image_file && !contentTypeFor(r.image_file)) out.push(`${at}: ${r.image_file} — unsupported extension (${Object.keys(CONTENT_TYPES).join(' ')})`);
    if (r.image_file && !fileExists(r.image_file)) out.push(`${at}: ${r.image_file} not found in ${IMAGE_DIR}/`);
    const f = String(r.image_file).toLowerCase(); const n = nameKey(r.category_name);
    if (seenFile.has(f)) out.push(`${at}: image_file ${r.image_file} already used on row ${seenFile.get(f)}`); else seenFile.set(f, i + 2);
    if (seenName.has(n)) out.push(`${at}: category_name "${r.category_name}" already mapped on row ${seenName.get(n)}`); else seenName.set(n, i + 2);
  });
  return out;
}
