/**
 * store-defaults-specs.mjs — the REQUIRED-DEFAULTS invariant for a Virto store, as pure logic.
 *
 * SIDE-EFFECT-FREE. No network, no fs, no env, no `main()`. Imported by:
 *   - scripts/seed-data/store/check-store-defaults.mjs   (`npm run td:reconcile:store` — pre-flight)
 *   - scripts/seed-data/reconcile-test-data.mjs          (check [13] of the full live reconcile)
 *   - scripts/seed-data/store/set-store-setting.mjs      (post-write re-assert)
 *   - scripts/unit/store-defaults-specs.test.mjs
 * One source of truth, three callers — never a second hand-maintained mirror.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────
 * `PUT /api/stores` REPLACES the store entity; it does not patch it. A caller that sends a
 * partial body — `{id, catalog, name, settings:[…one setting…]}` — silently NULLS every field
 * it omitted. On 2026-08-27 that happened twice on vcst-qa (14:29:56Z, 16:48:29Z) from suite
 * 075d's store-toggle cases, wiping `defaultCurrency`, `defaultLanguage`, `url` and `secureUrl`
 * off `B2B-store`. The second one took the storefront down and the null sat there for hours,
 * because NOTHING in this repo could see it: `td:validate` is static (it reads committed
 * fixtures, not the env), and every `td:reconcile` check probed entities the fixtures POINT AT
 * — never the store those entities live in.
 *
 * A store missing these fields is a BROKEN STOREFRONT, not a feature bug: the storefront cannot
 * price a cart with no default currency, cannot resolve a translation with no default language,
 * and cannot build an absolute/canonical link with no url. So a case running against it fails
 * for a reason that has nothing to do with what it asserts — the most expensive kind of red.
 *
 * ── THE ONE RULE THAT SHAPES ALL OF THIS: NEVER WRITE A GUESS ───────────────────
 * This module DETECTS and it DERIVES an expected value from live evidence, and it stops there.
 * `deriveExpectation()` returns a value only when the evidence is UNAMBIGUOUS, and returns a
 * `null` value carrying its own `reason` when it is not. It never falls back to a literal
 * (`'USD'`, `'en-US'`) — a hardcoded expectation is correct exactly once and then manufactures
 * confident, wrong "restores" forever (.claude/rules/test-data.md §GOLDEN RULE). Reporting a
 * field as null and letting a human decide is the correct outcome, not a failure of the guard.
 *
 * Evidence ranks, strongest first (the order a human used when restoring B2B-store by hand):
 *   1. THE STORE'S OWN RECENT ORDERS — `currency` / `languageCode` on orders placed IN this
 *      store. This is the store's own history, not an assumption about it. Unanimous across the
 *      sample ⇒ high confidence; two distinct values ⇒ AMBIGUOUS, no value.
 *   2. THE STORE'S OWN LIST FIELD — if `currencies[]`/`languages[]` holds exactly ONE entry, the
 *      default has only one legal value. More than one ⇒ ambiguous, no value.
 *   3. THE ENV'S FRONT_URL — for `url`, and ONLY for the store the env under test points at
 *      (`STORE_ID`). It is the authoritative per-env storefront address and is already what
 *      `ensureStore()` writes. For any OTHER store it is evidence of nothing, so it is not used.
 *   4. PEER STORES on the same env — CORROBORATION ONLY, never promoted to a value. "Most stores
 *      here are USD" does not establish that THIS store is: this very env carries a live EUR
 *      store (`test_del`), so the modal value would have quietly overwritten a legitimately
 *      different default.
 */

/* ── The invariant ──────────────────────────────────────────────────────────── */

/**
 * REQUIRED — any of these blank is a broken storefront (memory
 * `reference_store_required_defaults_null_breaks_frontend`). Gated: a hard failure.
 */
export const REQUIRED_FIELDS = Object.freeze([
  Object.freeze({
    field: 'defaultCurrency',
    listField: 'currencies',
    breaks: 'the storefront cannot price a cart or a PDP — every amount renders 0.00 or blank',
  }),
  Object.freeze({
    field: 'defaultLanguage',
    listField: 'languages',
    breaks: 'the storefront cannot resolve a translation or a locale-scoped SEO slug',
  }),
  Object.freeze({
    field: 'url',
    listField: null,
    breaks: 'the storefront has no address — absolute links, canonical URLs and notification links break',
  }),
]);

export const REQUIRED_FIELD_NAMES = Object.freeze(REQUIRED_FIELDS.map((f) => f.field));

/**
 * INFORMATIONAL — the destructive PUT nulls this too, and it is worth SEEING, but a null
 * `secureUrl` does not break the storefront (B2B-store served correctly with it null), so it is
 * reported and never gated. Promoting it to REQUIRED would make the guard red on a healthy env,
 * which is how a gate gets ignored.
 */
