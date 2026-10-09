# Floors F1–F9, the staleness check, and the depth label

**Floors are deterministic.** Each reads a signal from the context bundle and, when it fires, puts an
artifact or a level into the strategy that the strategy may add to but never go under. They replace the
EFFORT axis of [`../../knowledge/execution/ticket-routing.md`](../../knowledge/execution/ticket-routing.md)
§5–§5d for the prototype flow: depth comes from these signals and the risk register, never from the
ticket type. Name every floor in the strategy as fired or not, with its signal.

| # | Signal (from the bundle) | Floor |
|---|---|---|
| F1 | any **High/Critical** risk in the register, or the ticket is **P0/P1** (D8). Layer and domain counts do **not** fire it — they raise a risk's L×I | test model + exploratory |
| F2 | a Story whose surface purpose is `UNDECLARED` in the domain map §1 ([`../../knowledge/domain/domain-map.md`](../../knowledge/domain/domain-map.md)) | test model + exploratory, whatever else holds |
| F3 | `visual_surface: true` ([`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §1) | visual lane |
| F4 | a revenue-critical flow is touched (cart, checkout, payment, pricing, orders) | no risk on it below Medium |
| F5 | the diff touches a surface existing suite cases cover (`npm run regression:select -- --path <changed files>`) | coverage triage + a regression run over those cases, **after the staleness check below** |
| F6 | a PR is not deployed on the stand under test (the deploy manifest or `/api/platform/modules` does not carry the PR's build), or the deployment is `UNKNOWN` | **BLOCKED** before any browser opens; `UNKNOWN` is written into the verdict as "deployment unverified" |
| F7 | `Review task` — no ACs | oracles from the diff only; F5 on by default |
| F8 | the change IS the design system or the token layer (`ui-kit`, [`../qa-test/ui-kit-class.md`](../qa-test/ui-kit-class.md)) | F3 + token audit; fails closed |
| F9 | any doubt about a floor's signal | the floor applies |

## Staleness check — before F5's regression run (D11)

A regression run over cases the change has already made wrong manufactures FAILs that triage then has to
dismiss. Measured: 9 of 22 `073` rows were repaired after VCST-5883's run; 8 of 46 round-2 cases were
known broken before VCST-5884's round 3. So the selected cases are checked first, cheaply, and a stale one
**never enters the run**:

1. `npm run tc:scope` over the change — rows it disposes `REPAIR` or `RE-BASE` are stale
   ([`../../knowledge/execution/regression-selection.md`](../../knowledge/execution/regression-selection.md)
   §Existing-Coverage Triage).
2. `npm run suites:executability:check` — rows it marks non-executable.
3. A field, operation, route or selector the diff **renames or removes**, grepped in the selected rows.
4. From round 2 on: the previous round's triage `test-defect` ids.

The stale rows are listed in the strategy's Artifacts row with their reason and handed to
`/qa-test-lifecycle`; the run executes the rest (`/qa-regression … --ids <rest> --no-promote`).

## Depth label (D5) — computed, never chosen

| Label | When |
|---|---|
| `light` | checklist only: no test model, no exploratory, no verifier |
| `deep` | test model **and** exploratory ran, **or** the Critical-risk verifier ran |
| `standard` | anything between |

The label is for people reading reports. No rule, floor or gate reads it, so it cannot drift from what ran.
It never appears in a risk row; a risk carries **effort** (`low` / `medium` / `high`, D12).
