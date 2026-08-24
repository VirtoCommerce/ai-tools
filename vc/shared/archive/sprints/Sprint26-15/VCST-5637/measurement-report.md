# VCST-5637 — Test Plan, AC & Dependency-Count Measurement

**Check type:** performance / dependency-count measurement (Scope for Test)
**Env:** BEFORE `vcptcore-qa` @ Platform 3.1053.0-pr-3092, XCatalog **3.1014.0** · AFTER `vcst-qa` @ Platform 3.1057.0-pr-3095, XCatalog **3.1016.0-pr-106-3559**
**Date:** 2026-08-06 · **Verdict: PASS**

## Summary

Criterion 1 is executed with controlled cross-environment A/B measurements, replicated twice per environment.
On an **x-cart** request against an identical 3-line-item cart, product `_search` calls fall from a median of
**9 to 3.5 (≈−61%)**; on a **catalog** request, four byte-identical searches collapse **4 → 1** while four
*distinct*-criteria searches stay at 4 on both builds — the control that rules out a warm cache explaining the
drop. Total dependency count on those cart requests stays in-band, so the SQL side does not move, which is
right for a change touching only Elasticsearch. **Criterion 2 (durations) is deliberately not claimed** —
cross-env latency is out of scope by the ticket's own boundary and the same-env duration data is
workload-confounded.

## Scope for Test (Oleg Zhuk, 2026-08-04)

> Compare before and after fix: 1) Count of dependencies for x-cart operations 2) Total durations.

**Design.** The ticket sets its own validity boundary: *"the structural metric — integer count of `_search`
calls per request at one virtual user with 0% request overlap — is a property of this handler and transfers;
absolute latency figures … are not claimed here."* So **counts carry the argument, cross-env latency does
not**. Confound control: the identical query *text* goes straight to both backends rather than through each
storefront (differing theme versions would change the query shape, hence the resolution graph), and the cart
is seeded to an identical **3 line items × qty 2** on both envs. Harnesses (scratch, not durable suites):
`m5637-cart-*.csv` (`PERF-5637-CART`), `m5637-read.csv` (`PERF-5637-READ`), `measure-5637-catalog.csv`
(`PERF-5637-CAT`).

## Acceptance criteria (derived — Task ticket with an engineering spec, no formal ACs)

| # | AC | Result |
|---|---|---|
| AC-1 | Identical product searches in one request collapse to a single ES `_search` | **PASS** — 4 → 1, controlled |
| AC-2 | x-cart **read** ops issue fewer product `_search` calls after than before | **PASS** — median 9 → 3.5, controlled, 2 replications |
| AC-3 | x-cart **write** ops issue fewer product `_search` calls after than before | **PASS** — same runs, same band |
| AC-4 | Total dependency count does not regress | **PASS** — totalDeps in-band. *Duration NOT claimed* (see criterion 2 below) |
| AC-5 | Key-complete — differing criteria must NOT share a result | **PASS** — 4 distinct stay 4; CAT-GQL-134/135/136/137 |
| AC-6 | Response isolation — no caller sees another's mutated aggregations | **PASS** — CAT-GQL-133/139 |
| AC-7 | `SearchCategoryQueryHandler` untouched (no scope creep) | **PASS** — CAT-GQL-138 |
| AC-8 | No new failure mode, esp. `ObjectDisposedException` | **PASS** — 0 occurrences post-deploy |

Sources: AC-1/5/6/7/8 from the ticket's Problem / Key-completeness / Response-isolation / Non-goals sections
and PR #106; AC-2/3/4 from the Scope for Test. **AC coverage 8/8.** No DoD on the ticket.

## Measurement 1 — controlled x-cart A/B (primary for criterion 1; AC-2/3/4)

Identical cart (3 line items × qty 2), byte-identical query text, 1 virtual user, 0% overlap. Counts are ES
`POST /*-product-active/_search` dependencies joined to their request by `operation_Id`. **Two independent
replications per env**; every observed value is listed so a reader can recompute.

| | BEFORE vcptcore-qa | AFTER vcst-qa |
|---|---|---|
| Replication 1 (08:55Z) — product-resolving requests | 10, 10 | 4, 3 |
| Replication 2 (09:07Z) — same | 10, 8, 6 | 3, 4, 4, 3 |
| **combined** | **6, 8, 10, 10** — median **9** | **3, 3, 3, 4, 4, 4** — median **3.5** |
| total deps on those requests | 21–47 | 33–37 |

**Product searches per x-cart request: median 9 → 3.5, ≈ −61%.** The after side is tight (3–4 across six
observations); the before side wider (6–10), reflecting cache state and read-vs-write mix. **Total dependency
count stays in the same band**, so the SQL side is unchanged — the correct signature for an Elasticsearch-only
change, and the check that stops this fix being credited with an unrelated improvement.

