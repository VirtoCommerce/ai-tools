# Floors F1–F12, the staleness check, and the depth label

**Floors are deterministic.** Each is computed by `lib/floors.mjs` from the `/ticket-context` bundle; this table is what the
script implements and what a reviewer checks it against. F1's register half (a High/Critical risk) is checked by
`lib/check-strategy.mjs`, because the register is written after the floors run. When a floor fires it puts an
artifact or a level into the strategy that the strategy may add to but never go under. They replace the
EFFORT axis of [`../../knowledge/execution/ticket-routing.md`](../../knowledge/execution/ticket-routing.md)
§5–§5d for this flow: depth comes from these signals and the risk register, never from the
ticket type. Name every floor in the strategy as fired or not, with its signal.

**No floor requires the test model itself.** It runs if and only if a risk has technique `MODEL`; the floors
that need modelling require a `MODEL` risk instead, and F2, F10 and F11 each require **their own** — its
Source carries the token `floor:<id>`, and no risk carries two (test-model redesign M9, M10:
[`../../../docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md`](../../../docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md) §3).

| # | Signal (from the bundle) | Floor |
|---|---|---|
| F1 | any **High/Critical** risk in the register, or the ticket is **P0/P1** (D8). Layer and domain counts do **not** fire it — they raise a risk's L×I | exploratory; a High/Critical risk on a `{HYPOTHESIS}` oracle takes technique `MODEL` (M1) |
| F2 | a Story whose surface purpose is `UNDECLARED` in the domain map §1 ([`../../knowledge/domain/domain-map.md`](../../knowledge/domain/domain-map.md)) | a purpose risk with technique `MODEL` whose Source carries `floor:F2`, + exploratory, whatever else holds |
| F3 | a rendering file in the diff ([`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §1 source 1) — a lower bound, see below | visual lane |
| F4 | a revenue-critical flow is touched (cart, checkout, payment, pricing, orders) | no risk on it below Medium |
| F5 | the bundle's `known.cases_at_risk` is non-empty (`/ticket-context` block 4 ran `regression:select` over the changed files; the strategy adds `npm run tc:scope -- --domain <slug> --observable <each observable the diff or an AC moves>` where path tokens miss — [`../../knowledge/execution/regression-selection.md`](../../knowledge/execution/regression-selection.md)) | coverage triage + a regression run over those cases, **after the staleness check below**. Under vc-test (`--change-map`) the requirement is the list, not the run: every suite at risk, their residual risk and `/qa-regression <suites>` in Out of scope, the row `SKIP` (gate 6h, vc-test U7); fired on doubt, Out of scope names the failed lookup instead of the suites |
| F6 | a `NOT DEPLOYED:` line in the bundle's `blockers[]` — a counted PR whose build the stand does not carry. A `DEPLOYMENT UNKNOWN:` line (no live source for that layer, or not checked) does **not** fire it | **BLOCKED** before any browser opens. `UNKNOWN` is not blocked: the run proceeds and the verdict says "deployment unverified", quoting the line |
| F7 | `Review task` — no ACs | oracles from the diff only; F5 on by default (the strategy's job: the script fires F7 but does not touch F5) |
| F8 | the change IS the design system or the token layer (`ui-kit`, [`../qa-test/ui-kit-class.md`](../qa-test/ui-kit-class.md)) | F3 + token audit; fails closed |
| F9 | any doubt about a floor's signal | the floor applies (every floor except F8, which fails closed; F4 and F6 read only what was read) |
| F10 | the change surface names org context: an `organizationId`-style argument, `xapi:my_organization:*`, an org route or list, `/graphql/sales-rep` or a `sales-rep:*` permission, `loginOnBehalf` / `CanImpersonate` / `/account/impersonate` ([`../../../docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md`](../../../docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md) §5) | an org-context risk with technique `MODEL` whose Source carries `floor:F10` |
| F11 | the PR adds or changes a setting (a settings entry names its key — see below), a hidden-behaviour row answers `yes` for `feature-flags` / `default-values`, or the diff reads one (`ModuleConstants.Settings`, `settingsManager`, `store.settings`, `$cfg.`) (§5a) | a configuration risk with technique `MODEL` whose Source carries `floor:F11`, + the stand's values in Inputs (`npm run store:caps -- --settings` / `--store` for public settings, the admin REST API for the rest — SKILL.md step 2) |
| F12 | vc-test's layer-0 change map (`--change-map`) has a hotspot whose `zone` is not `none` — access, money, data, order state, buyer path. Without a change map it never fires (vc-test spec U47); with one, a map with no hotspots list or a hotspot with no zone fires it (F9). The strategy's `Change map:` line names the map (gate clause 6g) | exploratory, its charter covering those hotspots |

## How `floors.mjs` reads the bundle

- **F9 is built into every floor except F8, F4 and F6:** a floor that cannot be read fires, with a `doubt:`
  signal. That is: no priority (F1), no type (F2, F7 — then F7 requires only F5 on), a domain map that is not
  `PRESENT` (F2), F5 when no case is at risk (a `known.domain` gap or a failed `known.tc:scope` /
  `known.regression:select` lookup), and F3, F10, F11 as the next bullet says. **F4** needs a named flow to apply and **F6** needs
  a `NOT DEPLOYED:` line: both read only what was read, and neither doubts.
- **F3, F10, F11: a positive signal first.** Each is computed from the part of the diff that was read, and when
  it matches, the floor fires with that signal. Only when nothing read matches **and** part of the diff is
  unread does it fire with `doubt:`; "not fired" needs the whole diff read. The diff is (partly) unread on:
  a whole-PR gap on a product PR, a `change` / `change.*` gap except `change.deployed` (even beside a read PR;
  "searched, nothing found" with no product PR is not), or a `pr:<ref>:diff` / `patches` / `files` gap. A
  `pr:<ref>:endpoints` / `settings` / `hidden_behaviour` / `threads` gap is the analyst's field note about a
  diff it read, and never makes it unread.
- **F11 reads settings entries, not their count.** An entry is the analyst's prose, so it fires only when it
  names a setting key — a dotted PascalCase key such as `Return.NotifyOrganizationEmail`, not inside a path and
  not a package id followed by its version — or matches the setting-read pattern; a hidden-behaviour row
  answered `yes` for `feature-flags` / `default-values` fires it too. An entry starting with "No " is no signal
  for the other floors, but F11 still reads the key it names ("No longer defaults to true: Return.SendNotifications");
  a CSS custom property (`--vc-…`) is a theme key, not a setting.
- **A PR closed without merge is not change surface** — no floor reads it, and the gate asks for none of its
  hotspots (check-bundle counts it out the same way).
- **F1's P0/P1 names** come from `project-profile.json` `tracker.p0p1Priorities`; without it, Highest/High/P0/P1/Blocker/Critical.
- **F8 fails closed:** an unread diff never fires it — it needs an affirmative ui-kit path in what was read ([`../../knowledge/execution/ticket-routing.md`](../../knowledge/execution/ticket-routing.md) §5c).
- **F3 is a lower bound.** It fires on a rendering file in the diff
  ([`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §1 source 1) and never on a bare storefront/admin-spa
  layer, because eligibility-as-trigger pinned that axis to true (visual-axis.md §1). The strategy adds the visual
  lane itself when it identifies a changed rendered value.
- **F4 reads names, never prose:** paths, operations, endpoints, settings, components and domains — not claims
  or hotspot risk text. No word boundary (`shopping_cart.vue`, `CartController` count) for
  `cart|checkout|payments?|pric(e|es|ing)|quotes?`; `orders?` needs a non-letter before it or a camelCase join
  (`OrdersModule`, `CustomerOrder`), so `border.scss` is not a revenue flow.

## Staleness check — before F5's regression run (D11)

A regression run over cases the change has already made wrong manufactures FAILs that triage then has to
dismiss. Measured: 9 of 22 `073` rows were repaired after VCST-5883's run; 8 of 46 round-2 cases were
known broken before VCST-5884's round 3. So the selected cases are checked first, cheaply, and a stale one
**never enters the run**:

1. `npm run tc:scope` over the change — rows it disposes `REPAIR` are stale. A `RE-BASE` row is **not**:
   its old assertion is exactly what the change must be run against, so it stays in the run and its
   result is settled at triage ([`../qa-test/coverage-triage.md`](../qa-test/coverage-triage.md) §3a).
2. `npm run suites:executability:check` — rows it marks non-executable.
3. A field, operation, route or selector the diff **renames or removes**, grepped in the selected rows.
4. From round 2 on: the previous round's triage `test-defect` ids.

The stale rows are listed in the strategy's Artifacts row with their reason and handed to
`/qa-test-lifecycle`; the run executes the rest (`/qa-regression <their suite ids> --ids <rest> --no-promote`).

## Depth label (D5) — computed, never chosen

| Label | When |
|---|---|
| `light` | checklist only: no test model, no exploratory, no verifier |
| `deep` | test model **and** exploratory ran, **or** the Critical-risk verifier ran |
| `standard` | anything between |

In the strategy it is computed from the planned `RUN` rows; at close-out, from what ran. The label is for people reading reports. No rule, floor or gate reads it, so it cannot drift from what ran.
It never appears in a risk row; a risk carries **effort** (`low` / `medium` / `high`, D12).
