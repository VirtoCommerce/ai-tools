---
description: "Discover scenarios the regression suite doesn't cover. Discovery-first exploratory session — every run must surface a net-new scenario."
argument-hint: "[sprint|sprint:XX-YY|checkout|catalog|B2B|mobile|new]"
disable-model-invocation: true
---

# /qa-exploratory — Scenario Discovery Session

**Primary purpose: find scenarios our existing coverage misses.** The CSV suites in [`regression/suites/`](../../regression/suites) cover what we know to test; this command exists to discover what we *don't* know to test. Confirming known coverage works is valuable but is **re-validation**, not exploration — log it accordingly.

Every session must end with at least one **net-new scenario** (not in any regression suite, not in [vc-bug-catalog.md](../knowledge/oracles/vc-bug-catalog.md), not predictable from the charter alone). If no net-new scenario emerges, the session is `[VAL]` re-validation, not `[EXP]` exploration. See [`scenario-discovery.md`](../skills/qa-sbtm/scenario-discovery.md) for the discovery techniques.

## Usage
```
/qa-exploratory checkout          # Explore the checkout flow
/qa-exploratory catalog           # Explore catalog & product pages
/qa-exploratory B2B               # Explore B2B features (quotes, org management)
/qa-exploratory mobile            # Explore at mobile viewport (375px)
/qa-exploratory new               # Explore recently changed areas (from git diff)
/qa-exploratory sprint            # Run the current sprint plan's §5.3 charters (auto-picks the most recent plan)
/qa-exploratory sprint:26-16      # Pin to a specific sprint plan's charters
/qa-exploratory sprint --charter EXP-02   # Run one charter from that set
```

---

## Execution

### Step 0a — `sprint` mode: read the charters, don't invent them

Only for `sprint` / `sprint:XX-YY`. The charter set was already derived at planning time — this step
loads it and skips the ad-hoc charter authoring in "Exploration Charter" below.

1. Resolve the plan: `sprint` → the most recent `vc/shared/docs/Sprint plans/sprint-*-summary.json`;
   `sprint:XX-YY` → that exact file. No summary.json ⇒ **STOP** and tell the user to run
   `/qa-test-plan XX-YY` first — never improvise a charter set that the plan does not contain.
2. Read `exploratoryCharters[]`. Each entry carries `mission`, `candidateScenarios[]`, `technique`,
   `lane`, `signals[]`. That IS the charter — do not re-derive it, do not widen it.
3. `--charter EXP-NN` runs one; otherwise run them **in series**, ≤5, 30 min each, and STOP after the
   last one. Never run two charters concurrently — the pool is 3 browser lanes and the regression
   suites need them.
4. `lane` is `playwright-chrome` or `playwright-edge`. **Never firefox** — exploration is click-driven
   and `@playwright/mcp` + firefox cannot click this storefront or the Admin SPA
   (`.claude/rules/agents.md`, confirmed 6×). If both chrome lanes are busy, QUEUE.
5. Still run Steps 0.1–0.5 below (env health, build versions, 24 h duplicate check, docs, coverage map)
   — the charter says *what* to explore, pre-flight establishes *against what build*.

Rationale + the C1–C4 / D1–D3 derivation: `.claude/skills/qa-sbtm/sprint-charter-selection.md`.

### Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user.
2. **Build & version verification** — fetch deployed versions per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa` by default; use the branch matching `TEST_ENV` for other envs)
   - Record platform version and theme version — include in the session report header
3. **Duplicate check** — scan `reports/exploratory/` for an `SBTM-*` session on the same domain in the last 24 hours. If found, warn user and show previous findings.
4. **Docs query (VirtoOZ MCP)** — via the `/vc-docs` skill, query the target domain against the topic-scoped VirtoOZ tools (`StorefrontUserGuide` for storefront flows, `StorefrontDeveloperGuide` / `FrontendSourceCode` for behavior, `B2BExperts` for B2B) — e.g. `"checkout workflow"`, `"B2B organizations members"`, `"catalog product properties"`. Extract feature inventory to guide exploration — ensure the agent covers all documented features, not just obvious ones. Context7 (`/virtocommerce/vc-docs`) is a fallback only if VirtoOZ is unavailable.
5. **Coverage map** — for the target domain, identify what's *already covered*:
   - Open the CSV suite(s) for the domain (via [module-suite-map.md](../knowledge/execution/module-suite-map.md) → [`regression/suites/`](../../regression/suites)) — list the scenarios already tested
   - Open [vc-bug-catalog.md](../knowledge/oracles/vc-bug-catalog.md) and read the section(s) for the domain (VC-CHECKOUT-*, VC-CART-*, VC-B2B-*, etc.) — list the known failure patterns
   - These two lists are what NOT to spend session time re-validating. The discovery target is everything *else*.

5a. **Oracles — and they are read in two OPPOSITE directions.** Step 5 reads its two sources to
   *subtract*; these two are read to *supply*. Conflating the four is how a session either
   re-validates known ground or calls a real violation a curiosity.

   | Source | Direction | What it gives the session |
   |---|---|---|
   | CSV suites | subtract | already asserted — don't re-validate |
   | [`vc-bug-catalog.md`](../knowledge/oracles/vc-bug-catalog.md) | subtract | already discovered here — don't re-discover |
   | [`e-commerce-edge-cases-library.md`](../knowledge/oracles/e-commerce-edge-cases-library.md) | **supply** | boundary/failure shapes to go hunting for — **`[THEORETICAL]` first** |
   | [`business-logic.md`](../knowledge/oracles/business-logic.md) | **supply** | the oracle of expected behaviour: what makes an observation a *bug* rather than a *"huh"* |

   - **ECL — `[THEORETICAL]` is the session's half of the library.** Its 175 `[OBSERVED]` patterns are
     confirmed on this platform, so they belong to `/qa-checklist` and the suites; its 36
     `[THEORETICAL]` ones are research-based and never yet seen *here* — which is precisely a
     discovery target. Cross the domain's `[THEORETICAL]` sections with the coverage map from Step 5:
     what no suite asserts and the bug catalog has never recorded is the highest-value list this
     pre-flight can produce. Name 1–2 of them among the charter's candidate scenarios.
   - **BL — the reason to pursue a "huh" for more than 60 seconds.** Read the domain's `BL-*`
     invariants so a deviation is recognised on the spot. Without them a session reports "the total
     looked odd" and moves on; with them it reports "this violates BL-PRICE-001", which is a filed bug.
   - **Neither oracle bounds the session.** They supply candidates and a correctness reference — a
     scenario outside both is still exactly what `/qa-exploratory` exists to find, and is the more
     valuable finding (see the ECL-gap rule in §Output).
   - Never invent or guess an ID; cite what resolves (`npm run ecl:lint` / `bl:lint`). Neither oracle
     is edited from a session — a missing pattern is a `/qa-review-oracles` proposal (§Output).
6. **Pick a discovery technique** — open [scenario-discovery.md](../skills/qa-sbtm/scenario-discovery.md) and select ONE technique appropriate to the situation:
   - New feature in this sprint → User-flow edge enumeration + Surprise-seeking time
   - Two features integrated recently → Feature-pair matrix at their seam (Boundary-of-features hunting)
   - Production keeps escaping bugs → Production-error mining (Azure App Insights)
   - Regression suite feels stale → Coverage-diff hunting (suite vs codebase via GitHub MCP)
   - No specific risk → Surprise-seeking + Hostile interview
7. **Heuristic filters (optional)** — load the heuristic references as *filters* (familiar-problems oracles), not checklists:
   - [adversarial-heuristics.md](../skills/qa-sbtm/adversarial-heuristics.md) — Whittaker tours, FAILURE, HICCUPPS-F
   - [personas.md](../skills/qa-sbtm/personas.md) — Pick a persona that would see scenarios the charter author wouldn't
   - [modern-web-attack-surface.md](../skills/qa-sbtm/modern-web-attack-surface.md) — Cache/multi-tab/browser-feature probes
   - The agent uses these to spot familiar problems faster — NOT as a sequential checklist.

Delegate to **qa-testing-expert** (Task tool, `subagent_type: qa-testing-expert`) with the target area + the chosen discovery technique.

### Exploration Charter

For each session, the agent should:

1. **Define a discovery charter** — Frame the mission around discovery, not coverage:
   - Bad: "Explore checkout to find bugs"
   - Good: "Discover scenarios in checkout that aren't covered by suites 011–013 and aren't in VC-CHECKOUT-* / VC-CART-* catalog entries"
   - Name 2–3 *candidate scenarios* up front (from coverage-diff, feature-pair matrix, user-flow edges, or a `[THEORETICAL]` ECL section from Step 5a). These are the discovery targets — they may be wrong, but they force a hypothesis.
   - Record the charter's `Edge-Case Refs` (the `ECL-<n>.<m>` sections it hunts) and `BL Refs` (the invariants it will judge observations against) — the same two fields the ready-made charters in [`charter-library.md`](../skills/qa-sbtm/charter-library.md) carry.
2. **Time-box** — 30 minutes (5 min setup + 20 min explore + 5 min document):
   - First 10 min: **Surprise-seeking time** — no goal, just look for "huh, that's weird" (per scenario-discovery.md § 4)
   - Next 10 min: Pursue the most surprising observation OR the chosen discovery technique
3. **Apply heuristics as filters**, not as a sequential checklist:
   - CRISP / SFDPOT — quality-attribute oracles
   - Adversarial heuristics (Whittaker tours, FAILURE, HICCUPPS-F) — familiar-problem oracles
   - Persona lens — surfaces scenarios a different user type would hit
4. **Monitor continuously:**
   - Console errors after every action
   - Network failures (4xx, 5xx responses)
   - Visual glitches (overflow, alignment, z-index)
   - Accessibility issues (keyboard navigation, focus management)
5. **Pursue every "huh"** — every unexpected observation gets at least 60 seconds of follow-up before being dismissed. The dismissed ones are the missed bugs.
6. **Document findings** in `reports/exploratory/` with:
   - Discovery charter and duration
   - Discovery technique used (which one from scenario-discovery.md)
   - **Net-new scenarios discovered** (mandatory, see Output section below)
   - Bugs found (with evidence)
   - Risk areas identified
   - Questions for the team
   - Charter-from-gap list (next-session candidates)

### Area-Specific Focus

| Area | Key Things to Explore | Recommended persona | Recommended adversarial tour |
|------|----------------------|---------------------|------------------------------|
| `checkout` | Guest vs registered, address validation, shipping options, payment errors, back-button behavior | Impatient Buyer | Saboteur + Obsessive-Compulsive |
| `catalog` | Filters + sort combinations, pagination, empty categories, long product names, variant selection | Tourist | Garbage Collector + Bad Neighborhood |
| `B2B` | Multi-org switching, quote lifecycle, approval workflow, role permissions, bulk order | B2B Procurement Officer | Scenario Tour + Soap Opera |
| `mobile` | Touch targets, scroll behavior, hamburger menu, form usability, viewport overflow | Impatient Buyer | Supermodel + Couch Potato |
| `new` | Read `git log --oneline -20` to find recent changes, focus exploration on affected areas | (depends on area) | Bad Neighborhood + Saboteur |

Personas live in `skills/qa-sbtm/personas.md`. Tours live in `skills/qa-sbtm/adversarial-heuristics.md`.

---

## Output

Write a session report to `reports/exploratory/SBTM-{charter}-YYYY-MM-DD.md`:

```markdown
# Exploratory Session: [Area]
**Date:** YYYY-MM-DD
**Duration:** ~X minutes
**Platform:** {PlatformVersion}
**Theme:** {theme version}
**Session type:** [EXP] | [VAL] | [EXP+VAL]
**Discovery technique:** [which one from scenario-discovery.md]
**Charter:** Discover scenarios in [area] that aren't covered by [suites] and aren't in [VC-* catalog entries]
**Edge-Case Refs:** ECL-<n>.<m>, … (hunted) | **BL Refs:** BL-XXX-NNN, … (judged against)

