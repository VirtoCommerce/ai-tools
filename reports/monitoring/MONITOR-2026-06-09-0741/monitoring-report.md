# Monitoring Summary — MONITOR-2026-06-09-0741

- **Run:** MONITOR-2026-06-09-0741 · **Date:** 2026-06-09 07:41 UTC · **Env:** vcst-qa
- **Window:** 1440 min (24h) · **Layers:** both (backend `vcst-qa` + storefront `vcst-qa-storefront`)
- **Source:** Azure MCP `monitor_resource_log_query` (AAD; API keys absent). Interactive `/qa-monitoring`.

## Signature counts

| Observed | NEW | SPIKING | SEEN-stable | Triaged | Deferred (cap 15) | Confirmed | Needs-review | Dismissed |
|---------:|----:|--------:|------------:|--------:|------------------:|----------:|-------------:|----------:|
| 18 | 13 | 1* | 5 | 13 | 0 | **0** | 3 | 15 |

\*The one raw spike (`fcm.googleapis.com 404`, 157/24h vs prior 5/35min baseline) is a **window artifact** — normalized ≈6.5/hr ≈ stable — and is already filed as VCST-5210 (fix verified). Not a new action.

## Confirmed bugs

**None.** No signature reproduced as a live defect this run.

## Needs review (human eye — not reproduced / open question)

| Severity | Layer | Signature | Note |
|----------|-------|-----------|------|
| P2 | frontend | `Theme context is missing.` + 3 cascade TypeErrors (`useEnvironmentName`, `ComputedRefImpl.fn`, `setup`) on Cart/SignIn | Single-session app-init failure 09-Jun 06:49–06:50. **Live-verified TRANSIENT** (qa-frontend-expert, 07:38): home/cart/signin render with theme; `InitializeApplication`/`GetPageContext` = 200. Downstream of the 08-Jun bootstrap 500s. **Watch** — escalate only if it recurs across independent sessions. Code arguably lacks a guard for undefined `themeContext` (4 uncaught errors instead of graceful fallback). |
| P2 | backend (platform) | `500 POST Security/Create` ×2 (08-Jun 11:40–12:28) | Admin user-create 500. Possibly validation-as-500 or QA test-induced duplicate. Not reproduced — payload-only signal, withheld per `feedback_verify_payload_bugs_second_source`. |
| P3 | backend (marketing) | `500 POST MarketingModulePromotion/AddCoupons` ×1 (08-Jun 12:27) | Single coupon-add 500 on the canonical endpoint. Likely a malformed test payload; one occurrence, no second source. |

## Dismissed

| Class | Signature(s) | Oracle |
|-------|--------------|--------|
| NOISE | `TypeError: Failed to fetch dynamically imported module: https://localhost:3000/.../vite/deps/…` ×12 (Matcher) | A developer's **local Vite dev session** leaking telemetry into QA storefront AI — not a QA-env defect |
| NOISE (seen) | `ApolloError: Failed to fetch` ×4 | Prior-run NOISE (621b3f00); intermittent client fetch aborts |
| KNOWN_ISSUE | `500 POST graphql/` + `AuthorizationError …RequestBuilder.Authorize` ×1 (09-Jun 05:13) | Anonymous-access / expired-token rejection path; dup of da047d auth class |
| KNOWN/FILED | `HTTP fcm.googleapis.com 404` ×157 | VCST-5210 (filed; fix verified, commit aa28ba7). Raw spike = 24h-window artifact |
| TRANSIENT | Bootstrap 500 cluster: `graphql/GetPageContext`, `graphql/InitializeApplication`, `InvalidOperationException…SearchIdsNoCacheAsync` ("resolve field pageContext") — 08-Jun 09:56–10:08 | Live-verified healthy now (200s). Deploy/restart burst |
| TRANSIENT | `SQL …vcst-qa-platform_restored` connect-fail (InternalOpenAsync) ×5 — 08-Jun 09:43–10:11 | Cold-start/warmup. Infra not code. *Side-note: platform points at a `_restored` DB (post-2026-05-15 restore) — worth a human infra glance* |
| TRANSIENT | `HTTP vcst-qa.govirto.com 404` (wss pushNotificationHub) ×1 — 08-Jun 22:39 | WebSocket reconnect transient |
| TRANSIENT (seen) | `essearch-es-http…:9200 404` ×1 · browser `500 POST /graphql` (Cart) ×3 | Prior-run TRANSIENT (a3e8b1f6 / 4acc1bc6); bursty, non-recurring |

## Notes
- Storefront has a persistent benign 404 on `assets/presets/electro2.json` (missing theme-preset file, every page) + intermittent catalog-image `.webp` 404s. Unrelated to any signature above; low-priority cleanup, not filed.
- Fingerprint store migrated v1→v2 (env now part of the hash; 27 entries, 25 vcst + 2 vcptcore) so the next run dedups correctly.

---
**Detect-and-report only — no JIRA filed, no fix attempted.** A human decides whether to file (`/qa-bug`) or fix (`/qa-fix`).
