/**
 * scripts/seed-data/white-labeling/white-labeling-specs.mjs — the white-labeling fixture's rules, side-effect-free.
 *
 * Imported by seed-white-labeling.mjs (the seeder) and validate-white-labeling-data.mjs (the drift guard).
 * No env load, no network, no main(): importing it does nothing. The DATA lives in the committed CSVs under
 * test-data/white-labeling/ (organizations, users, test-assets); this module holds only what a flat row cannot
 * say — how a row becomes a white-labeling record, which live values go to the env overlay, the per-run
 * disposable triple, and how a store without white labeling is picked.
 */

export const WL_DIR = 'test-data/white-labeling';
export const ORGS_FILE = 'white-labeling/organizations';   // the @td file key (aliases.json "file")
export const USERS_FILE = 'white-labeling/users';
export const ASSETS_FILE = 'white-labeling/test-assets';

/* ── Organization record plan ─────────────────────────────────────────────────────────────────────
 * organizations.csv `record_state`:
 *   ''              → derive: a record exists iff the row declares any menu, footer, preset or image;
 *                      a row declaring none gets NO record (the fallback organization, WL_DEFAULT's sibling case).
 *   'enabled-empty' → an ENABLED record that carries nothing — no logo, secondary logo, favicon, preset or
 *                      link list (FR-1). Different from "no record": the resolver finds a record and must fall
 *                      back field by field to the store's values (BL-WL-002), which "no record" never exercises.
 */
export const RECORD_STATES = Object.freeze(['', 'enabled-empty']);
export const EMPTY_RECORD_STATE = 'enabled-empty';

const BRANDING_COLUMNS = Object.freeze([
  'main_menu_link_list_name', 'footer_link_list_name', 'theme_preset',
  'logo_source', 'secondary_logo_source', 'favicon_source',
  'logo_url', 'secondary_logo_url', 'favicon_url',
]);
const cell = (row, col) => String(row?.[col] ?? '').trim();

/** The branding columns a row fills (an empty-record row must fill none). */
export const filledBrandingColumns = (row) => BRANDING_COLUMNS.filter((c) => cell(row, c));

/** null (no record) | { kind: 'empty' } | { kind: 'configured' } for one organizations.csv row. */
export function recordPlan(row) {
  const state = cell(row, 'record_state');
  if (state === EMPTY_RECORD_STATE) return { kind: 'empty' };
  return filledBrandingColumns(row).length ? { kind: 'configured' } : null;
}

/** The body of an enabled, empty organization record (FR-1). `id` set when the record already exists (PUT). */
export function emptyRecordBody(organizationId, id = null) {
  return {
    ...(id ? { id } : {}),
    organizationId, isEnabled: true,
    logoUrl: null, secondaryLogoUrl: null, faviconUrl: null,
    themePresetName: null, mainMenuLinkListName: null, footerLinkListName: null,
  };
}

/** True when a live record is exactly what an 'enabled-empty' row declares. */
export function isEnabledEmptyRecord(rec) {
  if (!rec || rec.isEnabled !== true) return false;
  return ['logoUrl', 'secondaryLogoUrl', 'faviconUrl', 'themePresetName', 'mainMenuLinkListName', 'footerLinkListName']
    .every((k) => !String(rec[k] ?? '').trim());
}

/* ── Live image URLs → env overlay ───────────────────────────────────────────────────────────────
 * The record's logo / secondary logo / favicon URLs are written by the platform (absolute, host + upload
 * timestamp + org GUID), so they are per-env runtime values: they go to aliases.<env>.json, read back from the
 * live record at seed time — never transcribed into organizations.csv (whose *_url columns stay blank).
 */
export const LIVE_URL_COLUMNS = Object.freeze({ logo_url: 'logoUrl', secondary_logo_url: 'secondaryLogoUrl', favicon_url: 'faviconUrl' });

/** { logo_url, secondary_logo_url, favicon_url } from a live record ('' where the record holds none). */
export function liveUrlColumns(rec) {
  return Object.fromEntries(Object.entries(LIVE_URL_COLUMNS).map(([col, key]) => [col, String(rec?.[key] ?? '')]));
}

/**
 * Overlay updates for every CSV-backed alias over `fileKey` whose filter row is in `byKey`: alias field → value,
 * for the fields that map to a provided column. Unlike seed-common's syncEnvAliases this keeps '' — a record that
 * lost its logo must blank the overlay, not leave the previous URL resolving.
 */
export function overlayUpdatesFor(aliases, fileKey, byKey) {
  const updates = {};
  for (const [name, def] of Object.entries(aliases || {})) {
    if (!def || def.file !== fileKey || !def.filter || !def.fields) continue;
    const provided = byKey[Object.values(def.filter)[0]];
    if (!provided) continue;
    const o = {};
    for (const [field, col] of Object.entries(def.fields)) if (col in provided) o[field] = provided[col];
    if (Object.keys(o).length) updates[name] = o;
  }
  return updates;
}

