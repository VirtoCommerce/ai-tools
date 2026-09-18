# Agent Knowledge — the two trees, and which one you are in

Cross-agent reference files, grouped by **what an agent reaches for the file to answer**. Since the
2026-09-17 migration they live in **two places**, and telling them apart is the first thing to know:

| Written | Lives in | What makes it untrue |
|---|---|---|
| `.claude/knowledge/…` | THIS repository | a change in **how we run** — our gates, our lanes, our tracker discipline |
| `knowledge/…` (no prefix) | the KNOWLEDGE BASE, `VirtoCommerce/vc-knowledge`, fetched once per machine by **`npm run kb -- sync`** into `~/.claude/vc-knowledge` | a change in **the platform** |

A `knowledge/…` path is therefore **cited, never linked** — a markdown link to it cannot resolve
from a checkout, and 92 links that tried were repaired on 2026-09-17. Write it as a backticked path,
or reach it through the tool: `npm run kb -- show BL-CART-003`, `npm run bl:extract -- --domain cart`.

`ls` each folder for its files — a transcribed inventory here is a second copy that goes stale, and
the one this file used to carry named four folders that no longer exist in it.

## In this repository

| Folder | Answers |
|--------|---------|
| `agents/` | Per-team framework (QA / BA / developers `shared-instructions.md`) + the agents README |
| `api/` | The GraphQL **test-case runner grammar** — how our CSV cases drive GraphQL (the SCHEMA itself is in the base) |
| `execution/` | Running the suite and the pipeline: preflight, tags, lanes, promotion, selection, data resolution, routing, ticket status, tracker ops, reports policy, quality gates, when a change needs a unit test |
| `diagnostics/` | The self-diagnostics oracle: per-skill expected phases/gates + the S0–S3 rubric |

## In the knowledge base (`npm run kb -- sync`)

| Folder | Answers |
|--------|---------|
| `knowledge/oracles/` | "Is this behaviour correct? Has it failed before?" — `business-logic.md` (`BL-*`), `e-commerce-edge-cases-library.md` (`ECL-*`), `vc-bug-catalog.md` (`VC-*`), `critical-ui-scope.md` |
| `knowledge/domain/` | Domain maps — actors, value chain, surface inventory per layer, plus `release-ledger.md` |
| `knowledge/api/` | The REST + GraphQL surface: auth, platform patterns, `graphql-schema.md`, order-creation matrix |
| `knowledge/automation/` | Driving the live UI as a real user: selectors, config flags, browser quirks |
| `knowledge/architecture/` | Repo anatomy for the developers team (auto-fix) |
| `knowledge/ba/` | BA documentation craft (`virto-doc-style.md`) |
| `knowledge/execution/` | Platform-side execution facts: debugging signals, performance thresholds |

## Conventions

- **Reference, don't inline.** Agents cite an ID (`BL-AUTH-005`, `ECL-13.3`, `VC-CART-*`) or a path,
  never paste the body into a report. See [`.claude/rules/reports.md`](../rules/reports.md).
- **A cited id opens: `npm run kb -- show BL-CART-003` · `npm run kb -- show ECL-13.3` · `npm run kb -- show VC-CART-001`.** A `BL-*`
  resolves to its RECORD (evidence, confirmations, disputable); the other two to the SECTION of the
  page that carries them, printed as what it is — asserted, with nothing to dispute. Pages say which
  ids are theirs with `citedAs:` in their front matter.
- **`oracles/` is the correctness backbone.** Exploratory and review flows use it as the
  "Familiar Problems" oracle and to seed Bad Neighborhood tours.
- **`business-logic.md` is GENERATED** from one record per rule in the base's normative plane
  (`npm run bl:render`, byte-compared by `bl:render:check`). **Never hand-edit the page** — edit the
  rule's record (`npm run kb -- show <BL-id>` prints its path) and re-render. Procedure, including adding and
  retiring a rule: [`bl-audit-criteria.md`](../skills/qa-review-oracles/bl-audit-criteria.md) §4.
- **`graphql-schema.md` is generated** from live introspection via
  `scripts/graphql/refresh-graphql-schema.mjs` — verify field names there before authoring GraphQL.
- **`release-ledger.md` is generated** from the monthly community release digests via
  `scripts/maintenance/refresh-release-ledger.mjs` (`npm run releases:refresh`). Read it — not
  VirtoOZ — for "what shipped / which version introduced X"; VirtoOZ's release corpus stops at
  Platform 3.917.1 while production is past 3.1050. Two rules travel with it: it **declares itself
  non-exhaustive**, so a miss is never proof a feature does not exist; and it says what is
  **released upstream**, never what is **deployed on the env under test** (that is a live
  `/api/platform/modules` probe — see `.claude/templates/agent-dispatch.md` § Build Verification).
  It carries a `stale_after_days: 45` contract that `scripts/unit/release-ledger.test.mjs` enforces.
- **A generated page's generator writes into the base**, so the commit lands in `vc-knowledge` and
  this repo's `git diff` stays empty. Say so wherever a report would otherwise imply nothing changed.
- **Cross-file links use relative paths** — but only WITHIN one tree. Between trees, cite the path.
