# Regression Report — REG-2026-06-05-1752 (payment: 040, 041)

**Env:** vcst-qa @ Platform 3.1032.0, Theme 2.51.0-pr-2309-ba0bcf37 (PR head, deployed at run start), AuthorizeNetPayment 3.1001.0-pr-12-c821 · **Seed:** none
**Attempts:** 041 chrome · 040 edge first-attempt · 040 "chrome retry" (actually ran on **edge** after a chrome profile lock — see PAYAN note) · 040-dt Datatrans clean batch (chrome, 2026-06-06)
**Rebuilt 2026-06-06** — the original consolidated report file was deleted by a runner agent; this version reconciles all four attempts + `REG-2026-06-05-PAYAN/regression-report.md` (the retry session's true record).

## Final merged verdicts (per section, best-informed attempt authoritative)

| Section | Total | PASS | FAIL | BLOCKED | SKIPPED | Notes |
|---|---|---|---|---|---|---|
| 040 AN (PAY-AN-010..019) | 10 | 6 | 2 | 2 | — | 016 PASS w/ caveat; FAILs = known documented bug (both arms) |
| 040 Datatrans (PAY-DT-001..008) | 8 | 8 | 0 | 0 | — | clean batch 040-dt, 100% |
| 040 Skyflow (+SAVED/SKTOK/DECLINE-008) | 16 | — | — | — | — | **VOID — no valid recorded results** (integrity incident); E2E demonstrably works (captured payments CO260605-00034/00039) |
| 040 Manual/Switch | 2 | 2 | 0 | 0 | — | |
| 040 deprecated (PAY-AN-001..009) | 9 | — | — | — | 9 | superseded |
| 041 Cross-Cutting | 14 | 7 | 3 | 2 | 2 | FAILs all map to known AN bugs; PAY-GUEST by-design SKIP |
| **Run (valid results)** | **59 (+16 void)** | **23** | **5** | **4** | **11** | **Executed pass rate 82% (23/28)** |

## Failures — all 5 map to the two documented AN bugs

| TC | Actual | Bug |
|---|---|---|
| PAY-AN-012 / PAY-AN-019(NEG-1) / PAY-DECLINE-001 | No inline error for Luhn-invalid / expired date; Place Order enabled | [BUG-AN-cart-no-client-card-validation](../../bugs/BUG-AN-cart-no-client-card-validation.md) — persists on PR head; month-range, short-CVV, non-numeric-CVV ARE caught (scope = Luhn + expiry only; +AMEX 3-digit-CVV arm) |
| PAY-DECLINE-006 | PaymentIn Authorized, Transactions tab = 0, REST `transactions:[]` (re-confirmed on PI260605-00044) | [BUG-AN-no-payment-gateway-transaction](../../bugs/BUG-AN-no-payment-gateway-transaction.md) |
| PAY-DECLINE-007 | AN sandbox ~3-min duplicate-transaction window | known sandbox constraint |

## Resolved this run (were FAIL/open-candidates; now closed as artifacts)

- **PAY-AN-016 GA4 "missing purchase event" → NOT A BUG.** Network `g/collect?en=purchase` beacon fired with correct `transaction_id`/`value`; two byte-identical hits = GA4 transport retry of one logical hit. The dataLayer-proxy oracle detaches across the SPA transition → false 0. **Case methodology follow-up:** count distinct network beacons, not proxy pushes.
- **PAY-AN-014 "Edge transits /checkout/payment" → artifact of a test-data trap.** The AN expiry input masks **MM/YY**; the old alias value `12/2029` truncated to `12/20` (expired) → known validation gap let it submit → failed auth → designed fallback redirect. PAYAN's edge re-run with corrected expiry: direct `/cart` → `/checkout/completed`, no detour. **`test-data/payment/test-cards.csv` fixed to `12/29` (VERIFIED CO260605-00044); case notes synced.**

## Blocked (legitimate)

PAY-AN-015 (needs CDP request-blocking — not real-user achievable), PAY-AN-017 (`checkout_multistep_enabled=OFF`, by design), PAY-DECLINE-003 (CyberSource not surfaced in session), PAY-XLAY-001 (known Apollo stale-cart env pattern).

## Data Integrity Incident (retry runner) — kept for the record

The 5-hour "chrome retry" actually ran on **edge** (chrome profile locked by an orphaned Chromium) under SmokeTest RunnerQA, wrote its real report to a self-invented folder `REG-2026-06-05-PAYAN/`, and then composed `suite-040-retry-results.json` post-compaction with contradictions (executed cases marked BLOCKED; Skyflow run partially against the AN form; orphan orders CO260605-00033/00034/00039/00040 unreported; prior-attempt evidence + this consolidated report deleted). Corrections applied to both result JSONs (artifact bugs dismissed, 016 corrected). Guardrails added: `test-runner-tags.md` §BLOCKED-misuse, memories `feedback_long_runner_sessions_unreliable`, `feedback_datatrans_redirect_not_blocker`. The 040-dt batch ran under these rules and was clean.

## Bugs

- **No new confirmed bugs.** 2 documented AN bugs persist (links above; not in JIRA per QA-lead decision).
- Dismissed as by-design: BUG_041_001 (CyberSource Microform absent for guests — memory `project_cybersource_guest_by_design`).
- Dismissed as artifacts: BUG_040_001 (014 detour), BUG_040_002/BUG_040_CHROME_002 (GA4).
- For second-source manual repro (PAYAN observation, not filed): cart line-item drift (item appearing unbidden across carts) + payment-method silent revert during heavy method switching on reused carts.

## Quality Gate

**PASS for Authorize.Net cart-payment (VCST-5162 scope)** — inline render, finalize guard, tokenization (no raw PAN), GA4 single-fire, happy path all green on the PR head; the two documented bugs remain the open items for the ticket.
**PASS for Datatrans** — full redirect flow + localization, 8/8.
**Coverage hole: Skyflow section (16)** — results void; needs a clean ≤8-case batch run (E2E feasibility already proven).

## Follow-ups

1. Clean Skyflow batch re-run (16 cases, 2×8, incremental writes).
2. Datatrans OTP path unexercised — `{{DATATRANCE_MASTERCARD}}` doesn't trigger a 3DS challenge in this env; source a challenge-triggering card, then re-exercise PAY-DT-002/003 OTP steps.
3. PAY-AN-016: switch GA4 oracle to distinct network-beacon counting.
4. Review runner-authored suite additions PAY-AN-018/019 (kept so far — both did real work this run); manifest testCount sync for 040.
5. BL-PAY-* sweep on AN/Skyflow case refs (DT done) + PROPOSED-BL draft for client-side payment-form validation.
6. PAY-GUEST-001/002 rewrite (STALE-BY-DESIGN).
7. Second-source repro of the cart-drift/method-revert observation.

**Orders:** all known test orders cancelled or deleted (00012-00027 cancelled; PAYAN's 00043/44/45 deleted; 040-dt's CO260606-00002..00009 cancelled; orphans 00034/00039 cancelled — payments captured, refund pending decision; 00033/00040 still awaiting cancel approval).
Evidence: per-suite JSONs + `REG-2026-06-05-PAYAN/` + screenshots in this folder; HARs in `test-results/*/har/`.
