# Feature Domain Map — Expected Test Coverage

Used by `/qa-coverage-gap` Cycle 1 to answer the one question the manifest cannot: **is the coverage that
exists actually adequate, and where is it known to be thin?**

## What this file does NOT contain — and why

**No suite IDs. No case counts. No domain lists.** All three live in `config/test-suites.json` and are
derived at run time:

```bash
# domains and how many suites each has
node -e "const m=require('./config/test-suites.json');const d={};m.suites.forEach(s=>d[s.domain]=(d[s.domain]||0)+1);console.log(d)"
# every suite in one domain
node -e "const m=require('./config/test-suites.json');console.log(m.suites.filter(s=>s.domain==='purchase-flow').map(s=>s.id+' '+s.name).join('\n'))"
npm run suites:lint              # suite + case totals, corpus-wide unique-ID check
npm run tc:scope -- --domain <d> # which existing rows a change puts at risk
```

This file used to carry a hand-maintained domain→suite-ID inventory. Measured 2026-09-19, that
inventory was wrong in every direction at once: it stopped at suite `082` while the manifest had grown
past `100`; it omitted three whole manifest domains (`sales-rep`, `observability`, `background-jobs`, of
which `sales-rep` alone holds nine suites); it described the `050*` GraphQL split as eleven sub-suites
when the manifest carried nineteen; and it recorded "Product comparison — **Partial**, no dedicated
compare page suite" when a dedicated compare suite existed. That is the
[`.claude/rules/test-data.md`](../../rules/test-data.md) GOLDEN RULE playing out exactly as written — a
transcribed constant is correct once and then fails silently, in the direction that costs the reader
rather than the author. A gap analysis routed off it under-covers the newest domains, which are the
ones most likely to actually have gaps.

**So a coverage judgment below is only ever a claim about depth, never about location.** Resolve the
suite from the manifest, then read the judgment.

## Coverage thresholds

| Priority | Minimum Cases | Must Include |
|----------|---------------|--------------|
| P0 | 5+ per feature | Happy path + top 3 error paths + 1 integration |
| P1 | 3+ per feature | Happy path + top error path |
| P2 | 1+ per feature | Happy path |

## The domain map is the primary source

For any domain in scope, [`knowledge/domain/<slug>.md`](../../knowledge/domain/) is the normative answer
to *what this thing is and where its surfaces are* — actors, value chain, surface inventory per layer,
**where the layers disagree**, and the current shape of QA coverage. Build or refresh one with
`/qa-domain-map <slug>`; check freshness with `npm run domain:check`.

**A domain with a map: read the map, not this file.** This file is the fallback for domains that do not
have one yet, and the place to record a depth judgment that has not yet earned a map section.

## Known coverage gaps

Each row is a judgment about depth, carried forward because it is not derivable from the manifest.
**Re-verify before acting** — a row here is as old as its `Verified` date, and a resolved gap that is
still listed sends a generation run at coverage that already exists.

| Gap | Domain | Risk | Verified | Note |
|-----|--------|------|----------|------|
| Subscription / recurring orders | purchase-flow | P2 | 2026-03 | Not active in the current QA environment — confirm the module is enabled before scoring this a gap |
| Storefront notification dropdown | communication | P2 | 2026-03 | Admin notification templates + triggers are covered; the storefront-side UI is not |
| Back-in-stock alerts (storefront) | communication | P2 | 2026-03 | Depends on push message + inventory integration being wired in the target env |
| Admin impersonation depth | auth-security | P2 | 2026-03 | Basic impersonation covered; no cross-company or stop-impersonation path. A dedicated impersonation suite has since been added — **re-verify before generating** |
| Quick order by SKU (isolated) | customer-b2b | P3 | 2026-03 | Covered implicitly inside bulk order; low risk to leave implicit |
| Declined-card recovery | purchase-flow | P2 | 2026-03 | Basic error paths exist per provider; no full recover-and-retry flow |
| Delegated purchasing / approval | customer-b2b | P2 | 2026-03 | B2B checkout covers some approval; no dedicated delegation flow |
| Invoice / PDF download | purchase-flow | P2 | 2026-03 | Order detail is covered; the PDF download itself is not isolated |
| Monthly spend widget | customer-b2b | P3 | 2026-03 | Dashboard page covered; the spend widget is not asserted on its own |
| Real-time mid-session price change | purchase-flow | P2 | 2026-03 | Price validation exists; the mid-session change scenario is limited |
| Reorder flow depth | purchase-flow | P2 | 2026-03 | Reorder covered for the simple case only |

**Rows retired as resolved** (do not re-file): cart persistence, cart validation blocking checkout, guest
checkout, B2B checkout, billing ≠ shipping, checkout field validation, quotes/RFQ, org switching and org
admin, member roles and blocking, shared lists, account dashboard, returns/RMA, order status tracking,
Page Builder block library and core designer features, and the dedicated product-compare surface.

## Domain prefix conventions

Case-ID prefixes are per-suite, not per-domain — take the prefix from the rows already in the target
suite (`CART-`, `CHK-`, `QUOTE-`, `BULK-`, `DASH-`, `CFG-`, …). Allocate the numeric block with
`npm run tc:alloc`; IDs are unique **corpus-wide**, so never number off the highest ID in one suite.
See [`coverage-gap-methodology.md`](coverage-gap-methodology.md) § ID Assignment.

## Layer routing

`/qa-test-cases-generator --layer <name>` and `/qa-coverage-gap` map a gap to suites by combining
`manifestDomain` + `layer` + `concern` — the resolution rule is in [`SKILL.md`](SKILL.md)
§ "Manifest-Domain Routing". The `050*` Backend/graphql sub-suites follow the **runner-native**
authoring contract in
[`graphql-test-cases-runner.md`](../../knowledge/api/graphql-test-cases-runner.md); they are not
browser-mode suites, and which sub-suites exist is a manifest query, never a list.
