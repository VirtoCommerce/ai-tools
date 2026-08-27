# Sprint Charter Selection — deriving exploratory charters from the sprint test plan

**Problem this solves.** The regression suites are *oracle-bound*: a suite fails only on what it
asserts. Everything a sprint changed that no assertion names is invisible to it — and that is exactly
where end-of-sprint escapes live. Exploratory testing covers that residue, but only if something
schedules it. Nine sprint plans (`26-08` … `26-16`) contain zero exploratory sessions and
`reports/exploratory/` holds one report from 2026-07-08, so in practice nothing did.

This file is the **derivation rule**: given a written sprint plan, which domains earn a 30-minute
charter, which explicitly do not, and what happens to what the session finds. It is consumed by
`/qa-test-plan` §5.3 (writes the charters) and `/qa-exploratory sprint` (runs them).

> **A checklist is not this.** `/qa-checklist` is a *pre-enumerated* list, so it can only surface the
> delta between what it enumerates and what the suites assert. That delta is real and worth
> harvesting (see §4), but it is finite and it is drawn once. Bugs of a genuinely different class come
> from the **un-enumerated**, which is what a charter is for. Do not substitute one for the other.

---

## 1. Inputs — all four are already in the plan

| Input | Section |
|---|---|
| Risk-scored domains (`L`, `I`, `Score`, ticket list) | §3 Risk Assessment |
| Suites activated, per domain | §5.1 |
| Coverage gaps, incl. `Target suite(s) = none` | §5.2 |
| Out-of-scope / separate-product exclusions | §2.4 |

**A charter must be anchored to something the plan already contains** — a §3 domain, or a specific
§5.2 `GAP-NN`. Never a domain of your own invention, never a suite absent from §5.1. The selection is a
*filter over the plan*, not a fresh judgement — same discipline that made `regression:select` replace
the agent-printed `AFFECTED_SUITES:` line that hallucinated 32 case ids.

## 2. Qualifying signals — a domain earns a charter on ANY one

| # | Signal | Derived from | Why a suite can't do it | Lead technique |
|---|---|---|---|---|
| **C1** | **Uncovered surface** — a §5.2 gap whose target suite is `none` | §5.2 | There is no suite. Authoring one takes a sprint; the charter covers it *this* week | User-flow edge enumeration |
| **C2** | **Concurrency seam** — ≥3 concurrent changes on one surface at `L ≥ 4`, counted as **tickets OR as modules/repos a single ticket touched** | §3 | Each feature has cases; their *seam* has none. Nobody wrote a case for "these three changes in the same session" | Feature-pair matrix · Boundary-of-features |
| **C3** | **Cross-layer chain** — a §5.2 gap naming ≥3 suites across ≥2 layers | §5.2 | The chain is real but each suite only sees its own link | Soap Opera · Scenario tour |
| **C4** | **Latent blast radius** — `I = 5` with `L ≤ 3` | §3 | Low likelihood keeps it out of the suite budget forever, while impact is total. A 30-min probe is the proportionate instrument | Galumphing · Saboteur |

## 3. Disqualifiers — these are test cases, not charters

