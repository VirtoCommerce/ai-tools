# VCST-5925 — Testing checklist (Artifact B)

Ticket: [BE] [Sales Rep] [Lists] Sharing: multiple recipients per list + targeted-customer access · Story · FULL
Env: vcptcore-qa (`{{BACK_URL}}/graphql`, store `{{STORE_ID}}`) · Build: XCart 3.1037.0-pr-141-fb27 · Cart 3.1011.0-pr-194-8331 · SalesRep 3.1012.0-pr-21-f681 (deployed = PR heads)
Test model: `reports/ba/test-models/VCST-5925-2026-10-01.md` · Prior art: `reports/ba/test-models/VCST-5728-2026-09-29.md` (same backend build)
Actors: rep `@td(SR_REP_PRIMARY)` (role SALES_REP) · target reader `@td(ACME_BUYER)` in `@td(ORG_ACME)` · second served org `@td(ORG_TECHFLOW)` · unserved org `@td(SR_UNSERVED_ORG)`

Column `Covered by` = existing case (run as C1) or checklist probe (P-n, run by the 4a agent).

| # | AC (customfield_10175) | Condition | Covered by | Result |
|---|---|---|---|---|
| 1 | AC1 Adding does not revoke | add org B to a list shared with org A → org A member still reads the list; both orgs in `targets` | WISH-036 (BLOCKED: fixture) → P-1 | PASS (P-1) |
| 2 | AC2 The link is stable | rename-only / message-only save returns the same `sharingSetting.id` | P-2 | PASS |
| 3 | AC2 | AnyoneAnonymous → Private → AnyoneAnonymous restores the same key; Customer → Private → Customer same key | P-2 | PASS |
| 4 | AC2 | where the frontend reads the key is stated (`sharingSetting.id`) | P-2 (introspection + PR doc) | PASS — key = sharingSetting.id; no sharingKey output field |
| 5 | AC3 Every grant comes back | `WishlistType.sharingSettings` plural exists, one entry per grant, each with `sharedWith { name subtitle }` — or the shipped shape (`sharingSetting.targets[]`) is recorded as contract DRIFT | P-3 (introspection) | **DRIFT (needs consumer acceptance, not FAIL)**: shipped `sharingSetting.targets[]` instead of `sharingSettings[].sharedWith`. Type is core-declared (x-cart), which satisfies 1.2; the contract comment itself offers an alternative shape. Ivan decides |
| 6 | AC3 | owner reads `targets[].name` = org name, `subtitle` = "City, Region" (or null when no address) | P-3 | PASS (imageUrl null) |
| 7 | AC4 Targets resolve regardless of assignment | grant to an org the rep no longer serves still returns `name` | P-4 (create-in-case AGENT-TEST org) | PASS |
| 8 | AC4 | org deleted → target keeps `id`, `name` null; list still readable by owner | P-4 | PASS — id kept, name/subtitle null |
| 9 | AC5 Targeted customer can use the grant | target member's `wishlists()` contains the list with `isOwner: false` | WISH-33 | **FAIL** — WISH-33: totalCount 0 for target member |
| 10 | AC5 | target member `wishlist(listId)` returns the list (no "Access denied.") | WISH-039 (BLOCKED: fixture) → P-1 | **FAIL** — Forbidden "Access denied." (P-1, KB-2F64A447) |
| 11 | AC6 Revoking survives losing the assignment | rep unassigned from org X can `removeSharedWithIds: [X]` | P-4 | PASS |
| 12 | AC6 | rep unassigned from org X cannot ADD X back (Access denied) | P-4 | PASS (refused even while still a target) |
| 13 | AC7 Revoking is immediate | removed org's member: absent from `wishlists()`, `sharedWishlist` / `wishlist(listId)` denied | WISH-044 + P-1 | PASS (WISH-044 + P-1) |
| 14 | AC8 One scope at a time | Customer → AnyoneAnonymous: no Customer targets remain, anonymous link read works | WISH-042 (BLOCKED: fixture) → P-5 | PASS (P-5) |
| 15 | AC9 Partial write leaves the rest alone | rename (listName/description only) on a 2-target Customer list → scope, targets, key, message unchanged | P-6 | PASS — but targets order / sharedWithId flips (bug) |
| 16 | AC9 / 2.1 | `addSharedWithIds` without `scope` → nothing written | WISH-043 | PASS on behaviour; WISH-043 HYPOTHESIS line is a test defect |
| 17 | 2.1 | add an already-present id / remove an absent id = no-op; same id in add+remove = rejected; ids case-insensitive | P-7 | PASS |
| 18 | AC10 Legacy singular write is explicit | legacy `sharedWithId` on 1-target list replaces it | WISH-041 | PASS (WISH-041 legacy_single) |
| 19 | AC10 | legacy `sharedWithId` = a NEW org on a 2-target list → rejected, both grants kept (never silently dropped) | P-8 | PASS for a new id; **BUG**: a present non-first id is also refused |
| 20 | AC11 access = viewer's own | owner: `access` Write + `isOwner` true after sharing; target reader: `Read` + `isOwner` false | P-1 | PASS — owner Write/isOwner true, reader Read/false |
| 21 | AC12 Failures are GraphQL errors | every refusal (unserved add, empty set, overlap, >1024 msg, legacy multi, non-target read, Forbidden paths) → HTTP 200 + `errors[]`, never 5xx | P-9 (+ WISH-037/038) | PASS — all HTTP 200 + errors[]; generic INVALID_OPERATION text |
| 22 | PR rule (owner-only targets) | non-owner reader gets `targets: []`, `sharedWithId: null` — no other customers leaked | P-1 | PASS — targets [] / sharedWithId null for every non-owner |
| 23 | Incidental | console/network: no 5xx on any `/graphql` call in the window; App Insights for the window | 5-triage | no 5xx in any call; App Insights NOT queried (az CLI local error) |

