#!/usr/bin/env node
/**
 * scripts/seed-data/analytics/validate-ga4-lists-data.mjs  (td:validate:ga4-lists)
 *
 * STATIC drift guard (no network) for the VCST-6017 GA4 product-list fixtures. It owns the fixtures'
 * NON-VACUITY contract — the property that makes each list able to FAIL on a wrong implementation:
 *   1. the declared spec (ga4-lists-specs.mjs validateSpec): every list longer than its storefront window,
 *      variation prices distinct, SFL > its Show-more step, RB within the cart's window, partial HTML lean;
 *   2. the GA4 Page Builder fixtures (test-data/cms/page-content.json): every product-rendering block type
 *      present, the titled/untitled carousel pair, a marked block below the fold, and EACH pool group used by
 *      AT MOST ONE block across both pages (one product → one list → attributable events);
 *   3. alias registry: the five aliases registered, GUID-free in aliases.json, `seed` naming a real script;
 *   4. no runtime GUID in the spec module or the content fixture;
 *   5. SEEDED state (aliases.<env>.json, every committed overlay that carries them): related / cart groups
 *      disjoint, RB ∩ SFL = ∅, counts above their windows. This is where a collapsed gap would show.
 * Exit 1 on any violation.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateSpec, poolRefs, POOL_KEYS, ALIASES, STOREFRONT_WINDOWS, RELATED, VARIATIONS, POOL_PLAN,
} from './ga4-lists-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const size = Object.fromEntries(POOL_PLAN.map((g) => [g.key, g.size]));
const sflTarget = size.savedForLater + (size.savedForLaterTail || 0);

console.log('=== validate VCST-6017 GA4 list fixtures (static drift guard) ===');

// 1. declared spec
const sp = validateSpec();
sp.forEach(fail);
if (!sp.length) ok(`spec: related ${RELATED.count} > ${STOREFRONT_WINDOWS.relatedCarouselMaxPerView}/view, variations ${VARIATIONS.count} > page ${STOREFRONT_WINDOWS.variationsPageSize}, SFL ${sflTarget} > step ${STOREFRONT_WINDOWS.savedForLaterStep}, RB ${size.recentlyBrowsed} <= ${STOREFRONT_WINDOWS.recentlyBrowsedMax}`);

// 2. Page Builder fixtures
const content = JSON.parse(readFileSync(join(ROOT, 'test-data/cms/page-content.json'), 'utf8'));
const lists = content[ALIASES.listsPage], html = content[ALIASES.htmlPage];
if (!lists?.content?.length) fail(`${ALIASES.listsPage}: no content in page-content.json`);
if (!html?.content?.length) fail(`${ALIASES.htmlPage}: no content in page-content.json`);
if (lists?.content) {
  const types = lists.content.map((b) => b.type);
  const REQUIRED = ['products', 'predefined-product-list', 'products-carousel', 'favorite-products', 'demo-product-list', 'product-info'];
  const missing = REQUIRED.filter((t) => !types.includes(t));
  if (missing.length) fail(`${ALIASES.listsPage}: missing product-rendering block type(s) ${missing.join(', ')}`);
  else ok(`${ALIASES.listsPage}: all ${REQUIRED.length} product-rendering block types present`);
  const carousels = lists.content.filter((b) => b.type === 'products-carousel');
  if (!carousels.some((b) => b.title) || !carousels.some((b) => b.title === '')) fail(`${ALIASES.listsPage}: needs one titled carousel AND one with title "" (the empty data-list-name case)`);
  else ok('carousel pair: one titled, one title ""');
  const spacerAt = lists.content.findIndex((b) => b.type === 'text' && /height:\s*(\d+)px/.test(b.text || '') && Number((b.text.match(/height:\s*(\d+)px/) || [])[1]) >= 1080);
  const MARKED = new Set(['products', 'predefined-product-list', 'products-carousel', 'favorite-products']);
  if (spacerAt < 0 || !lists.content.slice(spacerAt + 1).some((b) => MARKED.has(b.type))) fail(`${ALIASES.listsPage}: no marked block below a >= 1080px spacer (below-the-fold appear trigger)`);
  else ok(`below the fold: ${lists.content.slice(spacerAt + 1).filter((b) => MARKED.has(b.type)).map((b) => b.id).join(', ')}`);
}
if (html?.content) {
  const t = html.content.map((b) => b.text || '').join('');
  if (!/@@cards:\w+@@/.test(t) || !/@@cards-partial:\w+@@/.test(t)) fail(`${ALIASES.htmlPage}: needs one full-card and one partial-card plain-HTML list`);
  else ok(`${ALIASES.htmlPage}: full + name/price-only plain-HTML lists`);
  if (!html.content.some((b) => b.type === 'favorite-products' && /AGENT-TEST-[A-Z0-9-]*NO-SUCH/.test(b.filter || ''))) fail(`${ALIASES.htmlPage}: needs an EMPTY favorite-products block (filter matching no product)`);
  else ok('empty favorite_products container present');
}
const refs = [...poolRefs(lists), ...poolRefs(html)];
const byKey = new Map();
for (const r of refs) {
  if (!POOL_KEYS.has(r.key)) fail(`block ${r.block}: pool group "${r.key}" is not in POOL_PLAN`);
  byKey.set(r.key, [...(byKey.get(r.key) || []), r.block]);
}
const shared = [...byKey].filter(([, b]) => b.length > 1);
shared.forEach(([k, b]) => fail(`pool group "${k}" feeds ${b.length} blocks (${b.join(', ')}) — their view_item_list items[] would not be attributable`));
const reserved = ['related', 'cartLine', 'savedForLater', 'savedForLaterTail', 'recentlyBrowsed'].filter((k) => byKey.has(k));
reserved.forEach((k) => fail(`pool group "${k}" belongs to a non-page list but a page block uses it`));
if (refs.length && !shared.length && !reserved.length) ok(`${refs.length} pool references, each group feeds exactly one block`);

// 3. alias registry
const registry = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts || {};
let aliasBad = 0;
for (const name of Object.values(ALIASES)) {
  const a = registry[name];
  if (!a) { fail(`alias ${name} not registered in aliases.json`); aliasBad++; continue; }
  const leaks = JSON.stringify(a).match(GUID_RE);
  if (leaks) { fail(`alias ${name} carries runtime GUID(s) in aliases.json: ${leaks.join(', ')}`); aliasBad++; }
  if (!a.seed || !scripts[a.seed]) { fail(`alias ${name}: seed "${a.seed}" is not an npm script`); aliasBad++; }
}
if (!aliasBad) ok(`${Object.values(ALIASES).length} aliases registered, GUID-free, seed scripts exist`);

// 4. no GUID in committed sources
for (const rel of ['scripts/seed-data/analytics/ga4-lists-specs.mjs']) {
  const leaks = readFileSync(join(ROOT, rel), 'utf8').match(GUID_RE);
  if (leaks) fail(`${rel} leaks runtime GUID(s): ${leaks.join(', ')}`); else ok(`${rel}: no runtime GUID`);
}
for (const k of [ALIASES.listsPage, ALIASES.htmlPage]) {
  const leaks = JSON.stringify(content[k] || {}).match(GUID_RE);
  if (leaks) fail(`page-content.json ${k} leaks runtime GUID(s): ${leaks.join(', ')}`);
}

// 5. seeded state, per committed overlay
const split = (v) => String(v || '').split(',').filter(Boolean);
for (const f of readdirSync(join(ROOT, 'test-data')).filter((n) => /^aliases\.[\w-]+\.json$/.test(n))) {
  const o = JSON.parse(readFileSync(join(ROOT, 'test-data', f), 'utf8'));
  const rel = o[ALIASES.related], cart = o[ALIASES.cart], vp = o[ALIASES.variations], lp = o[ALIASES.listsPage];
  if (lp?.group_id) {
    const env0 = f.replace(/^aliases\.|\.json$/g, '');
    if (!lp.carousel_card_name || !(Number(lp.carousel_card_images) >= 2)) fail(`${env0}: ${ALIASES.listsPage} has no multi-image carousel card (carousel_card_name / carousel_card_images >= 2) — pbProducts has no multi-image product, so GA-040 is undecidable; re-run seed:cms-pages:ga4`);
    else ok(`${env0}: ${ALIASES.listsPage}.carousel_card_name = "${lp.carousel_card_name}" (${lp.carousel_card_images} images)`);
  }
  if (!rel && !cart && !vp) continue;
  const env = f.replace(/^aliases\.|\.json$/g, '');
  const groups = {};
  if (rel) groups.related = split(rel.related_ids);
  if (cart) Object.assign(groups, { cartLine: split(cart.cart_line_ids), savedForLater: split(cart.saved_for_later_ids), recentlyBrowsed: split(cart.recently_browsed_ids) });
  const seen = new Map(); let bad = 0;
  for (const [k, ids] of Object.entries(groups)) {
    const want = k === 'savedForLater' ? sflTarget : size[k];
    if (ids.length !== want) { fail(`${env}: seeded ${k} has ${ids.length}, plan ${want}`); bad++; }
    for (const id of ids) { if (seen.has(id)) { fail(`${env}: ${id} is in both ${seen.get(id)} and ${k}`); bad++; } seen.set(id, k); }
  }
  if (cart && Number(cart.saved_for_later_count) !== sflTarget) { fail(`${env}: seeded SFL holds ${cart.saved_for_later_count}, the converged target is exactly ${sflTarget}`); bad++; }
  if (cart && cart.rb_session_id === undefined) { fail(`${env}: CART_GA4_SFL_RB lacks rb_session_id — seeded by the pre-fix sessionless push, re-run seed:ga4-lists:cart`); bad++; }
  if (vp && Number(vp.pages) < 2) { fail(`${env}: seeded variation family spans ${vp.pages} page(s) — no page 2`); bad++; }
  if (!bad) ok(`${env}: seeded groups disjoint (${Object.keys(groups).join(', ')})${vp ? `, variations ${vp.family_total} rows / ${vp.pages} pages` : ''}`);
}

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
