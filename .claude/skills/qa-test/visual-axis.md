# The visual axis — what runs for which surface, and what its verdict may do

**This file is the only place the `/qa-test` visual axis is specified.** `commands/qa-test.md`,
`skills/qa-test/SKILL.md`, `authoring.md` and `close-out.md` **cite it and never restate it** — the same
single-source-of-truth discipline `ticket-routing.md` holds for flow routing.

It exists because the axis had no owner. Before it, `/qa-test` carried five incidental UI lines across four
files, every one of them *oracle loading for case authoring* — never an execution lane, never a gate, never
a verdict — and the trigger was two different undefined phrases (*"UI/component"*, *"for a UI surface"*) that
nothing checked was ever applied. Measured cost: **1 design report across 25 ticket folders**, and the one
that exists was run by hand. It found 2 High, 1 AMBIGUOUS-escalate, 7 Medium and 4 Low — a WCAG 1.4.1 token
collision, a 1.63:1 focus ring, four design-specified surfaces absent from code — none of which any other
axis in the pipeline can see.

---

## 1. `visual_surface` — the token

Derived at `1b` item 2c. The **shared derivation contract** — derived-never-asked-never-defaulted,
`surface_source[]` always recorded, `false` recorded with its sources, lane-not-effort — is stated once in
[`axes.md`](axes.md) §2 and is **not** repeated here. What is specific to this axis:

| # | Source | Yields `true` when |
|---|---|---|
| 1 | **The PR diff** — `1a`'s extension map | any `.vue` · `.scss` · `.css` · `.html` · a module `**/Scripts/**` blade template · an icon-set or design-token file |
| 2 | **The derived `layer`** | `storefront` or `admin-spa` (both render to a human); `cross-layer` when either is a member |
| 3 | **The target suites' manifest tags** | a `layer: frontend` suite, or tags `storefront` / `admin-spa` |

`api` · `module` · `platform` alone yield `false`. **`unresolved` ⇒ `true`** — fails open, because a
wrongly-skipped visual pass leaves no trace anywhere while a wrongly-run one costs one agent. Values:
`true` · `false` · `unresolved`. Records `visual.surface_source[]`.

---


## 2. The table — surface → axes → executor

| Ticket surface | Axes that run | Executor | Target resolved from |
|---|---|---|---|
| **Storefront page or flow** | a11y · design-system · `vs. DESIGN` | `ui-ux-expert` | the route(s) the ticket changes |
| **Storefront component** | a11y · design-system · `vs. DESIGN` | `ui-ux-expert` | the component, **dual** Storybook + storefront (the two surfaces catch different bug classes) |
| **Admin SPA blade** | a11y · design-system | `ui-ux-expert` | the blade under change; `vs. DESIGN` only if the design project covers admin |
| **`api` / `module` / `platform` only** | none | — | — the lane does not dispatch |

The three axes, and where each is specified:

| Axis | What it asserts | Specification |
|---|---|---|
| **a11y** | WCAG 2.2 AA + `BL-A11Y-001..004` (all **P1**) — keyboard operability, accessible naming, contrast, axe-clean. `BL-UI-006` touch targets rides along, since 2.5.8 measures it anyway | `skills/qa-accessibility/` |
| **design-system** | live resolved custom properties vs the generated token set; no hardcoded colour/spacing literals; sized-control token + aspect equality | `skills/qa-design/design-system-consistency.md` |
| **`vs. DESIGN`** | declared tokens · control geometry · icon name→glyph parity, diffed against the Claude Design project **named by the ticket's own Prototype link** (no global default — `DESIGN_SYSTEM_PROJECT_ID` was removed 2026-09-03; a ticket with no design link ⇒ `SKIPPED`) | `skills/qa-design/claude-design-verification.md` |

### Dispatch the agent — do not invoke the command

`/qa-design` is `disable-model-invocation: true`, so `/qa-test` may **not** auto-trigger it — the same
constraint that makes 5f/5h *point* at `/ba-analyze` rather than run it. That costs nothing here:
`/qa-design` is itself only an orchestration shell that delegates execution to `ui-ux-expert`. Step 4
dispatches that agent directly, exactly as it dispatches `qa-frontend-expert` / `qa-backend-expert`, and the
brief cites the `/qa-design` **skill** as the methodology. `/qa-accessibility` carries no
`disable-model-invocation` flag and may be invoked directly.

The brief carries: the resolved target · **the design project id resolved from the ticket's Prototype link,
plus the artboard its `file=` param names** (there is no `DESIGN_SYSTEM_PROJECT_ID` to inherit — removed
2026-09-03; if the ticket carries no design link, the brief says so and the axis returns `SKIPPED`) · the
`BL-A11Y-*` / `BL-UI-*` invariant **text** (not just the IDs) · the screenshot path · the verdict vocabulary
below.

**Two things the brief MUST also carry, each of which cost a real run when it did not.**