## Net-New Scenarios Discovered (mandatory for [EXP])
| # | Scenario | Why uncovered | What we found | Oracle ref | Fate | Suggested next charter |
|---|----------|---------------|---------------|-----------|------|------------------------|
| 1 | [1-line description] | [no suite + no catalog entry] | [observation / bug / question] | ECL-<n>.<m> \| BL-XXX-NNN \| **NONE** | PROMOTE → suite NNN \| DECLINE: [reason] | Explore X to discover Y |

## Oracle Feedback (the session's other deliverable)
| Kind | Entry | Evidence | Route |
|---|---|---|---|
| `[THEORETICAL]` → `[OBSERVED]` | ECL-<n>.<m> | [what reproduced it here] | `/qa-review-oracles ecl` |
| Candidate new pattern | (none — `Oracle ref: NONE` above) | [scenario + evidence] | `/qa-review-oracles ecl` |
| Candidate new invariant | (behaviour no `BL-*` covers) | [observation] | `/qa-review-oracles bl` |
| Contradicted | BL-XXX-NNN / ECL-<n>.<m> | [live behaviour disagrees with the entry] | `/qa-review-oracles` — **never** edit the oracle from a session |

> If this table is empty, the session is `[VAL]` not `[EXP]`. Update the Session type field.
> **Every row needs a `Fate`.** `PROMOTE` = author it as a `Draft` case via `/qa-test-cases-generator`
> into `regression/suites/<layer>/<module>/`, and carry it into the next plan's §5.2 as a `GAP-NN`
> tagged `from: EXP-NN`. `DECLINE` = one line of why (not reproducible / by-design / needs a fixture
> we don't have / out of scope). An unexplained blank means the finding was discovered once and lost —
> which is the whole failure mode this table exists to prevent (`sprint-charter-selection.md` §6).
>
> **`Oracle ref` is not a grading of the finding — `NONE` is the best cell in that column.** A scenario
> the ECL already describes is a hunt that landed; one no `ECL-*` and no `BL-*` covers is a pattern the
> library does not know, i.e. the thing this command exists to find. Either way the cell must be filled:
> a ref makes the finding traceable when `/qa-review-oracles` next audits that entry, and a `NONE` is
> what promotes the scenario into the Oracle Feedback table below.
>
> **The ECL asks for this and nothing was doing it.** Its own §Using This Library maintenance rules say
> to *"add new patterns as you discover them"* and *"mark patterns `[OBSERVED]` if confirmed on your
> platform"* — an exploratory session is the only surface that produces either. So a session has **two**
> deliverables: `Draft` cases (via `Fate`) and oracle proposals (via Oracle Feedback). Both are
> proposals — `ba-system-analyzer` is the sole writer of both oracles, and IDs are a citation contract
> the suites point at, so a session never edits, renumbers, or adds an entry directly.

## Bugs Found
| # | Severity | Title | Evidence | Net-new? |
|---|----------|-------|----------|----------|
| 1 | Medium | [description] | [screenshot path] | Yes/No (existing scenario or new?) |

## Risk Areas
- [Areas that seem fragile or undertested]

## Observations
- [Interesting behaviors, UX friction, performance notes]

## Questions
- [Things that need clarification from dev/PM]

## Charter-from-Gap (next-session candidates)
- [Each gap discovered = a 1-line mission for next session, per scenario-discovery.md § 9]
```

---

## Rules
- **Discovery first**: every session must end with at least one net-new scenario in the "Net-New Scenarios Discovered" table, OR be re-labeled `[VAL]` re-validation. No bugs found is acceptable; no net-new-scenario consideration is not.
- The VC bug catalog + existing CSV suites are read FIRST in pre-flight to identify what NOT to spend time on (the discovery target is everything else)
- **The ECL and `business-logic.md` are read in the opposite direction — to supply, not subtract** (Step 5a). `[THEORETICAL]` ECL sections are candidate scenarios (`[OBSERVED]` ones belong to `/qa-checklist` and the suites); `BL-*` invariants are what turn an odd observation into a filed bug instead of a shrug
- **Every net-new scenario carries an `Oracle ref` — and `NONE` is a valid, valuable answer**, which routes it to the Oracle Feedback table as a candidate ECL pattern
- **Oracle changes are proposals, never edits.** A confirmed `[THEORETICAL]`, a missing pattern, a contradicted invariant → `/qa-review-oracles`; `ba-system-analyzer` is the sole writer, and no session renumbers or invents an ID
- Heuristic packs (CRISP/SFDPOT, Whittaker tours, FAILURE, HICCUPPS-F) are filters, not checklists — they help spot familiar problems faster but are not the primary work
- Follow `skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- **Lane: `playwright-chrome` or `playwright-edge` — never `playwright-firefox`.** An exploratory session is click-driven by definition, and `@playwright/mcp` + firefox resolves the element then times out on Playwright's actionability gate for this storefront and the Admin SPA (`.claude/rules/agents.md`, confirmed 6×). A firefox placement costs the entire 30-minute session, not a degraded one — if both chromium lanes are busy, QUEUE. **This deliberately overrides `qa-testing-expert`'s default `playwright-firefox` assignment in `.claude/rules/agents.md`** — that file's own hard rule ("never schedule a click-driven suite on firefox") outranks its per-agent default table, and an exploratory session is click-driven by construction. Dispatch `qa-testing-expert` (or `qa-frontend`/`qa-backend-expert` per the charter's `owner`) onto the charter's `lane`.
- **Capture-back is mandatory**: every net-new scenario carries a `Fate` (PROMOTE to a `Draft` case, or DECLINE with a reason). A session whose findings reach no runner buys a one-off verdict and no regression protection
- In `sprint` mode the charter comes from the plan's §5.3 (`exploratoryCharters[]`) — run it as written, in series, ≤5; never widen the mission or add a domain the plan did not chart
- Monitor console and network throughout
- Capture screenshots for every bug found
- Don't try to fix bugs — just document them
- If a Critical bug is found, stop and report immediately — escalate via `/qa-bug`
- Always query VirtoOZ MCP (via the `/vc-docs` skill) in Step 0 to build a feature inventory for the target domain (Context7 is fallback only)