| # | Disqualifier | Route instead |
|---|---|---|
| **D1** | **Exact oracle** — the change is one assertable value or contract (a rounding rule, an error payload shape, a schema endpoint's presence) | §6 → `/qa-test-cases-generator`. A precise oracle makes a case cheaper *and* permanent; spending a charter on it buys a one-off verdict |
| **D2** | **No QA surface in this repo** — §2.4 exclusions, separate products (`vc-shell` / Vendor Portal) | Nothing. Say so in §5.3 rather than omitting it silently |
| **D3** | **Already charted in the last 24 h** — `reports/exploratory/SBTM-*` on the same domain | The existing report; extend it, don't re-run |

**A disqualifier outranks every C signal.** Sprint 26-16's Platform Security / Auth API is `I=5, L=3`
(a clean C4) *and* a pure D1 — the change is the login endpoint's error contract, which §5.2 GAP-13
already words as an assertable negative case. D1 wins: it goes to §6, not §5.3.

D1 is the one that gets ignored under pressure. A domain can score `20` in §3 and still be a pure
D1 — high risk is *not* the qualifier here; **oracle fuzziness** is. 26-16's `discountPercent`
rounding (score 20) and Skyflow schema endpoint are both D1 for exactly that reason.

> **The C2 counting unit was widened after the first real run.** It began as "≥3 *tickets*", which
> silently dropped 26-16's Hangfire→RabbitMQ migration: **one** ticket that replaced the execution
> substrate in **six modules at once**, with asynchronous failures that surface late — the textbook
> charter target. Concurrency is a property of the *surface*, not of the ticket count.

## 4. Where the checklist diff feeds in

For each **Critical / High** domain in §3, diff its `/qa-checklist` domain list against the case
titles of that domain's §5.1 suites. Every uncovered item routes to exactly one of two places:

- **Specific and assertable** → a §5.2 `GAP-NN` row → a `Draft` case. Permanent coverage.
- **State-shaped, interaction-shaped, or "depends"** → the charter's **candidate scenarios**
  (`/qa-exploratory` requires 2–3 named up front). Those are the items a CSV row would flatten.

This is what makes the checklist pay for itself: it is drawn once per domain and it feeds *both*
outputs, instead of becoming a third parallel run with no history, no fingerprint and no promotion path.

## 5. Budget and ranking

- **Cap: 5 charters per sprint.** Rank **C1 first, then by signal count, then by §3 score.** A charter
  nobody runs is worse than one never written — it makes the plan *look* covered.
- **C1 outranks a higher score, and this is not a tie-break detail.** A C1 domain has *no suite at all*;
  a C2 domain at least has cases for each feature and is missing only their seam. Ranking by §3 score
  alone buried 26-16's GAP-03 (chunk-load resilience — "the domain has no suite today") beneath four
  score-20 domains that were already covered from several directions. Zero coverage beats partial
  coverage as a claim on 30 minutes.
- **30 min each** (5 setup + 20 explore + 5 document), 45 max. 5 charters ≈ 2.5 h against ~34 suites.
- **Lane: `playwright-chrome` or `playwright-edge` — never `playwright-firefox`.** Exploration is
  click-driven by definition, and `@playwright/mcp` + firefox cannot click on this storefront or the
  Admin SPA (confirmed 6×, `.claude/rules/agents.md`). A firefox placement costs the whole session.
- **Run isolated from regression.** The pool is 3 concurrent browser agents total; a charter run
  competing for a lane slows the suites it is supposed to complement.

## 6. Capture-back contract — the part that makes it compound

A session's output is worthless next sprint unless it lands somewhere a runner reads. So every
`[EXP]` net-new scenario has exactly one of two fates, recorded in the session report:

1. **Promoted** → `/qa-test-cases-generator` → a `Draft` case in `regression/suites/<layer>/<module>/`,
   and a `GAP-NN` row in the *next* sprint plan's §5.2. From then on the automated runner owns it.
2. **Declined** → one line saying why (not reproducible, by-design, out of scope, needs a fixture we
   don't have). An unexplained absence is the failure mode: the bug was found once and forgotten.

A confirmed defect additionally files through `/qa-bug` as normal — that is separate from, not a
substitute for, promoting the *scenario*.

## 7. Measure it; don't assume it

Run this in **shadow for 2–3 sprints** before treating it as load-bearing, and count:

| Metric | Source |
|---|---|
| `[EXP]` vs `[VAL]` session ratio | `reports/exploratory/SBTM-*` session-type field |
| Net-new scenarios promoted to `Draft` | §5.2 rows tagged `from: EXP-<charter>` |
| Bugs found by charter, not attributable to any activated suite's assertions | `reports/bugs/` cross-ref |

If charters produce mostly `[VAL]` sessions, the selection rule is picking already-covered domains —
tighten §2, don't add sessions. The claim "exploratory catches more bug classes" is testable here;
this repo's convention is to measure before defaulting (`regression:select` is still in shadow for the
same reason).

## See also
- [scenario-discovery.md](scenario-discovery.md) — the 10 techniques; §9 charter-from-gap, §10 the debrief rule
- [charter-library.md](charter-library.md) — 11 ready charters to galumph/hostile-interview into a sprint charter
- [adversarial-heuristics.md](adversarial-heuristics.md) · [personas.md](personas.md) — filters, not checklists
- `.claude/commands/qa-test-plan.md` §5.3 — writes the charters · `.claude/commands/qa-exploratory.md` `sprint` — runs them
