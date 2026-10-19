# Exploratory Session: Sales Rep statistics cache, cross-instance eviction (VCST-5755, lane B)
**Date:** 2026-10-08 (21:33–22:06 UTC) · **Duration:** ~33 of 45 min · **Env:** vcst_qa · **Platform:** 3.1076.0 · SalesRep 3.1013.0-pr-18-d367 · XCart 3.1040.0-pr-149 · **Theme:** n/a (BE only)
**Session type:** [EXP+VAL] · **Discovery technique:** user-flow edge enumeration (reverse edges) plus surprise-seeking · **Mode:** `ticket`; charter received from the Test Model `reports/ba/test-models/VCST-5755-2026-10-08.md` §Unresolved
**Charter:** rep2 / AGENT-TEST-SR5755-Org-C only. Close the GAP cells V-other×L5 and V-buyer×L5, the reverse edges (cancel, clear/remove, org move) and the S#10 / RACE hypotheses. Org-A/B, rep1, buyer and every `SalesRep.Statistics.*` write belong to lane A.
**Edge-Case Refs:** ECL-10.1 · **BL Refs:** BL-SR-002, BL-SR-005, BL-SR-006, BL-SR-009 · **Evidence:** `reports/tickets/Sprint26-20/VCST-5755/vcst_qa/evidence/explore/*.jsonl` (HTTP only, no browser, so no HAR)
**Method:** twin probe as in the checklist Rules (frozen future `to`, K′ = `to` + n whole seconds). Warm-up = 15–25 cookie-less reads. Probe = 8–10 parallel reads fired 0 ms after the mutation response, then 20 sequential reads. Mode read before and after every sequence: all runs had a stable mode (lane A's `settings-state.json` + live GET).

## Mission coverage (the five sources)
| # | Item | Status |
|---|---|---|
| 1a | V-other×L5: rep2's own Org-C change evicts Org-C on every instance | **Covered, PASS.** Cart, Order, Counts, inline, vocabulary, comparison, TopSeller and all-served keys were fresh on every read (X3–X8) |
| 1b | …and leaves other orgs alone | **NOT REACHED.** rep2 serves one org, and an over-eviction moves no number. Latency is no side channel: in one run hits were ~180 ms and misses ~284 ms; in two others both were ~260–300 ms (`p-latency-l7.jsonl`) |
| 1c | V-buyer×L5 analogue (eviction with no moved number) | **NOT REACHED.** Same reason: no instance-identifying header, and the latency signal does not repeat |
| 2 | Reverse edges | Cancel **covered, PASS** (X4, 4 orders). clearCart / removeCart **covered, PASS** (X5). Cart org move **NOT REACHED**: rep2 has one org, and a move needs an admin cart write that this lane may not make |
| 3 | {HYPOTHESIS} S#10 + RACE | **Covered**, see the table below. Redis reconnect flush **NOT REACHED** (no control over Redis) |
| 4 | ACs flagged DRIFT/NOT-FOUND/CONTRADICTS | none flagged (no 1d pass on this path) |
| 5 | tc:scope at-risk rows | **NOT REACHED**: tc:scope is not part of /qa-test-fast |

## {HYPOTHESIS} results
| Hypothesis | OBSERVED |
|---|---|
| S#10: a settings change reaches every instance's settings cache | **Holds.** A poller ran 21:44–22:00 with 4 parallel cookie-less GETs of the 8 settings every ~1.5 s. It saw 3 transitions (TopSeller flag→true, TTL 60→1, TopSeller flag→false), each in the first tick after the write, and **0 mixed ticks** (`p-settings.jsonl`). Behaviour matches: entries warmed after lane A's Cart flip (21:43:44) and TopSeller flip (21:49:45) were evicted on every instance by the next change (X5, X7) |
| RACE: probe at 0 ms after the response, plus N in parallel | **Window exists, under 1 s.** Seen once: 5 of 10 parallel `salesRepTopSellers` reads that finished 203–270 ms after an order response were stale, and every read from 693 ms on was fresh (ord4, `seq.jsonl`). Every other 0 ms batch had 0 stale reads (≈14 sequences; race2: 5 timed batches × 24 reads × 2 events). A read storm during the mutation (3 runs, ~207 reads) left no stale entry (`p-race.jsonl`) |

## Findings (evidence: `…/evidence/explore/`)
| X | Condition | Source | Result |
|---|---|---|---|
| X1 | TopSeller (flag default false, TTL 60): 1 warm read → rep2 order → 45 cookie-less reads | 1 (S#0 precondition) | **PASS**: ≥2 instances, 22 stale / 23 fresh interleaved (`p-topdiag.jsonl`, `seq.jsonl` checkout) |
| X2 | Cart under lane A's flag false (A0) → rep2 checkout | open (instrument) | **PASS** (expected): K stayed 4 on 15/15 reads while K′ = 0; a must-not-be-bug (`seq.jsonl` checkout) |
| X3 | addItem (Cart flag true) and checkout (Order/Counts default) in Org-C | 1a | **PASS**: cart 30/30 reads moved 0→4, order 30/30 moved 0→1, counts 15/15, all including the 0 ms batch (`seq.jsonl` cart-add, checkout) |
| X4 | Admin cancel ×4 → order, counts, inline YTD, vocabulary, comparison, TopSeller | 2 | **PASS**: every probe equalled its twin, including at 0 ms (`seq.jsonl` cancel, ord2–ord4, race2) |
| X5 | `clearCart`, then `removeCart` (Cart flag true) | 2 | **PASS**: 3→0 on 30/30 reads each (`seq.jsonl` cart-clear) |
| X6 | All-served keys, `organizationId` omitted or `""`, after an Org-C addItem | open | **PASS**: 0→3 on 30/30 reads each (`seq.jsonl` allorgs) |
| X7 | Read storm (4 loops) during addItem / changeCartItemQuantity ×3 | 3 RACE | **PASS**: 0 stale among the 113 reads that started after the response; settle 60/60 fresh (`p-race.jsonl`) |
| X8 | 0 ms parallel batch on TopSeller after an order | 3 RACE | **PASS** (under 1 s): 5/10 stale at 203–270 ms, fresh by 693 ms; did not recur in race2 (`seq.jsonl` ord4, race2) |
| X9 | Product 566903892 auto-adds a gift line | open | **PASS**: counted in `selectedItemQuantity` as BL-SR-006 says, so 3 added + 1 gift reads 4 |
| X10 | Successive checkouts by one rep | open | **DRIFT**: 4 orders share one `shoppingCartId`; the cart survives `createOrderFromCart`, emptied, and is reused (`p-cartid.jsonl`) |
| X11 | BOPIS shipment with a delivery address and no pickup location | open (incidental) | **FAIL** (outside scope, seen once): `DB_UPDATE`/`SQL` error on `addOrUpdateCartShipment` |
| X12 | Over-eviction / no-moved-number eviction | 1b, 1c | **NOT-RUN**: no instrument (latency does not repeat between runs; no instance header) |
| X13 | 8 settings, 4 parallel GETs per ~1.5 s tick, 21:44–22:00 | 3 S#10 | **PASS**: 3 transitions, each in the first tick after the write, 0 mixed ticks (`p-settings.jsonl`) |

## Net-New Scenarios Discovered
| # | Scenario | Why uncovered | What we found | Oracle ref | Fate |
|---|---|---|---|---|---|
| 1 | Admin cancel (IsCancelled) of a rep order → order stats, counts, inline YTD, comparison and TopSeller drop on all instances; the row keeps `lastOrder`=Cancelled and the vocabulary keeps "Cancelled" | model reverse edge, no item | PASS ×4 (X4) | BL-SR-005, BL-SR-009 | PROMOTE → sr statistics suite (050m), Draft: warm all instances → cancel → K==K′ |
| 2 | `clearCart` / `removeCart` → cart stats drop on all instances | model reverse edge | PASS (X5) | BL-SR-006 | PROMOTE → same suite, Draft |
| 3 | All-served keys (`organizationId` omitted or `""`) are evicted by a change in a served org | the model used only explicit org ids | PASS (X6) | NONE | PROMOTE → Draft (a cheap row beside A1) |
| 4 | Precondition without a settings write: TopSeller's default flag is false, so 1 warm read + an order gives a stale/fresh MIX, proving ≥2 instances | S#0 needs a Cart flag flip | 22 stale / 23 fresh of 45 (X1) | NONE | PROMOTE → precondition step for the cross-instance cases |
| 5 | Read storm during the mutation (stale re-cache race) | the RACE archetype was WAIVED | no stale entry survives (X7) | ECL-10.1 | DECLINE: needs a concurrent-loop harness the CSV runner lacks |
| 6 | The same cart id is reused across successive checkouts | not in any suite | 4 orders share `shoppingCartId` d45a89c0, and the cart survives `createOrderFromCart` emptied (X10) | NONE | DECLINE here (out of scope), routed as a question |

## Oracle Feedback
| Kind | Entry | Evidence | Route |
|---|---|---|---|
| Candidate new invariant | Statistics are fresh on every instance from the first read after the mutation returns, with sub-second backplane lag | X3–X8 | `kb_capture` KB-F85ADC2B (needs a human source for any BL) |
| Confirmed | BL-SR-006 gift-line clause: gift lines count in `selectedItemQuantity` (3 + 1 gift → 4) | X9 | none (the oracle already holds it) |

## Bugs Found (handed back, not filed)
| # | Severity | Title | Evidence | Net-new? |
|---|---|---|---|---|
| 1 | Medium (proposed) | `addOrUpdateCartShipment` with `BuyOnlinePickupInStore`/Pickup + a deliveryAddress (no pickup location) returns `DB_UPDATE`/`SQL` instead of a validation error | stderr of the first checkout attempt; seen once, needs a repro | Yes, outside VCST-5755 |

## Observations
- The first statistics read of the session took **27.5 s**; it never repeated in ~1,000 reads. Possibly a lazy per-instance build of the scoped schema (`p1-pods.jsonl`).
- Twin offsets must be whole seconds: `to` + 0.777 s hit K's entry, because the period key has second resolution.
- `INGRESSCOOKIE` is new on every cookie-less response, and its `|` suffix is constant, so it cannot name an instance.

## Questions
- Is keeping and reusing the cart after `createOrderFromCart` (X10) intended on XCart 3.1040.0-pr-149, or is it a regression of that PR build?

## Charter-from-Gap
- Give rep2 a second, untested org and measure over-eviction on another org's entry (closes 1b/1c and S#13).
- Cart org move (old+new OrganizationId) with an admin-authorised lane.
- Redis reconnect flush: needs an operator able to bounce Redis.

**Ledger** (rep2, Org-C, all `AGENT-TEST` or ledgered; nothing deleted): carts f7e9502a-bfc5-43fb-b3ce-b095bd92cc7d (removed), d45a89c0-cff3-43c8-9f22-469efa33be58 (live, empty); orders, all admin-cancelled: CO261008-00007 8a68c94b-0393-40f1-82d2-2ef2b019e33c · -00011 6f86775e-fdb6-4ea3-818c-e2b13390467f · -00013 8d96af4c-71e0-47dd-bafb-d8e772be4a44 · -00015 23125b90-19f5-4885-8450-14a95ba65d36 · -00016 8a89cd16-ba9a-45ec-8260-1507bd4c3be9.
