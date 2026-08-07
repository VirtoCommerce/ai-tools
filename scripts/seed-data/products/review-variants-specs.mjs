/**
 * review-variants-specs.mjs — single source of truth for the customer-review RENDER-VARIANT
 * matrix (VCST-5487 "Update product reviews design", vc-frontend PR #2417).
 *
 * Side-effect free: importing this module must not touch the network or the filesystem,
 * so the drift-guard validator and the unit tests can import it.
 *
 * WHY a second reviews seeder next to `seed-reviews.mjs`:
 *   `seed-reviews.mjs` seeds the MODERATION/pagination corpus (>=6 Approved + 1 New +
 *   1 Rejected on ONE product) that suites 086/087 need. This one seeds the STOREFRONT
 *   RENDER matrix the redesign needs — every combination of {rating} x {text length} x
 *   {image count} that renders differently in the new review card and image modal:
 *   text-only, long-text-only, no-text, 1 / 2 / 3 / 4 images, image+text,
 *   image+rating+text, and the 1-star / 5-star aggregate extremes.
 *   The two do not overlap and target different products.
 *
 * Aggregate averages are chosen deliberately:
 *   MATRIX host  -> 8 reviews, rating sum 27 => 27/8 = 3.375, which the PDP header must
 *                   render as "3.4" (one-decimal rounding of a repeating value) and which
 *                   fills the 4th star ~37.5% (continuous partial fill, not a half-star).
 *                   8 > PAGE_SIZE (5) => the list also paginates (2 pages).
 *   ONE_STAR     -> a single 1-star review => average 1.0, star 1 full, stars 2-5 empty.
 *   FIVE_STAR    -> a single 5-star review with exactly ONE image => average 5.0 AND the
 *                   `images.length === 1` modal branch (no nav buttons, no dots, "1 / 1")
 *                   which has no fixture anywhere else on the env.
 */

export const USER_PREFIX = 'AGENT-TEST-revvar-';

/**
 * Review images are attached by REFERENCE to blobs that already exist on the platform —
 * this seeder never uploads. `IMAGE_POOL` is resolved at run time by reading the images off
 * an existing review (see `resolveImagePool` in the seeder), so no blob GUID is committed
 * here and the pool follows whatever the env actually holds.
 *
 * A spec asks for N images; the seeder takes the first N from the resolved pool.
 */
export const MAX_IMAGES_NEEDED = 4;

/** Long-form body used by the "big text only" variant (~2.5k chars once repeated). */
const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris eget ante quis turpis ' +
  'imperdiet fermentum. Maecenas tempor turpis vitae erat vehicula, eget placerat metus ' +
  'fringilla. Nullam elementum quam sapien, nec porttitor velit ultrices a. Morbi convallis ' +
  'tellus vitae turpis auctor lobortis. Pellentesque lacus leo, ultrices in porta eget, ' +
  'posuere nec purus. Sed auctor auctor neque et sollicitudin. Ut congue lacus eget vulputate ' +
  'rhoncus. Fusce tempus sodales sapien, vitae sodales tellus eleifend id.';

export const LONG_TEXT = [LOREM, LOREM, LOREM, LOREM].join('\n\n');

/**
 * Products that host the matrix. Identified by their STABLE SEO SLUG, never by GUID —
 * the runtime product id is resolved live and written to aliases.<env>.json.
 * All three are store-visible on B2B-store and carried ZERO reviews before this seeder.
 */
export const HOSTS = {
  REV_VAR_MATRIX: {
    slug: 'printers/multifunction-printers/laser-monochrome/canon-imageclass-wifi-mf232w-monochrome-laser-printerscannercopier-color-black',
    note: '8 approved reviews covering every render variant; average 3.375 renders as "3.4"; 2 pages',
  },
  REV_VAR_ONE_STAR: {
    slug: 'printers/multifunction-printers/laser-monochrome/xerox-workcentre-3335dni-mono-laser-multifunction-printercopierscannerfax-machine-color-blue-gray',
    note: 'single 1-star text-only review => aggregate 1.0 (lowest non-zero rating render)',
  },
  REV_VAR_FIVE_STAR: {
    slug: 'printers/all-in-one/paper-crafts/epson-expression-premium-xp-830-all-in-one-wireless-printer-color-black',
    note: 'single 5-star review with exactly ONE image => aggregate 5.0 + the "1 / 1" modal branch',
  },
};