/* ── FR-3: the per-run disposable triple (organization + maintainer + DISABLED record) ─────────────
 * Consumed by the case that runs Mutation.changeOrganizationLogo on it (FWL-077): the mutation may add a second
 * record, and records cannot be deleted over REST (KB-52D2F554), so every round leaves its record(s) behind,
 * disabled. Re-arm before each run; the previous triple is torn down first.
 */
export const DISPOSABLE = Object.freeze({
  orgPrefix: 'AGENT-TEST-WL-Disposable-',
  emailPrefix: 'agent-test-wl-disposable-',
  emailDomain: 'test-agent.com',
  role: 'Organization maintainer',
  password: '{{TEST_USER_PASSWORD}}',   // the white-labeling users' password var (users.csv)
  status: 'Approved',
  recordIsEnabled: false,
  aliases: Object.freeze({ org: 'WL_DISPOSABLE_ORG', orgId: 'WL_DISPOSABLE_ORG_PLATFORM_ID', maintainer: 'WL_DISPOSABLE_MAINTAINER' }),
  seed: 'seed:white-labeling:disposable',
});

export function disposableNames(ts) {
  return { orgName: `${DISPOSABLE.orgPrefix}${ts}`, email: `${DISPOSABLE.emailPrefix}${ts}@${DISPOSABLE.emailDomain}` };
}
export const isDisposableOrgName = (name) => String(name || '').startsWith(DISPOSABLE.orgPrefix);
export const isDisposableEmail = (email) => String(email || '').toLowerCase().startsWith(DISPOSABLE.emailPrefix);

/** The two synthetic CSV rows user-provision's seedOrgs / seedInlineOrgUsers take for one disposable round. */
export function disposableRows(ts) {
  const { orgName, email } = disposableNames(ts);
  const org = { org_id: 'WL-DISPOSABLE', org_name: orgName, description: 'AGENT-TEST disposable white-labeling organization (FR-3)' };
  const user = {
    user_id: 'WL-DISPOSABLE-MAINTAINER', email, password: DISPOSABLE.password, first_name: 'Disposable', last_name: 'Maintainer',
    org_id: org.org_id, roles: DISPOSABLE.role, status: DISPOSABLE.status, seeded: 'true', membership_locked: 'false', membership_status: 'Approved',
  };
  return { org, user };
}

/** Overlay entries for an armed triple; `null` → the cleared ("not seeded") form a teardown writes. */
export function disposableOverlay(armed) {
  const a = DISPOSABLE.aliases;
  if (!armed) {
    return {
      [a.org]: { name: '', record_id: '' },
      [a.orgId]: { _inline: true, id: '', fields: { id: 'id' } },
      [a.maintainer]: { email: '', id: '' },
    };
  }
  return {
    [a.org]: { name: armed.orgName, record_id: armed.recordId },
    [a.orgId]: { _inline: true, id: armed.orgId, fields: { id: 'id' } },
    [a.maintainer]: { email: armed.email, id: armed.userId },
  };
}

/* ── FR-4: a store WITHOUT white labeling ──────────────────────────────────────────────────────────
 * Discovered at seed time, never named in a file: an Open store whose GET /api/white-labeling/store/{id} returns
 * no record, other than the primary store. AGENT-TEST- stores are passed over (another seeder's teardown removes
 * them). Sticky: the overlay's current pick is kept while it still qualifies, so a re-seed does not move cases
 * between stores. Then lowest id, for a deterministic choice.
 */
export const STORE_WITHOUT_WL_ALIAS = 'STORE_WITHOUT_WL';

export function pickStoreWithoutWl(candidates, { primaryStoreId, currentId = '' } = {}) {
  const ok = (candidates || []).filter((s) => s && s.id && s.id !== primaryStoreId
    && String(s.storeState || 'Open') === 'Open' && !s.hasRecord && !String(s.id).startsWith('AGENT-TEST'));
  if (currentId) { const keep = ok.find((s) => s.id === currentId); if (keep) return keep; }
  return [...ok].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))[0] || null;
}

/* ── FR-5: upload test assets (test-assets.csv) ────────────────────────────────────────────────────
 * Magic numbers per declared format — the guard checks each file IS what its row says (an ICO renamed .jpg would
 * make a "rejected" case pass for the wrong reason). The accept/reject columns are the Admin blades' filters
 * (KB-6102AC5A, BL-WL-006: logo png|gif|svg, favicon png|jpg|jpeg|webp); every asset differs from every other in
 * at least one of them, which is what makes the set discriminating.
 */
export const ASSET_MAGIC = Object.freeze({
  gif: [[0x47, 0x49, 0x46, 0x38]],                 // GIF8
  jpeg: [[0xff, 0xd8, 0xff]],
  ico: [[0x00, 0x00, 0x01, 0x00]],
  png: [[0x89, 0x50, 0x4e, 0x47]],
});
export const ASSET_EXT = Object.freeze({ gif: ['.gif'], jpeg: ['.jpg', '.jpeg'], ico: ['.ico'], png: ['.png'] });
export const ASSET_MAX_BYTES = 100 * 1024;

export const magicMatches = (format, bytes) =>
  (ASSET_MAGIC[format] || []).some((sig) => sig.every((b, i) => bytes[i] === b));
