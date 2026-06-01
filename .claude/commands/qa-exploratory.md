---
description: "Discover scenarios the regression suite doesn't cover. Discovery-first exploratory session — every run must surface a net-new scenario."
argument-hint: "[checkout|catalog|B2B|mobile|new]"
disable-model-invocation: true
---

# /qa-exploratory — Scenario Discovery Session

**Primary purpose: find scenarios our existing coverage misses.** The CSV suites in [`regression/suites/`](../../regression/suites/) cover what we know to test; this command exists to discover what we *don't* know to test. Confirming known coverage works is valuable but is **re-validation**, not exploration — log it accordingly.

Every session must end with at least one **net-new scenario** (not in any regression suite, not in [vc-bug-catalog.md](../agents/knowledge/vc-bug-catalog.md), not predictable from the charter alone). If no net-new scenario emerges, the session is `[VAL]` re-validation, not `[EXP]` exploration. See [`scenario-discovery.md`](../skills/qa-methodology/qa-sbtm/scenario-discovery.md) for the discovery techniques.

## Usage
```
/qa-exploratory checkout          # Explore the checkout flow
/qa-exploratory catalog           # Explore catalog & product pages
/qa-exploratory B2B               # Explore B2B features (quotes, org management)
/qa-exploratory mobile            # Explore at mobile viewport (375px)
/qa-exploratory new               # Explore recently changed areas (from git diff)
```

---

## Execution

### Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user.
2. **Build & version verification** — fetch deployed versions per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`)
   - Record platform version and theme version — include in the session report header
3. **Duplicate check** — scan `reports/exploratory/` for an `SBTM-*` session on the same domain in the last 24 hours. If found, warn user and show previous findings.
4. **Context7 query** — resolve `/virtocommerce/vc-docs`, query the target domain (e.g., `"checkout workflow"`, `"B2B organizations members"`, `"catalog product properties"`) with `tokens: 8000`. Extract feature inventory to guide exploration — ensure the agent covers all documented features, not just obvious ones.
5. **Coverage map** — for the target domain, identify what's *already covered*:
   - Open the CSV suite(s) for the domain (via [module-suite-map.md](../agents/knowledge/module-suite-map.md) → [`regression/suites/`](../../regression/suites/)) — list the scenarios already tested
   - Open [vc-bug-catalog.md](../agents/knowledge/vc-bug-catalog.md) and read the section(s) for the domain (VC-CHECKOUT-*, VC-CART-*, VC-B2B-*, etc.) — list the known failure patterns
   - These two lists are what NOT to spend session time re-validating. The discovery target is everything *else*.
6. **Pick a discovery technique** — open [scenario-discovery.md](../skills/qa-methodology/qa-sbtm/scenario-discovery.md) and select ONE technique appropriate to the situation:
   - New feature in this sprint → User-flow edge enumeration + Surprise-seeking time
   - Two features integrated recently → Feature-pair matrix at their seam (Boundary-of-features hunting)
   - Production keeps escaping bugs → Production-error mining (Azure App Insights)
   - Regression suite feels stale → Coverage-diff hunting (suite vs codebase via GitHub MCP)
   - No specific risk → Surprise-seeking + Hostile interview
7. **Heuristic filters (optional)** — load the heuristic references as *filters* (familiar-problems oracles), not checklists:
   - [adversarial-heuristics.md](../skills/qa-methodology/qa-sbtm/adversarial-heuristics.md) — Whittaker tours, FAILURE, HICCUPPS-F
   - [personas.md](../skills/qa-methodology/qa-sbtm/personas.md) — Pick a persona that would see scenarios the charter author wouldn't
   - [modern-web-attack-surface.md](../skills/qa-methodology/qa-sbtm/modern-web-attack-surface.md) — Cache/multi-tab/browser-feature probes
   - The agent uses these to spot familiar problems faster — NOT as a sequential checklist.

Delegate to **qa-testing-expert** (Task tool, `subagent_type: qa-testing-expert`) with the target area + the chosen discovery technique.

### Exploration Charter

For each session, the agent should:

1. **Define a discovery charter** — Frame the mission around discovery, not coverage:
   - Bad: "Explore checkout to find bugs"
   - Good: "Discover scenarios in checkout that aren't covered by suites 011–013 and aren't in VC-CHECKOUT-* / VC-CART-* catalog entries"
   - Name 2–3 *candidate scenarios* up front (from coverage-diff, feature-pair matrix, user-flow edges). These are the discovery targets — they may be wrong, but they force a hypothesis.
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

Personas live in `.claude/skills/qa-methodology/qa-sbtm/personas.md`. Tours live in `.claude/skills/qa-methodology/qa-sbtm/adversarial-heuristics.md`.

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

## Net-New Scenarios Discovered (mandatory for [EXP])
| # | Scenario | Why uncovered | What we found | Suggested next charter |
|---|----------|---------------|---------------|------------------------|
| 1 | [1-line description] | [no suite + no catalog entry] | [observation / bug / question] | Explore X to discover Y |

> If this table is empty, the session is `[VAL]` not `[EXP]`. Update the Session type field.

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
- Heuristic packs (CRISP/SFDPOT, Whittaker tours, FAILURE, HICCUPPS-F) are filters, not checklists — they help spot familiar problems faster but are not the primary work
- Follow `.claude/skills/qa-methodology/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- Use qa-testing-expert on `playwright-firefox` (fallback: `playwright-edge`)
- Monitor console and network throughout
- Capture screenshots for every bug found
- Don't try to fix bugs — just document them
- If a Critical bug is found, stop and report immediately — escalate via `/qa-bug`
- Always query Context7 in Step 0 to build a feature inventory for the target domain

## Related
- [scenario-discovery.md](../skills/qa-methodology/qa-sbtm/scenario-discovery.md) — **Primary reference.** 10 techniques for finding scenarios our coverage misses
- `/qa-sbtm` skill — Full SBTM methodology: scenario discovery (primary), core framework, charter templates, CRISP/SFDPOT, adversarial heuristics, personas, modern web attack surface, charter library, debrief format
- [.claude/agents/knowledge/vc-bug-catalog.md](../agents/knowledge/vc-bug-catalog.md) — VC-specific historical bug patterns (read to AVOID re-discovery)
- [.claude/agents/knowledge/live-discovery.md](../agents/knowledge/live-discovery.md) — Runtime test-data resolution (`live-discover` / `random-data` / `@td()`); use when a session needs to pick "any product / any address" and when a discovered gap becomes a follow-up test case
- `/qa-coverage-gap` skill — Programmatic coverage-gap analysis (complementary to manual exploratory discovery)