1. **The `vs. DESIGN` expectations as DATA — a subagent cannot read the spec itself.**
   `.claude/rules/mcp-browsers.md` §*A subagent does not inherit `DesignSync`*: the tool is unavailable
   inside a dispatched agent, so **the axis is structurally unrunnable there** and can only ever return
   `SKIPPED`. Dispatching it and reading that `SKIPPED` as normal is how an axis reports clean forever
   while never running once. So either the **orchestrator reads the design project itself and passes the
   declared tokens / control geometry / icon mapping into the brief as data**, or the axis runs in the
   main session. `unresolved` is then *unknown*, never zero.
2. **No credential variable NAMES on this lane — and the brief must NAME the auth path.** `--secrets` is a
   `@playwright/mcp` flag; Chrome DevTools MCP has no equivalent, so typing `TEST_USER_PASSWORD` submits
   that literal string and the sign-in is refused. Measured: VCST-5733's visual axis was briefed exactly
   that way and all three axes came back `INCONCLUSIVE`/`SKIPPED`, costing a whole agent turn. There are
   **three** paths and the brief picks one explicitly — an agent left to infer its own is what produced
   that loss: the **pre-signed persistent profile** (`--userDataDir`, signed in once by hand) for a
   **role-gated or data-bearing** target; **minting an account through the UI** (`/sign-up`,
   `uniqueEmail("AGENT-TEST")`, a password the agent generates) for a **role-agnostic** one — public
   pages, the design system, WCAG/axe, tokens, geometry; or **dispatch to a Playwright lane**. Minting a
   role-gated target is not a fallback but a wrong answer: the surface renders its **empty state**, which
   **reads as a pass**. Whichever is chosen, the brief never carries a credential, a variable name, or a
   workaround for a permission denial
   (`.claude/rules/mcp-browsers.md` §*Chrome DevTools MCP has no `--secrets`* — conditions and cleanup
   obligations live there).

---

## 3. Verdict handling — layout blocks, a11y files separately, spec drift advises

Precedence is `BL-UI / BL-A11Y invariant > design spec > UX heuristic`, unchanged from what `/qa-design`
already declares. A spec match never rescues an invariant FAIL.

**Precedence and BLOCKING are two different questions, and this table answers the second.** An a11y
invariant still outranks the spec and the heuristic — a design that specifies a 1.63:1 focus ring is still
wrong. What changed is what a confirmed a11y FAIL *does to the story*: on a functional / feature / E2E
ticket it files its own ticket rather than failing that one, because accessibility is a cross-cutting
property of the surface and the defect is usually pre-existing on the component, inherited by whichever
story next edits that file. Full rule, the carve-out, and why a non-blocking finding must keep its real
severity: [`triage.md`](triage.md) §7a.

| Outcome | Lands in | May fail the ticket? |
|---|---|---|
| `BL-UI-*` **FAIL** (layout, overflow, alignment, CLS) | `summary.json.visual.invariant_failures[]` | **Yes** — an ordinary finding: triaged at 5a, severity-graded, filed under the existing 5d floor |
| `BL-A11Y-*` **FAIL**, ticket is functional / feature / E2E | `visual.a11y_findings[]` | **No** — filed as its **own standalone ticket** at its **real severity**, named in the report, never blocking ([`triage.md`](triage.md) §7a) |
| `BL-A11Y-*` **FAIL**, ticket is *about* accessibility | `visual.invariant_failures[]` | **Yes** — the carve-out: an a11y/WCAG remediation ticket, ACs naming an accessibility outcome, or a `/qa-accessibility` run. The test is the ticket's own ACs, never the finding's severity |
| `vs. DESIGN` **DRIFT** / **MISSING** | `visual.advisory[]` | **No** — recorded and reported, never blocking |
| **UNSPEC** | `visual.advisory[]` | No — a design project is rarely exhaustive; failing "not in the spec" turns the axis into ignored noise |
| **KNOWN_DIVERGENCE** | `visual.advisory[]` | No — the spec itself declares it unshipped. Also never a clean PASS |
| **AMBIGUOUS** | escalate in the report | The spec contradicts an invariant or a WCAG criterion → **escalate, never obey the spec** |
| **SKIPPED** | `visual.axes.*.skipped_reason` | No — but **never report it as a PASS.** Silence reads as CONFIRMED |
| **INCONCLUSIVE** — axe did not load (CSP) | `visual.axes.a11y.skipped_reason` | No — and **never clean.** A blocked axe run is an absent measurement, not a passing one |

Two arrays rather than one severity field, because that is what makes the blocking rule auditable from the
artifact instead of only from this prose.

**`SKIPPED` is the common case, not an error.** `DesignSync` needs `/design-login`, which requires an
interactive terminal — so the `vs. DESIGN` axis is unavailable in Claude Code on the web and in CI. It
records `SKIPPED` + the reason there and the other two axes carry on. Same discipline as `tokens:check`
exiting `2` on an unreachable source rather than passing. A non-zero `unresolved` count from the extractor
**downgrades an otherwise-clean design axis to WARN**, and the count is printed — a guessed expectation
fails every correct implementation.