export const INFORMATIONAL_FIELDS = Object.freeze(['secureUrl']);

/** Finding codes — a closed vocabulary, so a hold is attributable rather than narrated. */
export const CODES = Object.freeze({
  MISSING: 'SD-001',       // a required field is null/empty
  INCOHERENT: 'SD-002',    // default is set but absent from its own list field
  EMPTY_LIST: 'SD-003',    // the list field is empty while the default is set
  INFO_MISSING: 'SD-004',  // an informational field is null (never gated)
});

/* ── Primitives ─────────────────────────────────────────────────────────────── */

/** Blank = null, undefined, or a string that is empty once trimmed. `0`/`false` are NOT blank. */
export function isBlank(v) {
  if (v === null || v === undefined) return true;
  return typeof v === 'string' && v.trim() === '';
}

const asList = (v) => (Array.isArray(v) ? v.filter((x) => !isBlank(x)).map((x) => String(x)) : []);

/**
 * Is this store plausibly SERVING a storefront? Derived from the store's own state, never from a
 * hardcoded id list. Used to decide whether an UNGATED store's null default is worth reporting:
 * a store with no url and no orders is not serving anything, so its null default is a dormant
 * record, not an outage — reporting it would be permanent noise that trains people to ignore the
 * guard. A store with a url, or with orders in it, is serving somebody.
 */
export function isStorefrontServing(store, { orderCount = 0 } = {}) {
  return !isBlank(store?.url) || orderCount > 0;
}

/* ── Scope: which stores are GATED (hard fail) vs merely reported ────────────── */

/**
 * Derive the gated set from committed sources, never from a literal.
 *   - `envStoreId` — STORE_ID for the env under test. Always gated: it is THE store every suite
 *     runs against, so a null default there is the outage this guard exists for.
 *   - `fixtureStoreIds` — every `store_id` in test-data/stores/stores.csv, i.e. a store the repo
 *     declares it owns and seeds. Gated only when it actually exists live (stores.csv also holds
 *     template rows for stores that are not provisioned on every env).
 * Everything else live on the env is third-party/legacy: audited and reported, never gated.
 */
export function gatedStoreIds({ envStoreId = null, fixtureStoreIds = [], liveStoreIds = [] } = {}) {
  const live = new Set(liveStoreIds.map(String));
  const gated = new Set();
  if (!isBlank(envStoreId)) gated.add(String(envStoreId)); // gated even if absent live — that is itself a failure
  for (const id of fixtureStoreIds) if (!isBlank(id) && live.has(String(id))) gated.add(String(id));
  return gated;
}

/* ── Audit ──────────────────────────────────────────────────────────────────── */

/**
 * Audit ONE live store record. Pure: takes the store object (as returned by
 * `GET /api/stores/{id}`) plus its scope, returns findings. Every finding NAMES the store and
 * the field — "a store is broken" is not actionable, "B2B-store.defaultCurrency is null" is.
 *
 * @returns {{storeId:string, findings:Array<{code:string,severity:'fail'|'warn'|'info',
 *            storeId:string, field:string, message:string}>, missingRequired:string[]}}
 */
export function auditStore(store, { gated = false, orderCount = 0 } = {}) {
  const storeId = String(store?.id ?? '(unknown)');
  const findings = [];
  const missingRequired = [];
  const serving = isStorefrontServing(store, { orderCount });

  for (const spec of REQUIRED_FIELDS) {
    const value = store?.[spec.field];
    if (isBlank(value)) {
      missingRequired.push(spec.field);
      // Gated ⇒ fail. Ungated but demonstrably serving ⇒ warn (someone is using it). Ungated and
      // dormant ⇒ nothing: a record with no url and no orders is not an outage.
      const severity = gated ? 'fail' : (serving ? 'warn' : null);
      if (severity) {
        findings.push({
          code: CODES.MISSING,
          severity,
          storeId,
          field: spec.field,
          message: `store "${storeId}": ${spec.field} is ${value === undefined ? 'absent' : 'null/empty'} — ${spec.breaks}`,
        });
      }
      continue;
    }
    // Coherence: a default that is not among its own allowed values is a different broken state —
    // the field is populated, so a "is it null?" check passes, and the storefront still cannot use it.
    if (spec.listField) {
      const list = asList(store?.[spec.listField]);
      if (!list.length) {
        findings.push({
          code: CODES.EMPTY_LIST,
          severity: gated ? 'fail' : 'warn',
          storeId,
          field: spec.listField,
          message: `store "${storeId}": ${spec.field}="${value}" but ${spec.listField}[] is empty — the default is not among the store's allowed ${spec.listField}`,
        });
      } else if (!list.includes(String(value))) {
        findings.push({
          code: CODES.INCOHERENT,
          severity: gated ? 'fail' : 'warn',
          storeId,
          field: spec.field,
          message: `store "${storeId}": ${spec.field}="${value}" is NOT in ${spec.listField}[${list.join(', ')}] — incoherent, the storefront cannot select it`,
        });
      }
    }
  }

  for (const field of INFORMATIONAL_FIELDS) {
    if (isBlank(store?.[field])) {
      findings.push({
        code: CODES.INFO_MISSING,
        severity: 'info',
        storeId,
        field,
        message: `store "${storeId}": ${field} is null (informational — not required for the storefront to serve; note that a partial PUT /api/stores nulls it along with the required fields)`,
      });
    }
  }

  return { storeId, findings, missingRequired };
}

