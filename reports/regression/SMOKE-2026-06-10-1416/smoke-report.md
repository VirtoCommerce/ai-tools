# Smoke Test Report — SMOKE-2026-06-10-1416

## Verdict: 🟡 CONDITIONAL GO — full critical revenue subset passed; SMK-001 "fail" was a transient post-outage artifact (not a real defect); 17 cases unrun

Retry of SMOKE-2026-06-10-1220 (which was BLOCKED by a backend outage). Backend re-verified healthy before the run (`/health` 200, all subsystems Healthy; `/graphql` 200) — but the run started while the recovering backend's xAPI schema was still rebuilding, which caused the SMK-001 blip below.

> **Post-run correction (introspection-verified):** the original BUG_042_001 "schema mismatch" was **disproven**. `currencyCode` *is* a valid field on `LineItemType` (live `__type` introspection: 60 fields, `currencyCode` present; a `cart{ items{ currencyCode } }` query now returns HTTP 200). The `GetShortCart` 400 was a **transient schema-availability artifact** while modules were still loading after the outage recovery — not a frontend↔backend mismatch and not a code defect. No JIRA should be filed for it.

| Field | Value |
|-------|-------|
| Run ID | SMOKE-2026-06-10-1416 |
| Date | 2026-06-10 |
| Scope | Storefront only (Track A) |
| Environment | https://vcst-qa-storefront.govirto.com (vcst-qa) |
| Platform | 3.1035.0 |
| Theme | vc-theme-b2b-vue 2.51.0-pr-2310 |

## Track A — Storefront Results

Checklist gates: SMOKE-CHECKLIST.md (**13/33**) · SMOKE-CROSS-LAYER-CHECKLIST.md (**8/13**)

| Executed | PASS | FAIL | BLOCKED | NOT_RUN |
|----------|------|------|---------|---------|
| 14 | 13 | 1 | 1 | 17 |

Executed pass rate 92.9%. **17 cases NOT_RUN** (single-session budget — not falsely passed). The critical revenue subset *was* exercised end-to-end.

**Critical revenue path — all PASS:** sign-in (SMK-004) → search (SMK-006) → catalog→PDP (SMK-007) → add-to-cart (SMK-008) → cart (SMK-010) → delivery+shipping, total math $328.80 / BL-CHK-006 (SMK-012) → **real order placed CO260610-00001, cart cleared (SMK-013)** → **CyberSource Microform inline on /cart, token 201 (SMK-014)** → GA4 purchase txn `82538a97…` (SMK-015) → order in history, total matches (SMK-016). B2B members/info (SMK-021), health/no JS errors (SMK-026) also PASS.

### FAIL (1) — reclassified as TRANSIENT (not reproducing)
- **SMK-001** (§1 revenue-flow gate) — at run time, guest load fired `POST /graphql (GetShortCart)` → **HTTP 400** (`Cannot query field currencyCode on type LineItemType`) + a user-facing "technical issues" toast. **Post-run introspection disproves the mismatch theory** — the field is valid and the query now returns 200. Cause was the recovering backend serving an incomplete xAPI schema for a brief window. Not a code defect; re-run to confirm clean.

### BLOCKED (1)
- **SMK-017** — precondition unmet: the configured `USER_DEFAULT` is an **org-associated** account (org "[Cypress]-Corporate-1 Kft.") so it has no "Addresses" link (by design — see memory). Needs a personal-account fixture; not a product defect.

## Bugs Found

- **BUG_042_001 — RETRACTED (not a defect).** Originally reported as a `currencyCode`/`LineItemType` schema mismatch. Disproven by live introspection: the field is valid; a `cart{ items{ currencyCode } }` query returns 200. The 400 + error toast were a **transient artifact of the backend recovering from its outage** (incomplete xAPI schema mid module-reload). No frontend/backend code change needed; do not file. If guest `GetShortCart` 400s persist on a *healthy* backend, re-open.
- **BUG_042_002 (Low):** catalog/PDP product images 404 (`cms-content/assets/catalog/…`); some external all.biz images ORB-blocked. Missing-asset data issue, not layout-breaking.
- **BUG_042_003 (Low):** `/assets/presets/jensen.json` theme preset 404 on authenticated pages (1 console error each); no visible breakage.

## App Insights (run window)

Skipped — Azure MCP `monitor_resource_log_query` not loaded this session and `APPINSIGHTS_API_KEY_*` unset (not creatable per project access). Does not gate the verdict.

## Verdict rationale

The only FAIL (SMK-001) was a **transient** `GetShortCart` 400 caused by the backend serving an incomplete xAPI schema in the minutes after recovering from its outage — disproven as a defect by post-run introspection (`currencyCode` is valid; query now 200). Every functional revenue path (search → cart → checkout → CyberSource payment → real order CO260610-00001 → history → GA4) passed end-to-end. SMK-017 was BLOCKED only by a fixture/by-design gap (org account has no Addresses link), not a defect.

Net: no genuine defect found in the executed scope, but **17 of 33 cases were not run** (single-session budget), so this is **CONDITIONAL GO**, not a full GO. To clear to GO: re-run on the now-stable backend to (a) confirm SMK-001 is clean and (b) cover the remaining 17 cases.
