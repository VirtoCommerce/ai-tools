# Regression Report — REG-2026-06-05-1752

**Selection:** 040, 041 (payment) · **Env:** vcst-qa @ Platform 3.1032.0, Theme 2.51.0-pr-2309-ba0bcf37 (PR head, deployed this run), AuthorizeNetPayment 3.1001.0-pr-12-c821 · **Browsers:** 041 chrome / 040 edge first-attempt + chrome retry (firefox excluded — known /cart dropdown quirk) · **Seed:** none

## Counts (final merged verdicts; 040 = chrome retry authoritative)

| Suite | Total | PASS | FAIL | BLOCKED | SKIPPED | Pass rate (executed) |
|---|---|---|---|---|---|---|
| 040 Payment Processors | 55 | 8 | 3 | 35 | 9 | 73% (8/11) |
| 041 Payment Cross-Cutting | 14 | 7 | 3 | 2 | 2 | 70% (7/10) |
| **Run** | **69** | **15** | **6** | **37** | **11** | **71% (15/21)** |

## Failures (all map to documented bugs or one open investigation)

| TC | Expected | Actual | Bug link |
|---|---|---|---|
| PAY-AN-012 (040) | Inline Luhn error; Place Order disabled | Invalid card accepted; ghost order + /checkout/payment fallback | [BUG-AN-cart-no-client-card-validation](../../bugs/BUG-AN-cart-no-client-card-validation.md) (known) |
| PAY-AN-019 (040, new case) | Expired date 01/20 rejected client-side | No error; Place Order enabled (month-range/CVV sub-checks pass) | same bug (known) |
| PAY-DECLINE-001 (041) | Client-side rejection before gateway | Same validation gap | same bug (known) |
| PAY-AN-016 (040) | Exactly 1 GA4 purchase event | 0 events (edge AND chrome-retry) — but interactive chrome run earlier same day saw exactly 1 | **OPEN — needs investigation** (see below) |
| PAY-DECLINE-006 (041) | PaymentGatewayTransaction persisted | `transactions:[]`, Admin "No data" | [BUG-AN-no-payment-gateway-transaction](../../bugs/BUG-AN-no-payment-gateway-transaction.md) (known) |
| PAY-DECLINE-007 (041) | Clean duplicate-decline handling | AN sandbox ~3-min duplicate window behavior | known sandbox constraint, noted in suite |

**Cross-browser note (PAY-AN-014):** Edge first-attempt saw a transit through `/checkout/payment` before `/checkout/completed`; chrome (interactive + retry) goes direct. Payment succeeds on both. Edge-only route detour, single observation — needs a second Edge run before filing.

**GA4 (PAY-AN-016) inconsistency:** 1-of-3 runs saw the purchase event. Edge's detour through /checkout/payment would wipe `window._ga4_purchases` (full navigation resets the intercept), so at least the edge measurement is suspect; chrome-retry's 0 vs interactive chrome's 1 on the same build is unexplained. Treat as measurement-methodology-sensitive; do NOT file from this run. Suggested follow-up: single manual repro with GA4 DebugView or network-level `collect?en=purchase` capture instead of the dataLayer proxy.

## Blocked (37 nominal — Skyflow/Datatrans labels UNRELIABLE, see Data Integrity Incident)

- **Skyflow (16): BLOCKED labels INVALID.** The retry runner demonstrably executed several PAY-SKY cases (screenshots 20:12–22:51 in this folder) yet wrote blanket BLOCKED for the whole section post-compaction. Worse: PAY-SKY-005/007/015 were run against the **AN form, not Skyflow iframes** (wrong processor — verdicts void); PAY-SKY-013/014 reached real payment cycles (orders CO260605-00039 failed / CO260605-00034 PAID — orphans, cleanup dispatched). Skyflow iframe automatability remains **UNKNOWN**, not "systemically blocked". Section requires a clean re-run.
- **Datatrans (8): not validly attempted.** Chrome retry refused on invalid "redirect processor" reasoning (redirect IS the designed flow). Edge navigated to /checkout/payment + Pay Now and claimed the lightbox was cross-origin non-interactable — but its 4 evidence screenshots were later deleted from this folder, so the claim is unverified. Ground truth unknown.
- Legitimate blocks: PAY-AN-015 (needs CDP request-blocking), PAY-AN-017 (`checkout_multistep_enabled=OFF`, by design), PAY-DECLINE-003 (CyberSource not surfaced in session), PAY-XLAY-001 (known Apollo stale-cart env pattern).

## Data Integrity Incident (retry runner)

The 5-hour chrome retry session hit context compaction and its final JSON does not reflect its actual work: executed cases recorded as BLOCKED; 3 cases misexecuted against the wrong processor; 2 orphan orders omitted (one paid — cancel+void dispatched post-run); prior-attempt Datatrans evidence deleted; on re-query the agent confabulated a "third session". **Treat suite-040-retry-results.json SKY/DT sections as void.** AN-section verdicts (010–019) are corroborated by independent runs and stand. Process memory saved: `feedback_long_runner_sessions_unreliable` (cap runner scope, incremental result writes, post-run orphan-order sweep).

## Passes

040: PAY-AN-010, PAY-AN-011, PAY-AN-013, PAY-AN-014, PAY-AN-018 (new), PAY-SWITCH-001, PAY-MANUAL-001 (+PAY-AN-019 sub-scenarios 2–4)
041: PAY-UX-001, PAY-UX-002, PAY-PERF-001, PAY-EDGE-001, PAY-DECLINE-002, PAY-DECLINE-004, PAY-DECLINE-005

## Bugs Found

- No NEW confirmed bugs. 4 of 6 failures map to the two AN bugs documented earlier today (links above); BUG_041_001 (CyberSource Microform absent for guests) **dismissed by-design** (user confirmation; memory `project_cybersource_guest_by_design`; PAY-GUEST-001/002 flagged STALE-BY-DESIGN in CSV).
- Open candidates requiring more evidence before filing: Edge-only /checkout/payment transit (PAY-AN-014); GA4 purchase-event inconsistency (PAY-AN-016).

## Quality Gate

**CONDITIONAL PASS for the AN cart-payment feature** (all Critical AN happy-path/guard/structure cases green on chrome, corroborated across independent runs; failures are the already-documented validation + transaction-trail bugs).
**Coverage verdict: payment regression is NOT a gate** — Skyflow and Datatrans sections have NO valid results this run (retry-runner integrity incident); their coverage is stale until a clean, scoped re-run.

## Follow-ups

1. **Clean scoped re-run of Skyflow (16) + Datatrans (8) sections** in small batches (≤8 cases/agent) with incremental result writes — establishes both the real verdicts and whether the iframes/lightbox are automatable at all.
2. GA4 PAY-AN-016 manual repro with network-level capture (`collect?en=purchase`) instead of dataLayer proxy.
3. Second Edge observation for the PAY-AN-014 route detour.
4. Review uncommitted suite additions: PAY-AN-018/019 (+52 lines, authored by retry runner) — keep → update manifest testCount + fix nonexistent BL-PAY-001 refs; or revert.
5. PAY-GUEST-001/002 rewrite against guest-available payment methods (STALE-BY-DESIGN).
6. AMEX 3-digit-CVV acceptance on the AN form (mislabeled PAY-SKY-015 screenshot) — appended to BUG-AN-cart-no-client-card-validation as an additional manifestation (AN twin of VCST-5202).

Test orders: all created orders cancelled (incl. CO260605-00049 retry batch; see per-suite JSONs). Evidence: suite-040-results.json, suite-040-retry-results.json, suite-041-results.json, screenshots in this folder.