/* ── Derivation — evidence in, expectation out; NEVER a guess ────────────────── */

/**
 * @typedef {Object} Evidence
 * @property {string}   storeId        the store being repaired
 * @property {string?}  envStoreId     STORE_ID for the env under test
 * @property {string?}  frontUrl       FRONT_URL for the env under test
 * @property {Array<{currency?:string, languageCode?:string}>} orders  recent orders IN this store
 * @property {string[]} storeCurrencies  the store's own currencies[]
 * @property {string[]} storeLanguages   the store's own languages[]
 * @property {Array<{id:string, defaultCurrency?:string, defaultLanguage?:string}>} peerStores
 */

/** Distinct non-blank values of `key` across `rows`, in first-seen order. */
function distinctValues(rows, key) {
  const seen = [];
  for (const r of rows || []) {
    const v = r?.[key];
    if (isBlank(v)) continue;
    const s = String(v);
    if (!seen.includes(s)) seen.push(s);
  }
  return seen;
}

/** Modal value of `key` across peer stores — corroboration text only, never a returned value. */
export function peerCorroboration(peerStores, key) {
  const counts = new Map();
  for (const s of peerStores || []) {
    const v = s?.[key];
    if (isBlank(v)) continue;
    counts.set(String(v), (counts.get(String(v)) || 0) + 1);
  }
  if (!counts.size) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const total = ranked.reduce((n, [, c]) => n + c, 0);
  return { value: ranked[0][0], count: ranked[0][1], total, distinct: ranked.length };
}

/**
 * Derive the expected value of ONE required field from live evidence.
 *
 * ALWAYS returns an object. `value === null` means "no defensible expectation" and `reason` says
 * why — that is a first-class, correct answer, and the caller must report the field as null
 * rather than write anything. `corroboration` is human-facing text only; it never becomes `value`.
 *
 * @returns {{field:string, value:string|null, confidence:'high'|'none', source:string|null,
 *            reason:string|null, corroboration:string|null}}
 */
export function deriveExpectation(field, evidence = {}) {
  const {
    storeId = null, envStoreId = null, frontUrl = null, orders = [],
    storeCurrencies = [], storeLanguages = [], peerStores = [],
  } = evidence;
  const none = (reason, corroboration = null) => ({ field, value: null, confidence: 'none', source: null, reason, corroboration });
  const found = (value, source, corroboration = null) => ({ field, value: String(value), confidence: 'high', source, reason: null, corroboration });

  if (field === 'url') {
    // FRONT_URL is authoritative for exactly one store: the one this env is configured to test.
    if (isBlank(envStoreId) || String(storeId) !== String(envStoreId)) {
      return none(`FRONT_URL describes the env's own store (STORE_ID=${envStoreId ?? '(unset)'}), not "${storeId}" — no evidence for this store's url`);
    }
    if (isBlank(frontUrl)) return none('FRONT_URL is not set for this env — no evidence for the store url');
    return found(frontUrl.replace(/\/+$/, ''), `FRONT_URL (.env.<TEST_ENV>) — the env's declared storefront address for STORE_ID=${envStoreId}`);
  }

  const cfg = field === 'defaultCurrency'
    ? { orderKey: 'currency', list: storeCurrencies, listName: 'currencies', peerKey: 'defaultCurrency' }
    : field === 'defaultLanguage'
      ? { orderKey: 'languageCode', list: storeLanguages, listName: 'languages', peerKey: 'defaultLanguage' }
      : null;
  if (!cfg) return none(`no derivation rule declared for field "${field}"`);

  const peer = peerCorroboration(peerStores, cfg.peerKey);
  const corroboration = peer
    ? `peer stores on this env: "${peer.value}" on ${peer.count}/${peer.total} (${peer.distinct} distinct value(s)) — CORROBORATION ONLY, never used as the value`
    : null;

  // [1] The store's own recent orders — the strongest evidence, because it is this store's history.
  const fromOrders = distinctValues(orders, cfg.orderKey);
  if (fromOrders.length === 1) {
    return found(fromOrders[0], `${orders.length} recent order(s) placed in "${storeId}" all carry ${cfg.orderKey}="${fromOrders[0]}"`, corroboration);
  }
  if (fromOrders.length > 1) {
    return none(`recent orders in "${storeId}" disagree — ${cfg.orderKey} ∈ {${fromOrders.join(', ')}}; AMBIGUOUS, a human must choose`, corroboration);
  }

  // [2] The store's own list field — one legal value means there is only one possible default.
  const list = asList(cfg.list);
  if (list.length === 1) {
    return found(list[0], `the store's own ${cfg.listName}[] holds exactly one entry ("${list[0]}"), so the default has only one legal value`, corroboration);
  }
  if (list.length > 1) {
    return none(`no orders in "${storeId}" to read, and its ${cfg.listName}[] offers ${list.length} candidates {${list.join(', ')}} — AMBIGUOUS, a human must choose`, corroboration);
  }

  // [3] Nothing left. Peer stores are deliberately NOT promoted (this env carries stores with
  // genuinely different defaults, so the modal value would confidently overwrite a correct one).
  return none(`no orders in "${storeId}" and its ${cfg.listName}[] is empty — no evidence; report the field as null and let a human decide`, corroboration);
}

