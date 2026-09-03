# ECL proposals — 2026-09-03

Not-confirmed items from `ECL-AUDIT-2026-09-03`. **Nothing here has been applied to the oracle.**
Value column is `business · product → label`, derived at decision time via `npm run oracles:rank --axis=ecl`
and never stored in the library.

## 1. `ECL-14.3` row 1 — cart isolation loss — **CONTRADICTORY**

| Value | Verdict | Why not applied |
|---|---|---|
| `high · high → high` (via `BL-B2B-001` `P0-revenue`, 124 citing cases) | CONTRADICTORY | Source and live **agree with each other and both disagree with the row** |

The row records a standing Medium-frequency bug: switching organization leaves the previous org's cart
persisting or bleeding into the new one. Live, across two passes in both directions, a cart established
under one organization did not appear under another. Source explains why: the organization-switch path
re-mints an organization-scoped token and then broadcasts an app-wide reload, which is specifically a
full state reset.

**Human decision needed.** Two defensible readings, and the audit cannot pick between them:

1. **Historically real, since fixed** → RETIRE the row (destructive; human-gated by rule).
2. **Still a regression risk** → rewrite the Description to scope it as a guard rather than a standing
   pattern, and drop `Frequency` from Medium.

**Do not invent a new `Status` value for it.** A `[REGRESSION-RISK]`-style third value was suggested
during triangulation and is refused here: the vocabulary is closed (`[OBSERVED]` / `[THEORETICAL]`) and
`oracle-significance.ts` scores off it, so a new value would silently break the value model for every
section.

## 2. `ECL-14.3` row 2 — org context missing after login — **UNGROUNDED**

| Value | Verdict | Missing axis |
|---|---|---|
| `high · high → high` | UNGROUNDED | Live could not isolate the claim |

The row claims `me.organization` is null on the *first* GraphQL request after login. Source shows the
storefront reads a persisted organization selection **before** the initial token request, so a returning
user already has the organization baked into the first minted token — which would prevent the glitch for
everyone except a genuinely first-ever login. The live session could not be isolated from a residual
prior selection, so the case the row is actually about was never exercised.

**Re-test ask:** a never-switched account with browser storage cleared, plus a source read of the
server-side default-organization selection when a token is minted with no explicit organization.

## 3. `ECL-14.3` row 4 — multi-org ship-to conflict — **UNGROUNDED**

| Value | Verdict | Missing axis |
|---|---|---|
| `high · high → high` | UNGROUNDED | Live test not discriminating; source not read |

No leaked address was observed, but the two organizations available held **asymmetric** address data (one
had none), which cannot distinguish "no leak" from "nothing to leak". Per the second rule of
`.claude/rules/test-data.md`, equal-or-absent values on both sides of the distinction under test make the
question undecidable — so this is a fixture gap, not evidence.

**Re-test ask:** two organizations each carrying at least one **distinct** saved address, plus a read of
the address-query organization-scoping code.

## 4. New pattern candidate — irreconcilable same-entity counts — **HELD (undeclared)**

| Value | Gate |
|---|---|
| `unknown · low → undeclared` | **HELD — never promotes** |

Discovered by `SBTM-salesrep-customer-orders-2026-09-03`: two adjacent surfaces render
**differently-scoped** counts of the same entity under **identical labels**, leaving them irreconcilable
to the reader while both figures are individually correct.

It is held on the **business** axis, not on evidence. An ECL pattern prices itself by naming the `BL-*`
invariant it endangers, and no invariant covers this: nothing is violated — both scopes are correct by
design — and the nearest structural analogue (`BL-BOPIS-003`, a label must match reality) is about a
*wrong* label, not two correct-but-ambiguous ones. Under the value rule, `unknown` business value never
promotes; declaring what a violation costs is the price of entry.

**Unblocking it requires a BL invariant first** — see `bl-proposals-2026-09-03.md` §2. That is the
correct order: the ECL pattern cannot be priced until the invariant it endangers exists.

## Coverage gaps (not proposals — for `/qa-test-lifecycle` Phase 3)

`ecl:lint` reports 3 sections no case cites (`ECLC-002`, unchanged by this run): `ECL-5.2` Geographic &
Temporal Anomalies, `ECL-5.4` Return & Refund Abuse, `ECL-13.2` Subscription & Recurring Billing. These
are authoring gaps, not oracle defects, and are **not** RETIRE candidates — absence of citations is not
positive evidence a pattern is dead.
