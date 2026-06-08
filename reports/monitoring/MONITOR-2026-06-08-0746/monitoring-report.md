# Monitoring Report — MONITOR-2026-06-08-0746

- **Run:** 2026-06-08 07:46 UTC · **Window:** last 35 min · **Layers:** backend + frontend
- **Env:** backend `vcst-qa.govirto.com` · storefront `vcst-qa-storefront.govirto.com` (App IDs env-resolved, AAD-authed via `az`)
- **Signatures:** 2 seen · 1 new · 0 spiking · 1 stable (skipped) · 0 deferred (cap not hit)

## Signature counts by probe

| Layer | Probe | Signatures |
|---|---|---|
| backend | exceptions | 0 |
| backend | failed-requests (5xx) | 0 |
| backend | failed-dependencies | 0 |
| frontend | browser exceptions | 2 (1 new, 1 stable) |
| frontend | browser AJAX failures | 0 |

## Confirmed bugs

_None._ No live repro performed — the only NEW signature is dev-environment noise (below).

## Needs review

_None._

## Dismissed

| Class | Layer | Signature | Oracle |
|---|---|---|---|
| NOISE (dev telemetry leak) | frontend | `ReferenceError at setup` — `ref is not defined` / `useCartConfigurationSections is not defined` (count 2, 1 new) | Stack/URL is `https://localhost:3000/client-app/shared/cart/components/cart-configuration-items.vue?t=…` — a local **Vite dev server** (HMR `?t=` timestamp, `node_modules/.vite/deps/`, unbundled `.vue`), single Chrome 148/macOS client. Not the QA host; not a production bundle path. Evolving messages over 20 min = a developer mid-edit, not a shipped defect. |

## Observation (config hygiene, not a product bug)

A developer's **local** vc-frontend dev server is reporting browser exceptions into the **shared `vcst-qa-storefront` App Insights** resource — its connection string/instrumentation key is wired into local dev. This pollutes storefront telemetry with mid-edit HMR errors. Recommend the dev environment use a separate (or no) App Insights connection string so QA monitoring stays clean. Not filed.

## Status

- **No JIRA filed. No fix attempted.** Detect-and-report only.
- Fingerprint store updated — the `ReferenceError at setup` signature is now baselined; it will only re-surface if it spikes.
- If you want certainty the component is fine on the deployed env, I can run a quick `/cart` check with a configurable product on `vcst-qa-storefront` — say the word.