/** Derive every missing required field for one store. Returns one entry per missing field. */
export function deriveExpectations(missingFields, evidence = {}) {
  return (missingFields || []).map((f) => deriveExpectation(f, evidence));
}

/* ── Rendering ──────────────────────────────────────────────────────────────── */

/** One line per finding, prefixed by severity glyph + code. Shared by both callers. */
export function formatFinding(f) {
  const glyph = f.severity === 'fail' ? '✗' : f.severity === 'warn' ? '⚠' : 'ℹ';
  return `${glyph} [${f.code}] ${f.message}`;
}

/** One line for a derivation result — states the evidence, or states that there is none. */
export function formatExpectation(e) {
  if (e.value === null) {
    return `      ${e.field}: NO DEFENSIBLE VALUE — ${e.reason}`
      + (e.corroboration ? `\n        (${e.corroboration})` : '');
  }
  return `      ${e.field}: expected "${e.value}" — evidence: ${e.source}`
    + (e.corroboration ? `\n        (${e.corroboration})` : '');
}

/**
 * Roll a set of per-store audits into the gate verdict. `fail` counts gate; `warn`/`info` never do.
 */
export function summarize(audits) {
  const all = (audits || []).flatMap((a) => a.findings || []);
  return {
    failures: all.filter((f) => f.severity === 'fail'),
    warnings: all.filter((f) => f.severity === 'warn'),
    infos: all.filter((f) => f.severity === 'info'),
    storesAudited: (audits || []).length,
  };
}

/* ── Safe-write guard (used by set-store-setting.mjs) ────────────────────────── */

/**
 * The rule the destructive PUT broke, as an assertable function: a body about to be sent to
 * `PUT /api/stores` must not DROP or blank a required field the live store currently holds.
 * Returns the list of fields that would regress; empty ⇒ safe to send.
 *
 * This is the check that would have refused suite 075d's
 * `{id, catalog, name, settings:[…]}` body outright.
 */
export function fieldsLostByWrite(currentStore, nextBody) {
  const lost = [];
  for (const spec of REQUIRED_FIELDS) {
    const before = currentStore?.[spec.field];
    if (isBlank(before)) continue;             // already broken — this write is not what broke it
    if (isBlank(nextBody?.[spec.field])) lost.push(spec.field);
  }
  return lost;
}

/**
 * Coerce a CLI string to the type the store's OWN setting declares. The store record carries the
 * `valueType`, so the type is read, never guessed — sending the string `"false"` into a Boolean
 * setting is truthy on the way back out and silently enables what you meant to disable.
 * Throws (rather than coercing loosely) on a value the declared type cannot hold.
 */
export function coerceSettingValue(raw, valueType) {
  const t = String(valueType || '').toLowerCase();
  if (t === 'boolean') {
    if (!/^(true|false)$/i.test(String(raw))) throw new Error(`setting is Boolean; --value must be true|false (got "${raw}")`);
    return /^true$/i.test(String(raw));
  }
  if (t === 'integer' || t === 'decimal' || t === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n) || String(raw).trim() === '') throw new Error(`setting is ${valueType}; --value must be numeric (got "${raw}")`);
    return n;
  }
  return String(raw);
}

/**
 * The full-body merge itself, as pure logic: spread the live store, move exactly ONE
 * `settings[].value`, touch nothing else. This is the shape `setMissionsEnabled()` had right all
 * along, extracted so it is testable and so the next store toggle cannot hand-roll a partial body.
 */
export function mergeSettingValue(store, name, value) {
  return {
    ...store,
    settings: (store?.settings || []).map((s) => (s.name === name ? { ...s, value } : s)),
  };
}