**Three things this axis structurally cannot conclude**, each of which must be reported as manual rather
than as a PASS:

- **Screen-reader output** — there is no NVDA/JAWS/VoiceOver hookup in the toolkit.
- **Five of the six WCAG 2.2 additions** (2.4.11 · 2.5.7 · 3.2.6 · 3.3.7 · 3.3.8) — axe covers only 2.5.8,
  and nascently. A clean axe run says nothing about the other five.
- **Non-gated themes** — a11y conclusions hold for **Coffee + Red** only; `purple-pink` / `watermelon` are
  known-unsupported and are visual-only.

---

## 4. Browser budget

`ui-ux-expert` runs on **Chrome DevTools MCP** — a fourth lane beside chrome/firefox/edge, and one the
`/qa-test` pool did not previously list. The **max-3-concurrent** cap still binds across every lane.

When the checklist agents + regression lanes + this lane exceed 3, run in this order and **state the order
chosen**: checklist track → visual lane → regression. The ticket verdict is the priority, and the visual
lane feeds it (5c) while regression feeds the release gate (5e).

Never schedule the visual lane on `playwright-firefox`: this pass is click- and hover-driven, and
`@playwright/mcp` + firefox cannot click this storefront or the Admin SPA.

---

## 5. What this axis does NOT own

**BL-UI-001..005** — CLS, spacing grid, alignment, content boundary, state-induced shift — are *not* a
scheduled axis here. They keep their existing owner: loaded at Step 2 for authoring, asserted through the
measurable tags `[SHIFT] [TOUCH] [SPACING] [ALIGN] [OVERFLOW] [CLS]`, and executed by suite `048c` in
regression. Adding a second executor would put two owners on one invariant set with no rule for which wins.

**Always on FULL. On FAST the lane is opt-in — `--visual` (or `--axes`)** ([`axes.md`](axes.md) §4).
`visual_surface` still *derives* on FAST and is recorded with its sources; what the flag controls is
whether the lane **runs**. It never re-routes the ticket: a FAST run with `--visual` still authors no
cases, writes no Test Model and runs no verifier — it gains one agent and the checklist rows in §6.

**The argument for FAST-by-default is real, and it is why the flag exists.** A `.scss`-only PR, an icon
migration or a P2 restyle is by construction *single-layer, single-domain, obvious surface, P2* — so **the
change class most likely to break the UI is exactly the class FAST routes**, and a one-agent functional
checklist cannot see a contrast failure, a token collision or a control that drifted from the design.

**What it lacked was evidence, and this axis is where that shows most.** Unlike the other two it costs a
whole **agent on a browser lane**, and it was made mandatory on the cheap path on the strength of the
argument alone. In the 28 recorded runs it has produced a `visual` block **once**. It is also the axis
whose third sub-axis is structurally unrunnable in a subagent (§2), so a mandatory lane was partly
reporting `SKIPPED` by construction. Revisit at 5+ runs.

**`critical-ui-scope.md` is a scope definition, not a gate.** It is 197/197 `GAP` since its covering suite
was removed on 2026-07-25. Use it to resolve *which* invariants apply to the component under audit; it
cannot supply coverage it does not have.

---

## 6. The durable record

On **FAST the Artifact-B checklist is the run's only durable record**, so every visual condition appears in
it as a row with a verdict, exactly like every other condition. **An uncovered visual condition is listed,
never omitted** — dropping the row is what makes a checklist look complete when it is not.

The pass also writes its own per-ticket `design-report.md` **into the run's own ticket folder**
(`reports/tickets/{SPRINT}/<ticket-key>/design-report.md`) — `.claude/rules/reports.md` category 6, which
already permits a ticket-scoped `/qa-design` run; 30–60 lines, cap 120. Note this is deliberately the
**ticket-folder** path, not the `reports/tickets/{SPRINT}/qa-design/<slug>-<date>/` tree a standalone
`/qa-design` invocation uses: dispatched from `/qa-test` the audit belongs to the ticket's evidence, beside
`summary.json` and the checklist. `reports/tickets/Sprint26-17/VCST-5346/design-report.md` is the precedent.

Its machine half lands in `summary.json.visual`. A `null` `visual` block means the step never ran — a gap,
not a clean result.

**Scope note.** `critical-ui-scope.md`'s matrix is not only `GAP`-filled, it is **stale**: suite `048c`
exists with 30 `LAYOUT-*` cases (registered runner-native in `config/test-suites.json`) whose cells the
matrix still marks `GAP`, and four component rows are flagged as drifted/unenforced. Use it to resolve
*which invariants apply*; do not read its coverage column as fact, and never auto-edit it.
