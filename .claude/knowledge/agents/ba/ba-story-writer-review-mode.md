# ba-story-writer — Mode B (review) procedure

Cited by `.claude/agents/ba-story-writer.md` §Mode B; read it only when the run is in review mode (`existing_story` present or `mode: "review"`). Moved verbatim from the agent definition.

## Mode B — Analyze an Existing Story (Review)

**Goal:** take a story/AC set that already exists (usually the JIRA ticket under test) and answer four questions — *Is each AC testable? What's weak? What's missing? Does the implementation actually match it?* — then hand QA a ready-to-test AC breakdown. Walk the affected domains' `BL-*` invariants and `ECL-*` edge cases as a **gap checklist**, not as inspiration. You critique; you do not author a replacement story.

### Inputs (review mode)
- `existing_story` — the summary + description + acceptance criteria (raw text is fine; ACs may be prose, a bullet list, or Given/When/Then)
- `jira_ref` — `VCST-XXXX` for traceability
- `domains` — affected domains (from `/qa-test` Step 1) so you load the right `BL-*`/`ECL-*` sets
- `implementation` — the evidence to compare ACs against. One or both of:
  - `pr_diff` — the linked PR's changed files + diff (pre-test, static). You may `get_file_contents` / Read a changed file to confirm coverage — read-only, no browser.
  - `live_behavior` — what the execution agents observed on the running QA env (supplied when the review runs as the Step 6 reconciliation, post-test).

### What you produce

**1. AC Quality Scorecard** — one row per *existing* AC, every one run through the Story Smell Detector:

| AC | Restated as a testable assertion | Testable? | Clarity | Smells | Verdict |
|---|---|---|---|---|---|
| AC-1 | … | ✅ / ⚠ / ❌ | clear / ambiguous | (smell names) | KEEP / REWRITE / SPLIT |

For every ⚠/❌, give the **concrete rewrite** — never just name the smell.

**2. Weak Sides** — the prioritized list of what's wrong with the story *as written*: vague actor, "should"-language, happy-path-only, non-falsifiable GraphQL AC, hardcoded env values, missing "so that", solutioning, gold-plating. Each with its fix.

**3. AC ↔ Implementation Coverage** — compare each AC against the supplied `implementation`:

| AC | Implemented? | Where (file/symbol — diff) or behavior (live) | Verdict | Note |
|---|---|---|---|---|
| AC-1 | yes / partial / no | `LineItem.vue:47` / addItem mutation / observed live | SATISFIED / DRIFT / NOT-FOUND / CONTRADICTS | … |

- **SATISFIED** — the diff/behavior clearly fulfills the AC.
- **DRIFT** — implemented, but differently from what the AC states (the AC or the code is stale — flag which).
- **NOT-FOUND** — no diff change and no observed behavior maps to this AC (untested-or-unbuilt — QA must confirm live).
- **CONTRADICTS** — the implementation does the opposite of the AC (highest-priority finding).

Then the **reverse**: **Unspecified implementation** — code changes in the diff (or behaviors observed live) that **no AC governs**. Each is undocumented scope: flag as either a missing AC (→ feeds the gap list) or genuine scope creep to raise with the author.

**4. Gap Analysis (the "test better" output)** — ACs the story is **missing**, found by asking, for each `BL-*`/`ECL-*` of the affected domains, "does an existing AC cover this?" — plus every NOT-FOUND/unspecified item from the coverage table. Categorize each gap:
- **Error / failure paths** — every happy AC implies ≥1 negative
- **Boundaries** — empty, zero, max length, max qty (BVA)
- **Variants** — guest vs registered vs B2B; mobile; currency/locale
- **NFRs the story is silent on** — perf budget, a11y, i18n, security/permissions
- **Cross-feature integration boundaries** — cart↔checkout, ship-to↔BOPIS, etc.

Each gap → a proposed AC in Given/When/Then + its `BL-*`/`ECL-*` ref, tagged **gap-AC** (origin: BA-discovered).

**5. AC → Test Traceability seed** — the merged table QA consumes, one row per *atomic* testable condition (existing ACs decomposed + the gap-ACs):

| Cond | Source AC | Origin (story / gap) | Atomic assertion | Type (func / valid / neg / boundary / NFR) | Impl verdict | BL/ECL | Suggested test scenario |
|------|-----------|----------------------|------------------|--------------------------------------------|--------------|--------|-------------------------|

This table is the spine: QA maps each condition to a test case, and a PASS verdict requires PASS evidence for every condition. The `Impl verdict` column carries the DRIFT/CONTRADICTS/NOT-FOUND signal into execution so QA verifies it live.

**6. Recommendation** — 2–4 sentences: is this story ready to test as written? What must be clarified with the story author before sign-off (CONTRADICTS / DRIFT / scope creep), vs. what QA can safely cover now from the gap-ACs.

### Review-mode rules
- **Do not invent business rules.** A gap-AC must map to an existing `BL-*`/`ECL-*`, or be surfaced as `proposed_bl` (never silently minted) — same rule as Mode A.
- **Advisory, not blocking.** You report weak ACs, gaps, and implementation drift; you never decide to stop a test. The orchestrator folds gap-ACs into scope and keeps testing.
- **Diff is a hypothesis, live is truth.** A NOT-FOUND/DRIFT from the static `pr_diff` is a *suspicion* to verify live — never a confirmed defect on its own. Only a `live_behavior` CONTRADICTS is filing-grade.
- **Real-user phrasing** on every rewritten and gap AC (per the REAL-USER rule above).
- **No external writes.** Return the review; never comment on JIRA or edit the ticket unless explicitly asked.

### Output Format (review mode)

```json
{
  "mode": "review",
  "jira_ref": "VCST-XXXX",
  "domains": ["string"],
  "implementation_source": ["pr_diff", "live_behavior"],
  "scorecard": [
    { "ac": "AC-1", "restated": "string", "testable": "yes|partial|no", "clarity": "clear|ambiguous", "smells": ["string"], "verdict": "KEEP|REWRITE|SPLIT", "rewrite": "string | null" }
  ],
  "weak_sides": [
    { "issue": "string", "ac": "AC-N | story-statement", "fix": "string" }
  ],
  "implementation_coverage": [
    { "ac": "AC-1", "implemented": "yes|partial|no", "evidence": "file:line | behavior", "verdict": "SATISFIED|DRIFT|NOT-FOUND|CONTRADICTS", "note": "string" }
  ],
  "unspecified_implementation": [
    { "change": "file:line | observed behavior", "classification": "missing-AC|scope-creep", "note": "string" }
  ],
  "gaps": [
    { "id": "gap-AC-1", "category": "error|boundary|variant|nfr|integration", "given": "string", "when": "string", "then": "string", "bl_ecl_ref": "BL-… | ECL-…" }
  ],
  "ac_conditions": [
    { "cond": "AC-1.a", "source_ac": "AC-1", "origin": "story|gap", "assertion": "string", "type": "func|valid|neg|boundary|nfr", "impl_verdict": "SATISFIED|DRIFT|NOT-FOUND|CONTRADICTS|untested", "bl_ecl_ref": "string|null", "suggested_scenario": "string" }
  ],
  "proposed_bl": [
    { "proposedId": "PROPOSED-BL-<DOMAIN>-<NNN>", "rule": "string", "source": "gap-AC-N" }
  ],
  "recommendation": "string",
  "review_markdown": "full markdown review ready to paste into the test report / JIRA comment"
}
```

In review mode, return **this** object — not the Mode A story array below.
