# COV-VCST-5628-5883 — Returns (Step 1 My Own Returns + Step 2 approve/decline + notifications)

Layers: **REST** = `073a` (+ legacy `073`) · **Admin UI** = `073b` (+ `073`) · **GraphQL** = `050o` · **Storefront** = `014c` (+ `014b` ORD-038).
Env of record: vcptcore-qa1, Return `3.1003.0-pr-27-90cb`. All new/changed rows are `Draft`. Verbs: C = covered, N = newly covered or materially strengthened by this change, GAP, OOS = out of scope.

## Summary

40 requirement rows (21 Step 1, 19 Step 2) · **34 covered** (15 already covered, **19 newly covered/strengthened**) · **3 GAP** (rows 12, 38, 39; rows 13 and 14 are covered only in part) · **3 OOS**.
Cases: **38 new rows** (5 PRE-FLIGHT + 33 cases: 050o 10, 073a 9, 073b 12, 014c 6, 073 1) and **15 repaired** (`073` 9, `014c` 6). The 19 runner-native rows (all new 050o and 073a rows) were run live on vcptcore-qa1 from the committed CSV: **19/19 PASS**. The 18 UI rows (073b, 014c, 073 RET-000) are authored but were **not executed** (no UI run here).

## Step 1 — VCST-5628

| # | Requirement | REST | Admin UI | GraphQL | Storefront | |
|---|---|---|---|---|---|---|
| 1 | Order is the only source; returnableItems per line | — | — | GQL-001..008 | ORD-RET-001,002 | C |
| 2 | Quantity across a long order, clamp, large qty free-text | — | RET-013 (repaired) | GQL-019,020,022,023 | ORD-RET-003 | C |
| 3 | Allowed order statuses setting gates eligibility | — | — | GQL-006,032 | ORD-RET-002 | C |
| 4 | Bulk-apply reason, per-line files | — | — | — | ORD-RET-004,006 | C |
| 5 | Attachments mandatory, limits from server | — | — | GQL-018,027 | ORD-RET-006,007 | C |
| 6 | Draft → Requested → Cancelled lifecycle | AUTH-029 (cancel notif.) | ADM-007 | GQL-014,015,016,017,019,024,026 | ORD-RET-001,009,010 | C |
| 7 | Hold/release: Draft holds nothing, Requested holds, Rejected/Cancelled release | AUTH-004,005 | ADM-003,004,007 | GQL-014,038,039,040 | ORD-RET-014 | C |
| 8 | 1 ≤ Quantity ≤ Available, ≥ 1 line, one order line once per return | AUTH-018 | RET-012,013 (repaired) | GQL-020,021,022,023 | ORD-RET-003 | C |
| 9 | Availability re-validated at authorize | AUTH-022 | — | — | — | C |
| 10 | RETURN_QUANTITY_UNAVAILABLE typed error, draft preserved | AUTH-022 | — | GQL-022,023 | — | C |
| 11 | Ownership: own scope, mutations need ownership, anonymous refused | — | — | GQL-012,013,025,029,**041** | ORD-RET-016 (own SETUP) | **N** |
| 12 | `scope: ORGANIZATION` server-enforced on `returns` | — | — | no such argument in the deployed schema | — | GAP |
| 13 | customerReference accepted, editable, prefilled from PO | — | — | **GQL-044** (API half) | — | **N** / prefill GAP |
| 14 | Price snapshot from the order line, never the catalog | AUTH-035 | RET-018 (repaired) | **GQL-043** (no price on xAPI) | — | **N** / snapshot-vs-catalog GAP |
| 15 | Store settings per store, read live, labelled in Admin | — | **ADM-011** | GQL-009,010,028,031..035 | — | **N** |
| 16 | Admin list shows buyer returns; status filter | — | **ADM-001,009**, RET-010 | GQL-030 | — | **N** |
| 17 | Orderless returns, MaxOrderlessLineQuantity | — | — | — | — | OOS (VCST-5884) |
| 18 | Rejected line needs a reject reason (mandatory) | — | — | — | — | OOS (VCST-5885) |
| 19 | Draft is autosaved, details page has an RMA number | — | — | GQL-015 | ORD-RET-001 | C |
| 20 | Localization of list, wizard, reasons, admin texts | — | **ADM-010** | GQL-035 | ORD-RET-011, **022** | **N** |
| 21 | AwaitingDelivery/Received/Processing/Completed declared but unreachable | — | RET-006,007 (legacy statuses only) | — | — | OOS (no behaviour in iteration 1) |

## Step 2 — VCST-5883

