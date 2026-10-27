# Floors F1–F12, the staleness check, and the depth label

**Floors are deterministic.** Each is computed by `lib/floors.mjs` from the `/vc-test:ticket-context` bundle; this table is what the
script implements and what a reviewer checks it against. F1's register half (a High/Critical risk) is checked by
`lib/check-strategy.mjs`, because the register is written after the floors run. When a floor fires it puts an
artifact or a level into the strategy that the strategy may add to but never go under. They are this flow's
only depth axis: [`lib/route.mjs`](../../lib/route.mjs) and the profile's `test.routing` pick only the job (test,
verify-fix, hotfix-check); depth comes from these signals and the risk register, never from the ticket type. Name every floor in the strategy as fired or not, with its signal.

**No floor requires the test model itself.** It runs if and only if a risk has technique `MODEL`; the floors
that need modelling require a `MODEL` risk instead, and F2, F10 and F11 each require **their own** — its
Source carries the token `floor:<id>`, and no risk carries two (test-model redesign M9, M10:
[`2026-10-09-qa-test-model-redesign.md`](../../../../docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md) §3).

| # | Signal (from the bundle) | Floor |
|---|---|---|
| F1 | any **High/Critical** risk in the register, or the ticket is **P0/P1** (D8). Layer and domain counts do **not** fire it — they raise a risk's L×I | exploratory; a High/Critical risk on a `{HYPOTHESIS}` oracle takes technique `MODEL` (M1) |
| F2 | a Story whose surface purpose is `UNDECLARED` in the domain map §1 ([`domain-map.md`](../../knowledge/domain-map.md)) | a purpose risk with technique `MODEL` whose Source carries `floor:F2`, + exploratory, whatever else holds |
| F3 | a rendering file in the diff ([`visual-axis.md`](../qa-design/visual-axis.md) §1 source 1) — a lower bound, see below | visual lane |
| F4 | a revenue-critical flow is touched (cart, checkout, payment, pricing, orders) | no risk on it below Medium |
| F5 | the bundle's `known.cases_at_risk` is non-empty (`/vc-test:ticket-context` block 4 ran `regression:select` over the changed files; the strategy adds `npm run tc:scope -- --domain <slug> --observable <each observable the diff or an AC moves>` where path tokens miss (in this repository: `/qa-test-fast`'s `.claude/knowledge/execution/regression-selection.md`)) | coverage triage + a regression run over those cases, **after the staleness check below**. Under vc-test (`--change-map`) the requirement is the list, not the run: every suite at risk, their residual risk and `/qa-regression <suites>` in Out of scope, the row `SKIP` (gate 6h, vc-test U7); fired on doubt, Out of scope names the failed lookup instead of the suites |
| F6 | a `NOT DEPLOYED:` line in the bundle's `blockers[]` — a counted PR whose build the stand does not carry. A `DEPLOYMENT UNKNOWN:` line (no live source for that layer, or not checked) does **not** fire it | **BLOCKED** before any browser opens. `UNKNOWN` is not blocked: the run proceeds and the verdict says "deployment unverified", quoting the line |
| F7 | `Review task` — no ACs | oracles from the diff only; F5 on by default (the strategy's job: the script fires F7 but does not touch F5) |
| F8 | the change IS the design system or the token layer (`ui-kit`, [`ui-kit-class.md`](../../knowledge/ui-kit-class.md)) | F3 + token audit + a risk whose technique names `PIXEL` when the change modifies an existing ui-kit file (§VISUAL); fails closed |
| F9 | any doubt about a floor's signal | the floor applies (every floor except F8, which fails closed; F4 and F6 read only what was read) |
| F10 | the change surface names org context: an `organizationId`-style argument, `xapi:my_organization:*`, an org route or list, `/graphql/sales-rep` or a `sales-rep:*` permission, `loginOnBehalf` / `CanImpersonate` / `/account/impersonate` ([`2026-10-09-qa-test-model-redesign.md`](../../../../docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md) §5) | an org-context risk with technique `MODEL` whose Source carries `floor:F10` |
| F11 | the PR adds or changes a setting (a settings entry names its key — see below), a hidden-behaviour row answers `yes` for `feature-flags` / `default-values`, or the diff reads one (`ModuleConstants.Settings`, `settingsManager`, `store.settings`, `$cfg.`) (§5a) | a configuration risk with technique `MODEL` whose Source carries `floor:F11`, + the stand's values in Inputs (`npm run store:caps -- --settings` / `--store` for public settings, the admin REST API for the rest — SKILL.md step 2) |
| F12 | vc-test's layer-0 change map (`--change-map`) has a hotspot whose `zone` is not `none` — access, money, data, order state, buyer path. Without a change map it never fires (vc-test spec U47); with one, a map with no hotspots list or a hotspot with no zone fires it (F9). The strategy's `Change map:` line names the map (gate clause 6g) | exploratory, its charter covering those hotspots |

## Unavailable

**Unavailable is not doubt** (vc-test spec §5.2). Only with `--capabilities <capabilities.json>` on `floors.mjs` and
`check-strategy.mjs` (vc-test passes it; without it nothing below applies):

- **F5 skipped.** F5 would fire only on doubt because the install declares no regression corpus (the bundle's
  `known.regression:select` / `known.tc:scope` gap says `not-available-in-install`, or `scripts.regression-select` is
  false), and no case is at risk ⇒ `skipped: "regression-select"`, not fired. A lookup that ran and failed stays doubt
  and fires it; a case at risk fires it.
- **A row this install cannot run.** A fired floor stays fired, and every other requirement holds. `unavailable[]`
  lists each row it needs that the install lacks a tool for: `Exploratory` needs a browser lane (`mcp:playwright-*`),
  `Visual lane` needs `mcp:chrome-devtools`, `Coverage triage + regression` needs `regression-select`. That row may
  read `SKIP — not available in this install: <capability>` instead of `RUN`. **Only a probe says a tool is
  missing:** a lane is missing when `capabilities.json` lists the MCP servers it was given (`mcp`) and none of them
  is one (a browser lane: a name containing `playwright`; the Visual lane: `chrome-devtools`); a script, when
  `scripts.<name>` is `false`. A
  capability the file does not state — no `--mcp`, `{}` — is not missing. A file that is not an object exits 2. F8's `PIXEL` risk (§VISUAL) needs
  `capabilities.json` `pixel`: an engine and a front checkout; without them the risk stays, its Lane reads that
  `SKIP`, and Out of scope names `PIXEL`.
- **Never silent.** A skipped floor goes on the Floors line as `skipped: F5 (not available in this install:
  regression-select)`, and Out of scope names it with its residual risk. An unavailable row is named in Out of scope
  the same way. The gate refuses either one unnamed (clause 6s).
- **F2 and F6 are not affected.** F2 reads the domain map `/vc-test:ticket-context` found, in the project knowledge
  store first. F6 reads the bundle's `NOT DEPLOYED:` lines. **Without `deploy:pr` none is produced yet:** no step
  writes the `deployed.json` expect list `/vc-test:ticket-context` would read (its source, the versions each PR
  builds, is not resolved without `deploy:pr`), so every counted PR is `DEPLOYMENT UNKNOWN` and F6 does not fire —
  the run proceeds as "deployment unverified". The producer is deferred to P2.

## VISUAL

A `VISUAL` risk names the instrument that decides it — the whole rule is here; ai-tools' `visual-axis.md` §2a is its
source, not a step: `PIXEL` (did anything change that should
not have — a change that declares no visual effect or moves shared UI), `DESIGN` (matches its reference), `PROBE`
(layout holds on hard data), `CONTENT` (the rendered text is right).

- **One form:** `VISUAL:<instrument>`, several comma-separated with no `VISUAL` repeated — `VISUAL:DESIGN,PIXEL`.
  Case does not matter. The gate reads only the technique cell's leading token list (`FLOW, DT, VISUAL:PIXEL`), so
  prose after it ("FLOW (not VISUAL)") is no token. A bare `VISUAL` — beside a named one too, or in backticks — a name that is
  not an instrument (`VISUAL:DESIGN+PIXEL`), and an instrument after anything but a comma (`VISUAL:DESIGN PIXEL`)
  fail clause 4.
- **F8 takes `PIXEL` only for an existing surface** (clause 6): a ui-kit file some counted PR modifies. A file every
  PR that lists it adds (the bundle's `added`, from the files API) is a new surface: `PIXEL` has no base build for
  it, so F8 asks only for the visual lane and the token audit. A PR without `added` reads as modifying.

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
- **F8 fails closed:** an unread diff never fires it — it needs an affirmative ui-kit path in what was read ([`lib/floors.mjs`](lib/floors.mjs) `UI_KIT`).
- **F3 is a lower bound.** It fires on a rendering file in the diff
  ([`visual-axis.md`](../qa-design/visual-axis.md) §1 source 1) and never on a bare storefront/admin-spa
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
   result is settled at triage (in this repository: `/qa-test-fast`'s `.claude/skills/qa-test/coverage-triage.md` §3a).
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

## Clause 11 — every strategy; clauses 12–13 — vc-test runs

The script half of SKILL.md §Gate clauses 11–13. **Clause 11 runs on every strategy** — `/qa-test`, `/qa-test-fast` and vc-test alike (U57 and U58 are general rules). It reads the `Project risks:` line; an item is a `P<n>` that starts the line or follows a `·` or a sentence end (`.` or `;`), so a `P95 2s` inside an item is not an item. 12 and 13 run only with a change map (a vc-test run). Each error names its item or hotspot, so a fix is aimed.

### 11a — a project risk is not a product risk (U58)

A project risk is about the run's world: the stand, its settings, the data, the tooling. The script flags an item that carries one of three signs of product behaviour:

- a code anchor in **product source** — `path.ext:line` for `cs ts tsx vue js mjs json graphql cshtml html`, except a path under `test-data/`, `config/`, `scripts/`, `reports/`, `regression/`, `ci/`, `.claude/` or a `.env*` file (those are the project's own world);
- a hotspot id `H-n` (an `S-n` is a scenario id, clause 13, which a project risk may name);
- held state stated as a fact: `in memory`, `per instance`/`replica`/`pod`, or a limit, limiter, counter, lockout, throttle, rate limit or session that `is`/`are` held, kept, stored, reset, shared, scoped or cached — U58's own example, `P9 the wrong-code limit is in memory per instance → accepted`, is caught.

Any of them makes the item a **product risk** — its own `R-n` row with a technique, an oracle and a check — and an `accepted` project line lets it escape unchecked.

**11a's semantic half is the verifier's (U64).** A regex catches only the explicit forms: "cached" alone is also how a stand's CDN is described, so the script does not flag it. The verifier reads every project-risk item and refuses one that states how the product behaves in any other words — what a setting does, what the code keeps, counts, resets or enforces, how a limit or a session behaves — however the stand constrains testing it. A project item may say the stand's setting is **unknown** (it is then checked at entry, 11b); it may not say what the product does with it.

### 11b — the AC/doc value stays the oracle (U57)

An item that names a risk (`R-n`) and says it only *records* what it observed, or *instead of asserting*, `no PASS/FAIL`, `never FAIL`, `not asserted`, lowers how that risk is decided. A value the AC or the docs state stays the oracle: an unknown stand setting is **checked at entry** (a probe or a settings read), never a reason to turn the assertion into a recording. If the value cannot be known, the risk is `{HYPOTHESIS}` and goes to the PO (method rules), not to a quiet downgrade.

### 12 — held state needs a SCALE risk (U59)

A hotspot whose `risk` text matches `STATE_HOTSPOT` (`limit/limiter`, `attempt(s)`, `counter`, `throttle`, `rate limit`, `cache`, `lockout`, `in-memory`, `session state`) holds state — what it holds can differ per instance, per restart or per replica. It is covered when either (a) a risk with technique `SCALE` cites its id or its `path:line` (the hotspot `source` without the leading `repo:`) in What or Source, or (b) an Out of scope line names it and says `single instance` — with the check that established it. `SCALE` is a technique token like `EXPLORE`: the case exercises the state across more than one instance, restart or session, or states why that cannot happen. The match is on the hotspot's text, so a hotspot that only mentions e.g. `lockout` in passing is also asked for — answer it with the (b) line, not by dropping the id.

### 13 — every scenario cites a risk, every MODEL risk has a scenario (B18)

A vc-test run lists its scenarios in `### Scenarios` (columns `S | Class | What it does | Bug it hunts | Why likely | Score | Proof | Writes`, after `### Approach per risk`). The list is generated before the risks exist, so a scenario cites its risk **inside the `Why likely` cell** (`… · R2`) and the strategy writer adds that `R-n`. Four checks, each error naming its scenario or risk:

- **(a)** a scenario whose `Why likely` cites no `R-n` ⇒ `13: S-2 cites no risk`; one citing an `R-n` the Risks table does not register ⇒ `13: S-2 cites R9, which is not a registered risk`.
- **(0)** a round with no `### Scenarios` heading ⇒ `13: no Scenarios table — a vc-test strategy is the scenario list (U62)`.
- **(b)** a risk with technique `MODEL` that no scenario cites ⇒ `13: R1 (MODEL) has no scenario`.
- **(c)** `Class` is a number 1–6, U60's six classes in its order; anything else ⇒ `13: S-1 Class "7" is not 1–6`.

**6e under vc-test.** With a change map, 6e no longer requires `Test model` RUN for a MODEL risk — the scenarios carry it, so write `SKIP — scenarios cover the MODEL risks`; check (b) is the replacement. `Test model` RUN with no MODEL risk is still refused. Without a change map, 6e and clause 13 behave as before (no `### Scenarios` heading is read or required).
