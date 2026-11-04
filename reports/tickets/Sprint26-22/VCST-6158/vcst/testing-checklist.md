# Testing checklist — VCST-6158 · Sales Rep Hub: Available coupons on the customer profile · round 1 · vcst

Build: VirtoCommerce.SalesRep 3.1017.0-pr-30-1e10 (vc-module-sales-rep#30 @ 1e103a45) · theme 2.62.0-pr-2596-e749-e749b47f (vc-frontend#2596) · Marketing 3.1010.0 · platform 3.1093.0-pr-3154-4607 · store B2B-store
Scope source: assignee comment 2026-10-22 (overrides the description and mockup) · Model: test-model.md (+ 3x amendments) · Discovery: exploratory/SBTM-VCST-6158-2026-11-03.md
Data: rep @td(SR_REP_PRIMARY) · served customers @td(ORG_TECHFLOW), @td(ORG_ACME) · unserved org @td(SR_UNSERVED_ORG) · non-rep buyer {{ORG_USER_EMAIL}} · admin {{ADMIN_LOGIN}} · seeded coupons @td(SRCPN_*) via `npm run seed:promotions:sales-rep-coupons` (rolling dates: assert relations). Teardown PENDING: `TEST_ENV=vcst npm run seed:promotions:sales-rep-coupons:teardown`. Deploy pin vc-deploy-dev#7029 still to revert.
Browser zone: Central Europe (UTC+1). Status: `1c`/`3x` = observed this run · `4a-FE` qa-frontend-expert (chrome) · `4a-BE` qa-backend-expert (API) · `4v` visual lane (edge).
Regression track: C1 REG-2026-11-03-1732 — 37 ids, run files: **28 PASS / 3 FAIL / 6 BLOCKED (75.7%)** after one retry (first attempt 26 / 3 / 8; SR-CP-077 and SR-CP-083 blocked by concurrent 050m fixtures, PASS on retry). SR-CP-074 re-run alone after the fixture write-back → PASS (no results file; outside the RUN_ID). All 6 BLOCKED are triaged as case or fixture limits (`--blocked-triaged 6`). No release sweep — Feature Release Gate `not-assessed`. App Insights `not checked` (no API key).
**Run verdict: PASS WITH NOTES** (re-written 2026-11-03 after the run folder's untracked files were deleted outside the run).

## A. The widget and the page (AC-01…AC-04)
| # | Condition | Source | Scenario | Owner / status | Verdict |
|---|---|---|---|---|---|
| C-01 | [FLOW] widget "Available coupons" ≤ row setting; "All promotion coupons" opens the customer's coupons page; widget = first N of `salesRepCoupons`, page 1 = first 10; copy puts the shown code on the clipboard + notice | AC-01/02/04 | S1 | 4a-FE | PASS (C1 SR-CP-070) |
| C-02 | Card: label, name, description, "Expires" when an end exists, code + copy, uses line | AC-04/05 | S1 | 4a-FE | PASS |
| C-03 | Paged by 10; pager when > 10; page 2 continues page 1 | AC-03 | S11 | 4a-FE + 4a-BE | PASS (C1 SR-GQL-170) |
| C-04 | Reload/back → page 1; switching customer → page 1 with that customer's heading | gap | S11 | 4a-FE | PASS |
| C-05 | Widget rows = block row setting (default 5; clamps 1–20) | 1d W-5 | S20 | 4a-FE | PASS (C1 SR-CP-076) |

## B. Which coupons are listed (AC-07, AC-08, AC-11)
| # | Condition | Source | Scenario | Owner / status | Verdict |
|---|---|---|---|---|---|
| C-06 | Coupon expired at coupon level hidden while its promotion is active | AC-07 | S5 | 4a-BE + FE | PASS (C1 SR-GQL-164) |
| C-07 | Capped coupon at its cap hidden | AC-08 | S3 | 4a-BE | PASS |
| C-08 | Last use recorded during the case → gone on the next request (in-case coupon) | AC-08 | S3 | 4a-BE | PASS (C1 SR-GQL-163) |
| C-09 | Member-bound coupon absent for every customer, incl. the bound org | AC-11 / PR | S8 | 3x | PASS (C1 SR-GQL-167) |
| C-10 | …while checkout accepts it from the bound org's buyer and refuses others | 3x | S32 | 3x | PO QUESTION — should the bound org's own page list it? (C1 SR-CP-083 PASS as specified) |
| C-11 | Multi-coupon, private, inactive, future-start promotions not listed | PR #30 | S9 | 4a-BE | PASS (C1 SR-GQL-168) |
| C-12 | AC-11 "same set as the buyer page" vs AC-07/08 "hidden: expired and used-up" | AC-11 | — | 3x | SPEC CONFLICT, root cause VCST-6675, awaiting PO — the build serves the redeemable set the comment's hide rule describes; if the PO means "literally equal to the buyer page", this verdict flips to FAIL |

## C. "Expires" and order (AC-09, AC-10)
| # | Condition | Source | Scenario | Owner / status | Verdict |
|---|---|---|---|---|---|
| C-13 | Coupon expiry earlier ⇒ Expires = coupon expiry | AC-09 | S6 | 4a-BE + FE | PASS (C1 SR-GQL-165) |
| C-14 | Promotion end earlier ⇒ Expires = promotion end | AC-09 | S7 | 4a-BE + FE | PASS (C1 SR-GQL-166) |
| C-15 | No end ⇒ no Expires line, sorts last | AC-10 | S14, S10 | 4a-FE + BE | PASS (C1 SR-CP-073) |
| C-16 | Soonest end first; ties stable | AC-10 | S10 | 4a-BE | PASS (C1 SR-GQL-169) |
| C-17 | The date shown is never after the last day the code works | 3x | S29 | 4a-FE | FAIL — Medium, filed VCST-6677; reference time zone = PO QUESTION (C1 SR-CP-084 FAIL) |

## D. Uses line (AC-05, AC-06)
| # | Condition | Source | Scenario | Owner / status | Verdict |
|---|---|---|---|---|---|
| C-18 | Capped partial uses line | AC-05 | S2 | 3x + 4a-FE | PASS on content ("3 uses left out of 5"); copy-string differs from "N of M uses left" ({OBSERVED} surface) — wording PO QUESTION |
| C-19 | One left: singular; "0 left" never rendered | AC-05 | S4 | 4a-FE | PASS (C1 SR-CP-072) |
| C-20 | No cap ⇒ "Unlimited" | AC-06 | S1 | 1r + 4a-FE | PASS |
| C-21 | Cancelled order does not give the use back | 3x | S33 | 4a-BE | OBSERVED: not released — PO QUESTION (C1 SR-GQL-174, held at Draft) |
| C-22 | Number formatting ("9961 uses left out of 10000") | 3x | S34 | 4a-FE | OBSERVED: no grouping (en + de) — PO QUESTION |
| C-23 | de-DE localization, invariant fallback, plural | BL-SR-013 | S12, S13 | 4a-BE + FE | PASS (C1 SR-GQL-171) |

## E. Access, gates and the shared route guard (AC-12, AC-13)
| # | Condition | Source | Scenario | Owner / status | Verdict |
|---|---|---|---|---|---|
| C-24 | Empty or unknown storeId ⇒ empty list | PR #30 | S16 | 4a-BE | PASS (C1 SR-GQL-172) |
| C-25 | Non-rep: UI redirect, no query; API 200 empty | BL-SR-011 | S18 | 4a-FE + BE | PASS (C1 SR-GQL-173, SR-CP-075) |
| C-26 | Anonymous ⇒ Unauthorized | BL-GQL-004 | S19 | 4a-BE | PASS (C1 SR-GQL-173) |
| C-27 | Unserved customer's coupons URL ⇒ not found, no list | BL-SR-002 | S17 | 4a-FE | PASS — Low: "Back to customer" dead-ends (not filed) (SR-CP-074 re-run PASS) |
| C-28 | Marketing present ⇒ widget registered; absent ⇒ hidden + redirect | AC-12/13 | V11 | 3x | ON half PASS; OFF half NOT TESTED — no stand without Marketing |
| C-29 | Activity page still opens and redirects (shared guard refactor) | PR #30 | S30 | 4a-FE | PASS (C1 SR-CP-082) |

## F. States, copy and accessibility
| # | Condition | Source | Scenario | Owner / status | Verdict |
|---|---|---|---|---|---|
| C-30 | Skeleton, empty, error states announced via role=status | BL-A11Y-004 | S25 | 4v | PASS on forced states (weaker evidence: forced via run-code) — Low V-1 skeleton −44 px; V-3 loading not announced |
| C-31 | Copied text = the code as shown | ECL-1.3 | S15 | 4a-FE | PASS — Low: lowercase code shown/copied uppercase (VC-PROMO-003, not filed) (C1 SR-CP-080) |
| C-32 | Copy buttons: keyboard order, distinct names, ≥ 24 px | BL-A11Y-001/002, BL-UI-006 | S26 | 4v | PASS (C1 SR-CP-079) |
| C-33 | Compact by card width; long code wraps, no horizontal scroll | #2596 | S24, S27 | 4v | PASS on the page; widget half NOT REACHED (long code sorts outside the 5 rows) |

## G. Reach outside the ticket — the shared host card
| # | Condition | Source | Scenario | Owner / status | Verdict |
|---|---|---|---|---|---|
| C-34 | Buyer /account/coupons card unchanged at xs/md/lg/2xl | #2596 reach | S22 | 4v + 4a-FE | PASS vs the PR's declared behaviour (no pre-change render) — C1 CPN-066 BLOCKED (oracle) |
| C-35 | Buyer page: 46-char code wraps at 375/1280 | #2596 | S24 | 4v | PASS (C1 CPN-067) |
| C-36 | Cart sidebar coupons — premise corrected: it uses CouponCard, not the changed CouponItem | — | S23 withdrawn | 4a-FE | PASS (sanity) |

## H. Removed scope (AC-14)
| # | Condition | Source | Scenario | Owner / status | Verdict |
|---|---|---|---|---|---|
| C-37 | No filters, badges, Apply to cart, or the mockup caption | AC-14 | S31 | 4a-FE | PASS (C1 SR-CP-081) |

## Not tested, and why (stated, not silent)
- AC-02 link when the list is shorter than the row setting — NOT REACHED: unreachable while the store has ≥ 20 coupons.
- AC-12/13 Marketing OFF — NOT TESTED: every reachable stand runs Marketing; PR unit tests only.
- C1 BLOCKED (case/fixture limits, triaged): SR-CP-047 and SR-CP-078 need request interception; CPN-066 oracle undecidable; CPN-025 GraphiQL credential; CPN-053 no null-label coupon.
- App Insights run-window correlation — not checked (no API key configured).
- S28 negative paging — declined (platform-wide).

## Not filed (below severity floor) — drafts in bugs/low/
Back to customer dead-end · widget skeleton −44 px · lowercase code uppercased (VC-PROMO-003) · xAPI order.coupons INVALID_OPERATION · rep API totalUsesCount stale for uncapped coupons · regular card code column breaks codes mid-word at 1024–1280.

## Open PO questions and unverified suspects
Member-bound coupon hidden from the bound org that can redeem it · a cancelled order keeps the coupon use · uses-line wording · number grouping · reference time zone (with VCST-6677) · AC-11 spec conflict · **unverified suspect:** a promotion-level total usage limit of 1 was applied twice in the cart (3x; platform marketing, needs a VirtoOZ check — revenue-relevant, needs a human call).
