/**
 * scripts/seed-data/cms/pagebuilder-pages-specs.mjs
 *
 * SINGLE machine-readable source of truth (side-effect-free) for the canonical qa-* PageBuilder
 * pages the suites 059/060 published-page cases (CMS-027–035, 078–085, 121–125) depend on. The
 * human narrative + block structures live in test-data/cms/pagebuilder-pages.md; THIS module is the
 * contract the reconcile seeder + validator + unit tests share.
 *
 * These are content pages authored in the PageBuilder shell — the seeder does NOT re-author their
 * blocks (content already exists); it RECONCILES the two fields that drift between test runs and
 * block the storefront-render cases: STATUS (a page archived after a prior run) and PERMALINK. A
 * page is matched to its spec ONLY by an EXACT name equality, so drifted "(copy)"/"-2"/"Updated"
 * clones are never mistaken for the canonical page. When the expected permalink is occupied by a
 * different page, the seeder REPORTS the conflict and does NOT force it (coordinator instruction).
 *
 * No runtime GUID lives here (VCST-5406): permalink/name/culture are env-invariant business keys;
 * the runtime groupId is written to aliases.<env>.json by the seeder.
 *
 * PageBuilder REST contract (verified live on vcst-qa 2026-07-21, VirtoCommerce.PageBuilderModule
 * 3.1017.0):
 *   - search:   POST /api/page-builder-pages/search { storeId, take }
 *   - get:      GET  /api/page-builder-pages/grouped/{groupId}
 *   - upsert:   POST /api/page-builder-pages/grouped  (full grouped object; sets status/permalink)
 *   - publish:  POST /api/page-builder-pages/grouped/publishing/{groupId}?publish=true
 *   - archive:  POST /api/page-builder-pages/grouped/archive?ids={groupId}
 *   Restore an Archived page to Published = upsert with status 'Draft' → publish (a bare publish on
 *   an Archived page is a 204 no-op — proven live).
 */

export const STATUS = { PUBLISHED: 'Published', DRAFT: 'Draft', ARCHIVED: 'Archived' };

/**
 * The 5 canonical pages. `personalization` documents the expected gating (not reconciled by the
 * seeder — it never touches visibility/org/userGroups, only status + permalink).
 */
export const CANONICAL_PAGES = [
  { alias: 'PB_HOMEPAGE',        name: 'QA Homepage Spring Sale',      permalink: '/qa-homepage-spring-sale',      culture: 'en-US', expectStatus: STATUS.PUBLISHED, personalization: 'none',       cases: 'CMS-027/029/031/078-085' },
  { alias: 'PB_WHOLESALE_GUIDE', name: 'QA Wholesale Buyer Guide 2026', permalink: '/qa-wholesale-buyer-guide',     culture: 'en-US', expectStatus: STATUS.PUBLISHED, personalization: 'userGroup',  cases: 'CMS-024/025/121-125' },
  // Multi-language: the platform models EN+DE as TWO single-culture pages that SHARE the permalink
  // (verified live — not one group with pages[]). deName is the de-DE version's canonical name;
  // familyPrefix + promoteNameRe let the seeder promote a drifted EN copy to the canonical EN page.
  { alias: 'PB_RETURN_POLICY',   name: 'QA Return Policy',             permalink: '/qa-return-policy',             culture: 'en-US', expectStatus: STATUS.PUBLISHED, personalization: 'none',       cases: 'CMS-027/028/031/035',
    multiLang: true, deName: 'QA Rückgaberichtlinie', familyPrefix: '/qa-return-policy', promoteNameRe: '^QA Return Policy' },
  // Scheduled promo. IMPORTANT (verified live 2026-07-21): a FUTURE-dated (Pending) page HIDES its
  // content in BOTH the draft and published projections (content API returns 0 blocks until the
  // window opens) — so a future baseline would render empty AND can't be content-verified/idempotent.
  // The verifiable baseline is therefore IN-WINDOW/Active (StartDate -1d in the past, EndDate +60d):
  // the page is live WITH content — the CMS-034 (in-window → 200) precondition. CMS-033 (future →
  // 404) toggles StartDate to a future date in its own steps (mirror of CMS-034 toggling to past).
  // Dates are relative-to-now (legitimately dynamic), recomputed each seed so the window never expires.
  { alias: 'PB_SUMMER_PREVIEW',  name: 'QA Summer Collection Preview', permalink: '/qa-summer-collection-preview', culture: 'en-US', expectStatus: STATUS.PUBLISHED, personalization: 'none',       cases: 'CMS-030/033/034',
    schedule: { startOffsetDays: -1, endOffsetDays: 60 } },
  { alias: 'PB_PARTNER_SUPPORT', name: 'QA Partner Portal Support',    permalink: '/qa-partner-portal-support',    culture: 'en-US', expectStatus: STATUS.PUBLISHED, personalization: 'org',        cases: 'CMS-024/025/026/030' },
];

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Pick the canonical page for a spec from a live page list — EXACT name equality only (drifted
 * "(copy)"/"-2"/"Updated" variants never match). Prefers the culture-matching version, then a
 * non-Archived one, so a re-run reconciles the intended page. Returns the page object or null.
 */
export function pickCanonical(pages, spec) {
  const exact = (pages || []).filter((p) => norm(p.name) === norm(spec.name));
  if (!exact.length) return null;
  const byCulture = exact.filter((p) => norm(p.cultureName) === norm(spec.culture));
  const pool = byCulture.length ? byCulture : exact;
  return pool.find((p) => p.status !== STATUS.ARCHIVED) || pool[0];
}