/**
 * The variant matrix. `u` is the per-review user suffix (=> a stable, idempotent identity),
 * `images` is how many blobs from the pool to attach, `text` is the review body.
 *
 * `variant` names the render combination each row exists to prove — keep it in sync with the
 * REV-SF-* case that asserts it, so a reader can trace fixture -> case.
 */
export const VARIANTS = [
  // ---- MATRIX host: 8 cards, rating sum 27 -> 3.375 -> "3.4", 2 pages -------------------
  {
    host: 'REV_VAR_MATRIX', u: 'text5', rating: 5, images: 0,
    variant: 'text only, top rating',
    userName: 'AGENT-TEST Text Only Five',
    text: 'AGENT-TEST text-only review at the maximum rating. No images attached.',
  },
  {
    host: 'REV_VAR_MATRIX', u: 'longtext', rating: 4, images: 0,
    variant: 'long text only (wrapping / clamping / card growth)',
    userName: 'AGENT-TEST Long Text',
    text: `AGENT-TEST long-form review body.\n\n${LONG_TEXT}`,
  },
  {
    host: 'REV_VAR_MATRIX', u: 'text1', rating: 1, images: 0,
    variant: 'text only, lowest rating (1 star card)',
    userName: 'AGENT-TEST Text Only One',
    text: 'AGENT-TEST text-only review at the minimum rating.',
  },
  {
    host: 'REV_VAR_MATRIX', u: 'notext', rating: 3, images: 0,
    variant: 'rating only, EMPTY body (no text, no images)',
    userName: 'AGENT-TEST Rating Only',
    text: '',
  },
  {
    host: 'REV_VAR_MATRIX', u: 'img1', rating: 4, images: 1,
    variant: 'ONE image + text + rating',
    userName: 'AGENT-TEST One Image',
    text: 'AGENT-TEST review carrying exactly one photo.',
  },
  {
    host: 'REV_VAR_MATRIX', u: 'img2', rating: 2, images: 2,
    variant: 'TWO images + text + rating',
    userName: 'AGENT-TEST Two Images',
    text: 'AGENT-TEST review carrying exactly two photos.',
  },
  {
    host: 'REV_VAR_MATRIX', u: 'img3', rating: 5, images: 3,
    variant: 'THREE images + text + rating',
    userName: 'AGENT-TEST Three Images',
    text: 'AGENT-TEST review carrying exactly three photos.',
  },
  {
    host: 'REV_VAR_MATRIX', u: 'img4notext', rating: 3, images: 4,
    variant: 'FOUR images, EMPTY body (images without text)',
    userName: 'AGENT-TEST Four Images No Text',
    text: '',
  },

  // ---- aggregate extremes --------------------------------------------------------------
  {
    host: 'REV_VAR_ONE_STAR', u: 'agg1', rating: 1, images: 0,
    variant: 'aggregate 1.0 — star 1 full, stars 2-5 empty',
    userName: 'AGENT-TEST Aggregate One',
    text: 'AGENT-TEST sole review, one star, so the product average is exactly 1.0.',
  },
  {
    host: 'REV_VAR_FIVE_STAR', u: 'agg5', rating: 5, images: 1,
    variant: 'aggregate 5.0 + single-image modal branch ("1 / 1", no nav, no dots)',
    userName: 'AGENT-TEST Aggregate Five',
    text: 'AGENT-TEST sole review, five stars, one photo.',
  },
];

/** Expected aggregate per host — the drift guard and the test cases both read this. */
export function expectedAggregates() {
  const out = {};
  for (const key of Object.keys(HOSTS)) {
    const rows = VARIANTS.filter((v) => v.host === key);
    const sum = rows.reduce((a, v) => a + v.rating, 0);
    out[key] = {
      count: rows.length,
      sum,
      average: sum / rows.length,
      // what the PDP header must render (i18n n() with exactly one fraction digit)
      displayed: (sum / rows.length).toFixed(1),
    };
  }
  return out;
}
