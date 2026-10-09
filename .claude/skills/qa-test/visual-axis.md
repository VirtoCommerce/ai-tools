# The visual axis — what runs for which surface, and what its verdict may do

**This file is the only place the visual axis is specified — for `/qa-test` and for `/qa-test-fast`.**
`commands/qa-test.md`, `commands/qa-test-fast.md`, `skills/qa-test/SKILL.md`, `skills/qa-test-fast/`,
`authoring.md` and `close-out.md` **cite it and never restate it** — the same
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
| 2 | **The derived `layer`** | **ELIGIBILITY, not a trigger.** `storefront` / `admin-spa` / a `cross-layer` including either makes the ticket *eligible*; it does **not** by itself yield `true`. See the pinning note below |
| 3 | **The target suites' manifest tags** | a `layer: frontend` suite, or tags `storefront` / `admin-spa` |

`api` · `module` · `platform` yield `false`. **`unresolved` ⇒ `true`** — fails open, because a
wrongly-skipped visual pass leaves no trace anywhere while a wrongly-run one costs one agent. Values:
`true` · `false` · `unresolved`. Records `visual.surface_source[]`.

**Why source 2 is eligibility and not a trigger — it was PINNING the axis true** (corrected 2026-09-04).
The three sources are OR'd, so a bare `layer: storefront` made **every** storefront ticket `true` no
matter what its diff held — and the storefront is the dominant surface here. Source 3 does not discriminate
either, since the target suites of a storefront ticket are `layer: frontend` essentially by definition. So
two of the three sources were decorative and the axis was **effectively pinned `true`** — the exact defect
[`axes.md`](axes.md) §3 diagnoses for `data_surface` (*"an axis that dispatches an opus agent whenever it
is unsure is not subtracting"*), against a measured yield of **one block in 28 runs**.

**So `true` needs eligibility PLUS one positive rendered-surface signal:**

| Signal | Example |
|---|---|
| a rendering file in the diff (source 1) | `.vue` · `.scss` · `.css` · `.html` · blade · icon set · design tokens |
| a changed rendered VALUE | a label, heading, currency/date format, empty-state copy, a status chip |
| changed DOM structure, order or TIMING | rows added/removed, a list re-ordered, an optimistic update, a spinner/skeleton window — layout stability (`BL-UI-001..005`) is a function of DOM churn, not of file extension |
| a new or changed interactive affordance | a control, dialog, drawer, focus target, keyboard path |

**An eligible ticket with NO such signal is `false`** — a pure-logic change with no rendered consequence
(a computation, a log line, an internal rename). **Doubt is still `true`**: the fail-open direction is
unchanged, and "is there a rendered consequence?" is answered `true` whenever it cannot be answered.

Worked example, VCST-5738 (2026-09-04): the diff was **`.ts`-only** — no `.vue`/`.scss`/`.css` — so under
the old rule it was `true` purely because `layer: storefront`, which taught nothing. Under this rule it is
**still `true`, but for a reason that is checkable**: it changes *when* cart rows leave the DOM (an
optimistic removal plus a 1000 ms debounce), which is row-churn signal 3. A reader can now contradict that;
before, they could only observe that the ticket was on the storefront.

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

### Dispatch the agent — the agent invokes the `qa-design` skill

There are two `qa-design` files and they behave differently. The **command**
([`commands/qa-design.md`](../../commands/qa-design.md)) is `disable-model-invocation: true`, so no pipeline
may run it — the same constraint that makes 5-status/5-docs *point* at `/ba-analyze` rather than run it. That
costs nothing: the command only parses a target and dispatches `ui-ux-expert`. The **skill**
([`skills/qa-design/SKILL.md`](../qa-design/SKILL.md)) carries no such flag and **is** the methodology.

So `/qa-test` Step 4v and `/qa-test-fast` Stage 2 dispatch `ui-ux-expert` directly, exactly as they dispatch
`qa-frontend-expert` / `qa-backend-expert`, and **the brief's first instruction is: *invoke the Skill tool
with `skill: "qa-design"` before any browser call*.** The agent loads it into **its own** context, never the
orchestrator's — the skill is ~30K chars, and loaded inline it is re-paid by every later step of the run and
used by none of them. The agent then reads the per-axis files in §2's table as each axis needs them, and
**its return opens with `qa-design skill: loaded`** — a return without that line did not apply the
methodology and is re-dispatched once. `/qa-accessibility` carries no `disable-model-invocation` flag
either; the agent may invoke it the same way for the a11y axis.

The brief carries: the `Skill qa-design` instruction above · the resolved target · **the design project id resolved from the ticket's Prototype link,
plus the artboard its `file=` param names** (there is no `DESIGN_SYSTEM_PROJECT_ID` to inherit — removed
2026-09-03; if the ticket carries no design link, the brief says so and the axis returns `SKIPPED`) · the
`BL-A11Y-*` / `BL-UI-*` invariant **text** (not just the IDs) · the screenshot path · the verdict vocabulary
below.

**Two things the brief MUST also carry, each of which cost a real run when it did not.**

1. **The `vs. DESIGN` expectations, as a spec JSON path.** At the top of Step 4, before the dispatch,
   the orchestrator resolves the source from the ticket's Prototype link — the local copy at
   `.design-source/<uuid>/`, else an artifact link via `Artifact` `read` — runs
   **`npm run design:extract`** (`--only icons,geometry,stroke,changes` for an artifact page, whose `:root` is its
   own chrome), and passes the output path in the brief. **Neither the orchestrator nor the agent calls
   `DesignSync`**: its own description restricts it to the user-started `/design-sync` skill, and on
   VCST-5957 (2026-10-01) that left the axis to an eyeballed screenshot comparison. A run's own extract
   makes `unresolved` machine-counted; relayed by hand it is *unknown*, never zero. Ladder and the
   artifact-chrome trap: `.claude/skills/qa-design/claude-design-verification.md` §1.
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
   (`.claude/knowledge/execution/browser-lanes.md` §*Chrome DevTools MCP has no `--secrets`* — conditions and cleanup
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
| `BL-UI-*` **FAIL** (layout, overflow, alignment, CLS) | `summary.json.visual.invariant_failures[]` | **Yes** — an ordinary finding: triaged at 5-triage, severity-graded, filed under the existing 5-file floor |
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

**`SKIPPED` is a legitimate outcome, not an error.** No local copy of the ticket's project and no usable
artifact (`design:extract` exit `2`) ⇒ the `vs. DESIGN` axis records `SKIPPED` + the reason — naming the
folder to fill, `.design-source/<uuid>/` — and the other two axes carry on. Same discipline as `tokens:check`
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
lane feeds it (5-verdict) while regression feeds the release gate (5-report).

**`/qa-test-fast` Stage 2** already holds up to three lanes (two checklist runners + exploratory). When
fewer than three are dispatched (`--layer`, a lane with no items, `--no-explore`), the visual lane goes in
the **same message**; otherwise it is dispatched **the moment the first lane returns**, and `verdict.md`
states the order. Never a fourth concurrent browser agent.

Never schedule the visual lane on `playwright-firefox`: this pass is click- and hover-driven, and
any of the three lanes will do — firefox clicks here again since 2026-09-08 (`.claude/rules/agents.md`).

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

**On `/qa-test-fast` the lane is ON whenever `visual_surface: true`**, derived per §1 from Wave 1's PR diff
(source B) and the checklist's lanes; `--no-visual` drops it. Either way the outcome is recorded in
`summary.json.visual` with its `surface_source[]` — a dropped or `false` lane is listed in `verdict.md`
under *Not tested, and why*, never silent. Unlike `/qa-test` FAST, this flow already pays for a model and
a multi-lane Stage 2, so the one-agent argument above does not apply to it.

**The argument for FAST-by-default is real, and it is why the flag exists.** A `.scss`-only PR, an icon
migration or a P2 restyle is by construction *single-layer, single-domain, obvious surface, P2* — so **the
change class most likely to break the UI is exactly the class FAST routes**, and a one-agent functional
checklist cannot see a contrast failure, a token collision or a control that drifted from the design.

**What it lacked was evidence, and this axis is where that shows most.** Unlike the other two it costs a
whole **agent on a browser lane**, and it was made mandatory on the cheap path on the strength of the
argument alone. In the 28 recorded runs it has produced a `visual` block **once**. It is also the axis
whose third sub-axis is structurally unrunnable in a subagent (§2), so a mandatory lane was partly
reporting `SKIPPED` by construction. Revisit at 5+ runs.

**One slice of that argument now HAS its case, and was promoted on 2026-09-11: the `ui-kit` shape class**
([`ticket-routing.md`](../../knowledge/execution/ticket-routing.md) §5c). The argument two paragraphs up is
*general* — "a `.scss`-only PR is the class most likely to break the UI" — and general is exactly what left
it a prediction. The shape class is the narrow, derivable subset where it is not a prediction: when the
change **is** the design system, the rendered surface is the deliverable, so a run without this lane has not
tested the ticket at all. There the lane defaults ON, on both paths, needing no flag. **Everywhere else the
flag stands and the revisit rule is unchanged** — promoting one classifier is what that rule asked for;
promoting the axis outright is the thing it warns against.

**`critical-ui-scope.md` is a scope definition, not a gate.** It is 197/197 `GAP` since its covering suite
was removed on 2026-07-25. Use it to resolve *which* invariants apply to the component under audit; it
cannot supply coverage it does not have.

---

## 6. The durable record

On **FAST the Artifact-B checklist is the run's only durable record**, so every visual condition appears in
it as a row with a verdict, exactly like every other condition. **An uncovered visual condition is listed,
never omitted** — dropping the row is what makes a checklist look complete when it is not.

The pass also writes its own per-ticket `design-report.md` **into the run's own ticket folder**
(`reports/tickets/{SPRINT}/<ticket-key>/<env>/design-report.md`) — `.claude/rules/reports.md` category 6, which
already permits a ticket-scoped `/qa-design` run; 30–60 lines, cap 120. Note this is deliberately the
**ticket-folder** path, not the `reports/tickets/{SPRINT}/qa-design/<slug>-<date>/` tree a standalone
`/qa-design` invocation uses: dispatched from `/qa-test` the audit belongs to the ticket's evidence, beside
`summary.json` and the checklist.

Its machine half lands in `summary.json.visual`. A `null` `visual` block means the step never ran — a gap,
not a clean result.

**Scope note.** `critical-ui-scope.md`'s matrix is not only `GAP`-filled, it is **stale**: suite `048c`
exists with 30 `LAYOUT-*` cases (registered runner-native in `config/test-suites.json`) whose cells the
matrix still marks `GAP`, and four component rows are flagged as drifted/unenforced. Use it to resolve
*which invariants apply*; do not read its coverage column as fact, and never auto-edit it.
