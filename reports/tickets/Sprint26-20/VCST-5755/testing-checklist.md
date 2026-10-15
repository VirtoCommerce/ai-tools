# VCST-5755 — Testing checklist (FAST, vcptcore-qa)

**Ticket:** [BE] Sales Rep Hub statistics cache invalidation \ instances sync · Task · Medium · parent VCST-5142
**Path:** feature-test FAST · layer `module` (vc-module-sales-rep PR #18, C# only) · one execution agent (`qa-backend-expert`, API only)
**Build under test:** SalesRep `3.1013.0-pr-18-42c1` (deployed, probed 2026-10-12 07:40 UTC and re-probed at run start) · Platform 3.1078.0 · Redis Healthy · **2 backend replicas**
**Delta vs prior verdict:** vcst-qa run (2026-10-08) was on `pr-18-d367`; `d367→42c1` changes CI workflows only — module code identical. This run re-proves the behaviour on a second 2-replica topology.
**Oracle:** ticket AC/DoD + QA notes (comment 2026-09-10) = `{SPEC}`. No `BL-*` invariant covers statistics freshness (gap). Scope rules `BL-SR-002`, `BL-SR-005`, `BL-SR-006`, `BL-SR-001` checked alongside.
**Technique:** twin probe — K (frozen args) vs K′ (same args, `to` shifted by whole seconds ⇒ always cold). All `*CacheExpirationMinutes` = 60 during staleness checks; restored to `1`. Pods pinned via the affinity cookie (on vcptcore-qa named `vcptcore-qa-vcptcore-qa-loyalty-platform`, not `INGRESSCOOKIE`); pods identified by the frozen value each returned.
**Data:** `@td(SR_REP_PRIMARY)`, `{{SALES_REP_PASSWORD_VCPTCORE}}` — serves **5** orgs on this stand (fixture lists 4). Carts/orders created in-case as `AGENT-TEST-5755-*`, all deleted by id.
**Window:** 2026-10-12 07:41–08:00 UTC.

| # | Condition (AC) | Verdict | Evidence |
|---|---|---|---|
| T0 | Topology: replicas + Redis | **PASS — 2 replicas** | 30 cookie-less reads of a TTL-only stale key → exactly 2 frozen values (q=6 ×14, q=7 ×16); pinned reads 5/5 per pod; `/health` Redis Healthy 1 ms |
| C1 | AC-7 Instrument: Cart flag `false` → K stale, K′ moves | **PASS** | after 6 rep qty changes K stayed q=6 (A) / q=7 (B), K′ = 12 |
| C2 | AC-1 Cart flag `true` → fresh on first read, same instance | **PASS** | change via A → A read K=K′=13; change via B → B read 14 = K′. Flag seen on A after 441 ms, B after 661 ms |
| C3 | AC-2 Cross-instance (Redis on) ≤ ~1 s | **PASS** | both directions: A→B fresh ~0.4 s after; B→A fresh < 0.73 s after the mutation |
| C4 | AC-8 Rep checkout → order stats, counts, YTD fresh | **PASS** | CO261012-00001 (1197): ACME 7/663.2 → 8/1860.2, all-orgs 24/3751.67 → 25/4948.67, YTD 663.2 → 1860.2 on both pods; counts proven by CO261012-00002 (orderingCustomers 4 → 5) |
| C5 | AC-9 Admin status change → figures + status vocabulary | **PASS** | New → Completed via B: `salesRepOrderFilterRules` gained Completed on A and B on first read; cancel via A → figures back to 7/663.2 (BL-SR-005) on both pods |
| C6 | AC-4 `salesRepCustomers` order-metric sorts fresh | **PASS** | `my-last-orders`: AcmeCorp 4th → 1st after O1, RepOnly → 1st after O2; `ytd-purchases`: RepOnly 5th → 2nd; every read matched its twin on both pods |
| C7 | AC-3 Aggregate == sum of per-customer cards | **PASS** | after O1: all-orgs 25 / $4948.67 = Σ 5 orgs (8/1860.2 + 2/123 + 11/2777.47 + 4/188 + 0/0) |
| C8 | AC-10 TopSeller default stale; `true` refreshes | **PASS** | flag false: ranking stale on A/B while K′ showed `0003420:26`; flag true: new key fresh after cancel and after O2 |
| C9 | AC-6/AC-11 TTL 0 recomputes; flag flip at runtime | **PASS** | TTL 0: new key tracked K′ across 6 changes A/B; flag false→true → next change evicted 1.16 s after flip, no restart; pre-existing stale key still served under TTL 0 (by design: TTL 0 does not flush) |
| C10 | AC-11 Per-org isolation | **PASS** | ACME change left TechFlow key stale 3/3 per pod while ACME control went fresh; TechFlow change then made TechFlow fresh (positive control) |
| C11 | AC-12 8 Statistics settings + defaults | **PASS** | API: group `Sales Rep|Statistics`, 4 × Integer default 5, 4 × Boolean default true/true/true/false. **Admin UI** (Settings › Sales Rep › Statistics, 08:07 UTC): all 8 present; TTLs show `1` with modified marker + reset; Cart/CustomerCounts/Order toggles ON, TopSeller OFF — matches API. Labels render as raw keys (VCST-6229, already filed). `screenshots/admin-settings-salesrep-statistics-vcptcore.png` |
| C12 | AC-5 Benchmark TTL 0 on 1M orders | **NOT TESTED** | stand has ~1,300 orders. Informational: all-orgs cart stats 190–210 ms at TTL 0 vs 181–209 ms cached |
| C13 | Restore + cleanup | **PASS** | TTLs = 1 (re-verified 08:00 UTC); Order/CustomerCounts flags untouched (null); Cart flag now stored `true`, TopSeller stored `false` (= defaults; API cannot unset). 2 orders + 5 carts deleted; orders 404, search `AGENT-TEST-5755` = 0 |

**Incidental (below floor, not filed):** Low — `my-last-orders` sort ignores a cancelled last order that `lastOrder` still displays → `reports/bugs/open/low/BUG-SalesRep-Customers-LastOrders-Sort-Ignores-Cancelled-LastOrder.md`. Not related to the cache change.

**Not covered:** C12 benchmark; Redis reconnect flush; cart moved between orgs (both orgs evicted); delta-filter skip (performance only); storefront hub rendering.

**Known, filed:** VCST-6229 (Low, settings labels not localized) · VCST-6228 (Medium, out of scope, xCart pickup address).