**Verdict: FAIL** — AC5 (rows 9, 10). AC3 (row 5) is a DRIFT left to the consumer to accept. New Medium bug: `reports/bugs/open/medium/BUG-VCST-5925-targets-order-unstable-legacy-sharedWithId-refused.md`.

## Re-run 2026-10-02 (delta, same backend build; theme 2.59.0-pr-2476-31b5)

| # | Source | Condition | Result |
|---|---|---|---|
| 24 | contract 1.1 | singular `sharingSetting` kept + deprecated | DRIFT: not deprecated, no plural; `sharedWithId` deprecated "Use targets" |
| 25 | contract 3.4 | pre-existing stray Customer row does not suppress the link grant | NO SUBJECT on stand (0 mixed-scope lists of 420) |
| 26 | contract 3.2 | stop sharing → re-share another org: old target not resurrected | PASS (target rows deleted); `wishlists()` part BLOCKED by VCST-6147 |
| 27 | contract 2.3 | legacy `sharedWithId` handled one way regardless of position | FAIL — medium bug confirmed (write response insertion order, reads newest first) |
| 28 | contract 3.3 | refusals HTTP 200 + errors[] | PASS (56/56 on the wire); App Insights logs them as 500 — telemetry artifact |
| 29 | VCST-6104 | widen → copy does not claim loss of access, states the list becomes public | FAIL — "Some users may lose access." still shown, public exposure not stated |
| 30 | copy | remove an org within Specific customers → rep warned | FAIL — no confirmation, org loses access at once |
| 31 | copy | narrow / → Private copy true | PASS |
| 32 | C1 | WISH-33…044 | same as 2026-10-01 (3 PASS · 4 FAIL · 3 BLOCKED) |

**Verdict unchanged: FAIL** on AC5 (VCST-6147). AC3 is a DRIFT for the consumer to accept.