/**
 * Is spec.permalink occupied by a DIFFERENT page than `chosen`? Returns the conflicting page (so the
 * seeder can report it) or null. A page occupying the slot that IS `chosen` is not a conflict.
 */
export function permalinkConflict(pages, spec, chosen) {
  const chosenId = chosen?.id;
  return (pages || []).find((p) => norm(p.permalink) === norm(spec.permalink) && p.id !== chosenId) || null;
}

/** Build the restore-to-Draft upsert body from a fetched grouped page object. */
export function draftBody(full) {
  const body = JSON.parse(JSON.stringify(full));
  body.status = STATUS.DRAFT;
  (body.pages || []).forEach((p) => { p.status = STATUS.DRAFT; });
  return body;
}

/** Build an upsert body that sets a new permalink (keeps everything else). */
export function permalinkBody(full, permalink) {
  const body = JSON.parse(JSON.stringify(full));
  body.permalink = permalink;
  return body;
}

/** Deep-copy `full` and apply a shallow patch (name/permalink/startDate/endDate/…) — never mutates. */
export function updateBody(full, patch = {}) {
  return Object.assign(JSON.parse(JSON.stringify(full)), patch);
}

/** now + days as an ISO string (midnight-agnostic — the platform stores full timestamps). */
export function isoOffsetDays(days, from = Date.now()) {
  return new Date(from + days * 86400000).toISOString();
}

/**
 * Pick the en-US page to PROMOTE to the canonical name+permalink when no exact-name canonical exists:
 * a page whose name matches the family regex and whose permalink starts with familyPrefix, preferring
 * Published, then the shortest permalink (closest to canonical). Returns the page or null.
 */
export function pickPromoteCandidate(pages, spec) {
  const re = new RegExp(spec.promoteNameRe, 'i');
  const cands = (pages || []).filter((p) =>
    norm(p.cultureName) === norm(spec.culture) &&
    re.test(p.name || '') &&
    norm(p.permalink).startsWith(norm(spec.familyPrefix)));
  if (!cands.length) return null;
  return cands.sort((a, b) =>
    (a.status === STATUS.PUBLISHED ? 0 : 1) - (b.status === STATUS.PUBLISHED ? 0 : 1)
    || (a.permalink || '').length - (b.permalink || '').length)[0];
}

/** Exact-name page for a given culture (drift-safe). */
export function pickByNameCulture(pages, name, culture) {
  return (pages || []).find((p) => norm(p.name) === norm(name) && norm(p.cultureName) === norm(culture)) || null;
}

/**
 * The drifted family pages that should be archived: same familyPrefix permalink, a return-policy
 * family name, NOT one of the two canonical group ids, and not already archived.
 */
export function familyDuplicates(pages, spec, keepIds) {
  const keep = new Set(keepIds.filter(Boolean));
  const re = /^QA (Return Policy|Rückgaberichtlinie)/i;
  return (pages || []).filter((p) =>
    !keep.has(p.id) &&
    p.status !== STATUS.ARCHIVED &&
    re.test(p.name || '') &&
    norm(p.permalink).startsWith(norm(spec.familyPrefix)));
}

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
export function findGuidLeaks(text) {
  return (String(text).match(new RegExp(GUID_RE, 'gi')) || []);
}

/* ── Content-block fixture helpers (test-data/cms/page-content.json) ───────────
 * The content API document is { settings:{header,hideBreadcrumbs}, content:[block] }, served/accepted
 * as text/plain JSON at /api/page-builder-pages/grouped/{groupId}/content. These are PURE so the
 * seeder + validator + unit tests share them. */

export const CONTENT_FILE = 'test-data/cms/page-content.json';
export const DISCOVER_RE = /^@discover:(\d+)$/;

/** Pick the content document for a spec (multi-lang → per-culture) from the loaded fixture. */
export function contentDocFor(fixture, spec, culture) {
  const entry = fixture?.[spec.alias];
  if (!entry) return null;
  if (spec.multiLang) return entry[culture] || null;
  return entry.settings || entry.content ? entry : null;
}

/** Parse the text/plain content payload the GET returns; tolerate empty/non-JSON → {content:[]}. */
export function parseContentDoc(text) {
  if (!text || !String(text).trim()) return { content: [] };
  try { const d = JSON.parse(text); return d && typeof d === 'object' ? d : { content: [] }; }
  catch { return { content: [] }; }
}

/** How many content blocks a parsed doc holds. */
export function blockCount(doc) {
  return Array.isArray(doc?.content) ? doc.content.length : 0;
}

/**
 * Build the POST body from a fixture doc: assign deterministic block ids (typeNN — never platform
 * GUIDs) and resolve "@discover:N" sku markers against a provided live-sku list (env-resilient — no
 * hardcoded SKUs). Returns a fresh object; never mutates the fixture.
 */
export function buildContentBody(doc, { skus = [] } = {}) {
  const out = { settings: { ...(doc.settings || {}) }, content: [] };
  (doc.content || []).forEach((block, i) => {
    const b = { ...block };
    b.id = `${(b.type || 'block').replace(/[^a-z0-9]/gi, '')}${String(i + 1).padStart(2, '0')}`;
    if (typeof b.skus === 'string') {
      const m = b.skus.match(DISCOVER_RE);
      const n = m ? Number(m[1]) : 0;
      b.skus = skus.slice(0, n).map((sku) => ({ sku }));
    }
    if (!('background' in b)) b.background = null;
    out.content.push(b);
  });
  return out;
}

/** Max @discover:N count across a fixture doc (so the seeder discovers enough SKUs once). */
export function maxDiscover(doc) {
  let max = 0;
  for (const b of doc?.content || []) {
    const m = typeof b.skus === 'string' && b.skus.match(DISCOVER_RE);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}