| # | Requirement | REST | Admin UI | GraphQL | Storefront | |
|---|---|---|---|---|---|---|
| 22 | Per-line decision; mixed lines → PartiallyApproved | AUTH-003 | **ADM-003** | **GQL-038** | ORD-RET-013 (repaired) | **N** |
| 23 | All lines full → Approved, nothing released | **AUTH-024** | **ADM-002** | **GQL-037** | **ORD-RET-020**, 012 | **N** |
| 24 | 240 requested / 200 approved: 40 released, measured vs requested | AUTH-004 | ADM-003 | GQL-039 | ORD-RET-014 (repaired) | C |
| 25 | All lines 0 → Rejected, full release; 1 → 0 edge | AUTH-005,006 | **ADM-004** | **GQL-040** | **ORD-RET-018** | **N** |
| 26 | 0 ≤ approved ≤ requested; undecided/empty/negative refused | AUTH-001,002 | (server refusal, not a UI hint) | — | — | C |
| 27 | Decided/Draft/Cancelled not re-authorizable; status never set directly | AUTH-007, **026** | RET-008 (repaired) | — | — | **N** |
| 28 | PUT guards: duplicate line, decision ignored, decided qty locked, malformed body | AUTH-018,019,020,023 | **ADM-005** | — | — | **N** |
| 29 | `return:authorize` — nobody without it decides; buyer cannot | AUTH-016 | **ADM-008** | **GQL-042** | — | **N** |
| 30 | Admin Approve/decline blade: requested data, per-line inputs, locked after decision | — | **ADM-001,002,003,004,005** | — | — | **N** |
| 31 | Status dropdown after a decision: forward only, one "Cancelled", no "Canceled" | AUTH-017, **025** | **ADM-006**, RET-009 (repaired) | **GQL-036** (labels) | — | **N** |
| 32 | One email + one push per outcome (registered/approved/partial/declined/cancelled), push = subject | AUTH-009,012, **028,029,030** | — | — | **ORD-RET-019** | **N** |
| 33 | Template content: requested next to approved, unit, reasons | AUTH-008, **031**, **030** | — | — | ORD-RET-013 | **N** |
| 34 | Silent cases and switches (no notification on plain save/status change) | AUTH-010,015 | RET-006,007 (repaired) | — | — | C |
| 35 | Culture: LanguageCode from the buyer, default template for locales without one | AUTH-013,014 | — | — | **ORD-RET-022** | **N** |
| 36 | Buyer read-back: status, approved, reasons, no actions | AUTH-008 | — | GQL-037..040 | ORD-RET-012,013,015,**018,020,021** | **N** |
| 37 | Units released by a decision are returnable and re-requestable | AUTH-004 | — | **GQL-039** | ORD-RET-014 | **N** |
| 38 | Push module absent → email-only, no error | — | — | — | — | GAP (needs the module removed) |
| 39 | Recipient order address → contact → login | — | — | — | — | GAP (fixture has all three equal: non-discriminating) |
| 40 | Colleague cannot read/cancel/be notified | — | — | GQL-013,041 | ORD-RET-016 | C |

Env gates (item 41, every suite): PRE-FLIGHT cases `RET-000` (073), `RET-AUTH-000`, `RET-ADM-000`, `RET-GQL-000`, `ORD-RET-000` + the full required-settings list in each suite's PRE-FLIGHT Preconditions.

## Repaired (stale against the binding facts)

`073`: RET-006,007 (silent status change), **008** (Rejected not selectable), **009** (forward only), **010** (new status set), **012** (duplicate line → "listed more than once"), **013** (returnable, not ordered), **018** (price snapshot, no refund); **RET-017 HELD** (no requirement says stock is restored; status `None`). IDs unchanged.
`014c`: ORD-RET-013/014/015/016 rewritten to create their own state instead of reading 073a-decided fixtures (XREF-001 violation + cross-suite state); 012 and 017 gained consumption / BLOCKED notes.

## Out of scope (and why)

- Orderless returns, MaxOrderlessLineQuantity, org-mailbox copy — VCST-5884. Mandatory decline reason — VCST-5885.
- "1 позиции" (ru) — Orders-module label. Layout shift / draft discard on the edit page — pre-existing, layout.
- Real email delivery (SMTP 535 on qa1): evidence is the journal record. Hangfire "old news" drop: unit-tested by the developer only.
- `scope: ORGANIZATION` on `returns`: absent from the deployed schema (story contract ≠ build) — PO call, row 12.

## Binding-fact check against the live build (2026-10-01)

- **Differs from the brief:** after a decision the status dropdown does **not** offer "Cancelled" (Approved → [Approved, Completed, Processing]; PartiallyApproved → [Completed, Processing, PartiallyApproved]; Rejected → [Rejected]); an admin edit to Cancelled on an Approved return answers *"Status 'Approved' cannot be changed to 'Cancelled' by an edit."* Cases pin the rules (forward only, "Cancelled" ≤ once, never "Canceled"), not the lists.
- **Observation, not asserted:** a full-body PUT whose changed line lacks its `returnId` **drops the line** (return left with 0 lines). The Admin SPA sends `returnId`, so RET-AUTH-035 carries it.
