# ba-system-analyzer — business invariant extraction, oracle review and domain maps

> Cited by `.claude/agents/ba-system-analyzer.md` (§8 / §8a). Read it when you extract BL candidates during analysis, run an oracle review (`/qa-review-oracles`, `/qa-review-bl`), or build or refresh a domain map (`/qa-domain-map`).

### 8. Business Invariant Extraction

While performing tasks 1–7, watch for **testable business rules** you can surface as `PROPOSED-BL-*` candidates. A rule qualifies when it is declarative, testable, not already in the oracle, and **stated by a human source** (AC, docs, a Jira resolution); behaviour seen only in code or live is a `kb` observation, not a candidate.

**Signals that reveal an invariant:**
- Pricing/tax/discount math observable in code (`*Calculator*.cs`, pricing services) or cart/checkout UI totals.
- Validation thresholds in controllers, domain models, or form validators (e.g., min/max quantity, email format, string length).
- State transitions in order status, cart state, auth state, quote workflow, promotion lifecycle.
- Auth/RBAC rules — which routes require which roles; which UI elements are role-gated.
- Cross-domain coupling — e.g., cart ↔ inventory, checkout ↔ payment, catalog ↔ search index.
- Context7/VC docs passages that state "must", "always", "never", or define required behavior.

**For every candidate:**
- Reuse the existing domain codes (PRICE, CART, CHK, ORD, AUTH, B2B, CAT, SRCH, SHIP, BOPIS, NOTIF, IMPEX, SEO, CROSS). If a rule spans two domains, use `CROSS`.
- Pick the next free number per domain from `existing_bl_ids`. Mark with `PROPOSED-` (final ID assigned at apply time).
- **A human source is mandatory**: the ticket key + AC, a docs section, or a Jira resolution. A GitHub `file:line` or a screenshot may accompany it, never replace it.
- **Stale-rule flagging:** behaviour that contradicts an existing `BL-*` rule is a **finding** (bug path) and a MARK-SUSPECT candidate — never a rewrite.

#### 8a. Oracle review (`/qa-review-oracles`, alias `/qa-review-bl`)

When invoked via **`/qa-review-oracles`** (as opposed to opportunistic extraction during `/ba-analyze`), gather evidence for each in-scope entry and return a proposed change for the skill's single-writer apply. **`bl`: BL sync** — human sources and check re-runs, one operation per record (`.claude/skills/qa-review-oracles/bl-audit-criteria.md`). **`ecl`: three-axis triangulation** (`ecl-audit-criteria.md`). Full method: the `/qa-review-oracles` skill.

**You are also the sole writer of the DOMAIN MAPS — `.claude/knowledge/domain/<name>.md` or the brief's run copy**, built and
refreshed via **`/qa-domain-map <slug>`** (shape: `.claude/knowledge/domain/domain-map.md`; reference:
`b2b-organizations.md`). Same single-writer discipline as the oracles below, and the same evidence bar:
**every claim carries `CONFIRMED` / `DRIFT` / `MISSING` / `UNVERIFIED`**, an unmarked claim reads as
`CONFIRMED` and is how a stale map does more damage than no map, and **`D*` / `G*` ids are a citation
contract** — updated in place on a refresh, never deleted or renumbered. Three things a map is **not**:
it carries **no behavioural rules** (those are the `BL-*` below) · it **never grounds an assertion as
`{DOC}`**, being a pointer index plus a surface inventory · and it records *what exists and where*, never
*what correct looks like*. **Query every published guide the domain touches** (VirtoOZ:
`PlatformUserGuide` **and** `StorefrontUserGuide` at minimum) and carry doc claims as **verbatim quotes
with their URL, triangulated against live** — a docs-vs-build divergence is customer-facing and usually
the map's highest-impact row, while a divergence the docs declare **on purpose** is not a defect and
saying so saves a reviewer's time.

**You are the sole writer of BOTH shared oracles**, and the skill runs on two axes:

| Axis | Oracle | Entry unit | Criteria file |
|---|---|---|---|
| **`bl`** | `bl/<slug>.yaml` (rendered to `business-logic.md`) | a YAML record (rule, priority, trust, source, check, status) | `bl-audit-criteria.md` |
| **`ecl`** | `e-commerce-edge-cases-library.md` | `### <n>.<m>` section of pattern **rows** in a pipe table | `ecl-audit-criteria.md` |

Everything in this section applies to both axes unless it names one. Three `ecl`-specific rules you must not violate:
- **NEVER renumber a surviving section.** `ECL-<n>.<m>` is a citation contract — ~65 test cases point at these numbers in their `Edge_Case_Refs` column. Renumbering to tidy up silently repoints every citation that was previously correct, and no gate can detect it because the new refs still resolve. A retired number is never reused; a new section takes the next free one in its chapter.
- **A dangling citation means ADD or REMAP — cluster size decides.** Many cases reaching for the same absent id usually means the *library* is missing content the authors expected: **ADD** at that exact id, which retroactively makes every existing citation true. A few whose subject is already covered elsewhere are mis-citations: **REMAP** — recommend the target and let `/qa-review-tests --fix` do the CSV write.
- **Deletion needs positive evidence.** "I could not reproduce it" is the *normal* state for an edge case — that is what makes it one. Retire only when the condition can no longer arise (feature gone, field gone, flow removed).

**You never edit a CSV** on either axis. Citation remaps belong to `test-management-specialist` via `/qa-review-tests --fix`.

- **Parallel batch (default).** `/qa-review-oracles` fans you out — up to 3 of you run concurrently, one per browser slot, each on a **disjoint batch** of entries with an **isolated browser session + distinct test user**. In this mode you **do your own live observation on your assigned slot** (never sub-delegate to `qa-testing-expert` — it breaks the 3-browser cap), and you **return each verdict + evidence tuple + the proposed edit; you do NOT write the oracle yourself.** The orchestrator applies all edits serially (single writer).
- **`bl` — per record:** read the tickets in its `source` / `suspect_reason` (Jira AC and resolutions) and the docs (VirtoOZ); re-run its `check` on your slot (executable: `npm run inv:run`; manual: follow `check.ref`, REAL-USER rule). Return **one operation** — SYNC / SYNC-UPDATE / NEW / MARK-SUSPECT / RESOLVE / RE-RUN / RETIRE-proposed / UNCHANGED — with the human source and the proposed YAML change. Code + live agreeing is never a source; behaviour no rule covers is a `kb` observation.
- **`ecl` — three axes (all three required to confirm):** **docs** (VirtoOZ — quote + reference), **source** (GitHub MCP, read-only — a `file:line` anchor), **live** (your own slot — an `{OBSERVED}` result + screenshot, REAL-USER rule, no `browser_evaluate` bypass). CONFIRMED / DRIFT / MISSING → propose a body-only edit with an `Amended:` + `Source:` stamp; not confirmed → a finding or a `kb` observation. No proposals file.
- **Env-agnostic** on both axes (no env names/URLs/slugs); the orchestrator assigns final ids at apply time.
- **Opportunistic extraction during `/ba-analyze`** returns candidates only, routed by `/ba-analyze` Step 4.5 — never an oracle edit, never a proposals file.
- **Re-run the axis's gate before returning.** `npm run bl:convert:check` + `bl:lint` / `npm run ecl:lint` is the acceptance check for your own edits — report its before/after High count. A run that raises the count has broken something. Note that a green lint proves each citation **exists**, never that it is **right**: a case citing a real-but-wrong entry passes every gate. Report those for `/qa-review-tests` Dimension 6; never claim the citations are correct on the strength of a green lint.
