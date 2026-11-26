# Regression REG-2026-11-26-1415-W6 — Sprint 26-23 W6 UI kit, a11y & i18n

Env vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · persona set S4 · `--no-promote` · triage deferred.

| Suite | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|
| 048c Layout stability | 39 | 7 | 3 | 0 |
| 046 Localization | 7 | 0 | 4 | 26 |
| 045 Accessibility | 2 | 0 | 8 | 22 |
| 071 White-labeling branding | 1 | 0 | 0 | 17 |
| 070 White-labeling storefront | 0 | 0 | 0 | 51 |
| **Total (187)** | **49** | **7** | **15** | **116** |

116 Manual cases skipped by design (EX-200). Failures are all layout-runner findings (CLS, touch targets, 320 px overflow in `de`). No JS/GraphQL errors or chunk failures. Firefox lane needs a restart (browser build mismatch).
