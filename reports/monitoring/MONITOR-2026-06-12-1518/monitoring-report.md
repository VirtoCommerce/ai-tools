# Monitoring Report — MONITOR-2026-06-12-1518

- **Env:** vcst-qa (backend `vcst-qa.govirto.com` · storefront `vcst-qa-storefront.govirto.com`)
- **Window:** last 35 min · **Layers:** backend + frontend · **Mode:** detect-and-report (interactive `/qa-monitoring both`)
- **Signatures:** 1 queried · 1 new · 0 spiking · 1 triaged · 0 deferred
- **Auth:** AAD (`az login`, AppInsights data-plane) — no API key needed

## Confirmed bugs

_None._ No signal met the HIGH-confidence REAL_BUG bar; no live repro run, no bug draft created, no JIRA filed.

## Needs review

_None._

## Dismissed

| Class | Layer | Signature | Count | Oracle |
|---|---|---|---|---|
| NOISE (browser-quirk) | frontend | `ErrorEvent: ResizeObserver loop completed with undelivered notifications` | 1 | Benign browser warning — fired when a ResizeObserver callback mutates layout that retriggers a resize in the same frame. No app-code stack, no user-facing failure; industry-standard noise that apps routinely suppress. Not a defect. |

## Backend

All three backend probes clean over the window: exceptions 0 · failed 5xx requests 0 · failed dependencies 0.

---

_Detect-and-report only: no JIRA filed, no fix attempted. Fingerprint store updated — the dismissed signature dedups as SEEN-stable next run. Teams card skipped (nothing confirmed)._