**Cache-state confound, partly addressed.** vcptcore-qa is idle (cold caches) where vcst-qa carries continuous
traffic, so warm caches could in principle explain part of the gap. In replication 2 vcptcore-qa's caches were
already warm from the preceding runs and it still measured 6–10 against 3–4 — weakening that explanation
without eliminating it; the catalog arm below carries the decisive control. Products necessarily differ between
the catalogs (vcptcore-qa has **zero tracked inventory**, so only `isTrackInventory: false` products are
addable); the cart *shape* is identical, which is what a count comparison needs.

## Measurement 2 — catalog A/B: the mechanism in isolation (AC-1/AC-5)

Same query text, 1 VU, 3 reps per arm.

| Arm | BEFORE vcptcore-qa | AFTER vcst-qa | Delta |
|---|---|---|---|
| 4 **identical** `products()` aliases in ONE request | **4, 4, 4** | **1, 1, 1** | **−75%** |
| 1 `products()` call — control | 1, 1, 1 | 1, 1, 1 | unchanged |
| 4 **distinct-criteria** aliases in ONE request | 4, 4, 4 | **4, 4** (see below) | unchanged |

The control arm shows the harness measures nothing spurious. **The distinct arm is the decisive control:** if
a warm platform cache — rather than this fix — were serving vcst-qa's requests, the distinct arm would have
collapsed there too. It did not, which is what licenses attributing the identical-arm drop to the dedup.

*Precision note:* on vcst-qa only **two** distinct-arm records were observed directly; sampling folded the
third (`itemCount` is an estimate — the 9 requests resolved as 7-with-1-search + 2-with-4 rather than the
expected 6 + 3). Reported as "4, 4" rather than "4, 4, 4" for that reason.

## Measurement 3 — observational same-env traffic (superseded)

Real vcst-qa traffic across its own deploy agrees in **direction** (e.g. `GetFullCart` 7.52 → 2.00 /req) but
its **magnitudes are unusable**: SQL per `GetFullCart` also fell 78%, which this fix cannot cause, so the two
windows are different workloads; and vcst-qa is continuously redeployed. Full per-operation figures:
`summary.json` → `scope_for_test.xcart_same_env`. Not reproduced here because Measurement 1 supersedes it.

## Self-check performed

Every figure was re-traced to the App Insights query that produced it, and the controlled x-cart A/B was re-run
as an independent second replication. **Three defects in my own earlier drafts, corrected here:**

1. **Deploy boundary mis-dated** — GitHub's `merged_at: 2026-08-05T11:36:21Z` read as +03:00 put the cut at
   08:36Z, counting old-build traffic as "after". Three claims built on it are **withdrawn**: "peak stays
   18–34/request" (corrected max 3–6), `ChangeCartCurrency` −81% (no before sample), "`SelectCartItems` ticked
   up" (n=1 before).
2. **Over-precision** — vcst-qa distinct arm reported as `4, 4, 4` when only two records were observed.
3. **Internal contradiction** — AC-4 read "no op slower" while the notes recorded AddCoupon's median rising;
   AC-4 now claims dependency **count** only.

## Notes

- **Repeated identical requests are not independent samples.** Eight identical cart reads collapse from 6
  searches / 317 ms to 1 search / 10 ms *within seconds on the pre-fix build* — the platform's own catalog
  caches warming, not this fix. Only the cold request discriminates; a naive repeat-and-average would have
  reported the fix as doing nothing.
- **Sampling.** Adaptive sampling retained 3 of 11 requests in replication 1 (`itemCount` 2–4); replication 2's
  after-side records were **unsampled** (`itemCount` 1). Each retained record is one real request with real
  counts and shares its multiplier with its dependencies, so per-request integrity holds; both arms alike.
- **Residual searches are expected.** Where more than one remains they carry genuinely different criteria
  (`ObjectIds` order deliberately not canonicalised) — the fix removes *duplicates*, not all searches.
- **AC-8 checked explicitly.** PR #106 warns a fire-and-forget send would newly surface
  `ObjectDisposedException`: zero occurrences post-deploy, none in the handler or caching path, and the
  post-fix exception count is *lower* than pre-fix.
- **Needs review, not filed:** one `ArgumentNullException at XCart.UpdateCartQuantityCommandHandler`
  (08-05 12:24Z), sole occurrence in 20 days, on an *unnamed* GraphQL op — ad-hoc client, different module.
- **Harness defects (mine):** an `errors[] empty` predicate the runner rejects, and `.items.0.id exists`
  unsupported. Data verified from the evidence JSON; no effect on any comparison.
- **Correctness re-verified:** `CAT-GQL-133`–`139` (`050a-graphql-xcatalog.csv`) re-run on the current build —
  **7/7 PASS, 48/48 assertions** — key completeness, response isolation, categories negative control, facets.

**References:** VCST-5637 · vc-platform#3095 · vc-module-x-catalog#106 · deploy vc-deploy-dev#6300