## Related
- [scenario-discovery.md](../skills/qa-sbtm/scenario-discovery.md) — **Primary reference.** 10 techniques for finding scenarios our coverage misses
- [sprint-charter-selection.md](../skills/qa-sbtm/sprint-charter-selection.md) — how a sprint plan's §3/§5.2 becomes the §5.3 charter set (C1–C4 signals, D1–D3 disqualifiers, budget, lane, capture-back)
- `/qa-sbtm` skill — Full SBTM methodology: scenario discovery (primary), core framework, charter templates, CRISP/SFDPOT, adversarial heuristics, personas, modern web attack surface, charter library, debrief format
- [knowledge/oracles/vc-bug-catalog.md](../knowledge/oracles/vc-bug-catalog.md) — VC-specific historical bug patterns (read to AVOID re-discovery)
- [knowledge/oracles/e-commerce-edge-cases-library.md](../knowledge/oracles/e-commerce-edge-cases-library.md) — 54 `ECL-<n>.<m>` boundary/failure shapes (read to SUPPLY candidates — `[THEORETICAL]` first; a session is also the only source of `[OBSERVED]` promotions and new patterns)
- [knowledge/oracles/business-logic.md](../knowledge/oracles/business-logic.md) — 204 `BL-*` invariants (read as the correctness oracle, so a deviation is recognised as a bug during the session, not after)
- `/qa-review-oracles` — where a session's oracle proposals go (`ecl` / `bl` axes); the only writer of either file
- [knowledge/execution/live-discovery.md](../knowledge/execution/live-discovery.md) — Runtime test-data resolution (`live-discover` / `random-data` / `@td()`); use when a session needs to pick "any product / any address" and when a discovered gap becomes a follow-up test case
- `/qa-coverage-gap` skill — Programmatic coverage-gap analysis (complementary to manual exploratory discovery)
