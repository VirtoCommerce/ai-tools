# 5-triage — triage: correlate → validate evidence → classify → provenance → severity → dedup

[`close-out.md`](close-out.md) §Triage — the calls, and where each returned class goes — is the owner; this file holds
what triage adds around them. Read it when you are turning a run's raw results into a list of findings each
of which has a class, a provenance and a severity.

**Triage runs before 5-verdict, and the order is load-bearing:** the verdict is expressed in terms of a
finding's provenance (item 4) and the AC/DoD state `5-verdict` reconciles first (5-verdict.1).

## 5-triage. Triage — correlate → validate evidence → classify → provenance → severity → dedup

Everything the run can surface a finding from is triaged **before** anything is filed: the checklist runners'
results, the exploratory and visual lanes' findings (neither files anything itself), the regression lane's
FAILs, and correlated App-Insights signals. **There is no release-scoped sweep to triage** — a separate
`/qa-regression` run is triaged by its own `/qa-triage-results` against this same taxonomy.

### 0. Two calls, one taxonomy

`vc-test:qa-triage-results` classifies; nothing here re-derives its taxonomy ad hoc. **Ticket mode** takes
the checklist (item 3). **The regression lane**, when it ran, has a `RUN_ID` with evidence bundles
(`traces/*-FAIL-trace.json`, screenshots, HAR): the same skill with `<RUN_ID> --verify --min-severity P2` —
**never `--fix`**, because a ticket run never edits a suite case. A FAIL it classifies as a test defect is a
`stale_cases` entry (`failed-as-test-defect`) for `/qa-test-lifecycle`. Two side effects of that call the run
gets nowhere else: the cross-run **flakiness history** (`triage:history` → `reports/regression/history.json`)
and the fingerprint dedup store. Fold its `triage-report.md` tables into this phase's finding list — **do not
reclassify a finding it already resolved.** A lane that did not run is stated, never silently absent.

**Exploratory findings enter here like any other, with one asymmetry worth naming:** the lane explores
adjacent ground by construction, so most of what it surfaces is **PRE-EXISTING**: the existing key is named, nothing
is filed or linked. That is not a reason to discount it.

### 1. Correlate App Insights logs for the test window

Catches backend errors the UI test *triggered but didn't surface*: 5xx, failed dependencies, exceptions,
GraphQL `errors[]` inside a 200. This reuses `/qa-monitoring`'s machinery scoped to the window — **query →
dedup → triage**, with no separate live-repro, because the agents were already live.

Pre-flight App Insights access (Azure MCP `applicationinsights`, or `APPINSIGHTS_APP_ID_*` +
`APPINSIGHTS_API_KEY_*`); if neither is configured → **skip with a one-line note**, never block the verdict.
Query each affected layer with the `ci/monitoring/queries/` probes scoped to the window (+2 min buffer).
Dedup **labels** novelty against `reports/monitoring/.seen-fingerprints.json` (read-only). Classification
goes to `qa-backend-expert` via `ci/agents/monitor-triage-agent.md` → `REAL_BUG | KNOWN_ISSUE | NOISE |
CONFIG_GATED | THIRD_PARTY | TRANSIENT` + severity + confidence (ambiguous → NEEDS_REVIEW).

A HIGH-confidence `REAL_BUG` enters the finding list with evidence attached (signature + portal link); it
gets **no separate `BUG-AI-*` draft** — 5-file's `/vc-fix:qa-bug` owns it.

### 2. Validate evidence quality

| Check | Action if missing |
|---|---|
| Agent claims PASS but no screenshots for critical flows | Request re-verification with evidence |
| Agent claims FAIL but no screenshot/console evidence | Get evidence before it enters the finding list |
| Critical revenue flow (checkout, payment, cart) not explicitly tested | Flag as incomplete coverage |
| A bug candidate has no reproducible evidence bundle | Get it, or carry in as LOW-confidence — never file unevidenced at 5-file |
| `BL-*` listed in the prompt but not mentioned in results | Flag as untested — request verification |
| HIGH-confidence `REAL_BUG` in the window not reflected in agent results | Surface it — the UI test missed a backend error; carry into the finding list |

### 3. Findings that have no RUN_ID — the same command, in `ticket` mode

Item 0 covers the regression lane's own FAILs. The rest — the checklist runners, the visual lane, the
exploratory lane — go through the Skill tool with **`skill: "vc-test:qa-triage-results"`, args `ticket <ticket-key> --verify --min-severity P2`**, not an inline
pass. **First, every one of those findings must be a row with a verdict in `testing-checklist.md`** (visual-axis §6
already requires this for the visual lane). Ticket mode reads only that file, and a finding that is not in it is never
triaged. `--verify` sends **every** Medium-or-worse `REAL_BUG` candidate through `vc-fix:qa-investigate`, not just the
HIGH-confidence ones, so each bug that reaches 5-file arrives with an evidence package. What ticket mode returns
and what this phase does with it: [`routing-and-fix.md`](../../../plugins/vc-test/skills/qa-triage-results/routing-and-fix.md) §Ticket mode.

Still classified inline, using that command's taxonomy: failed ACs (confirmed at 5-verdict.1, folded back here)
and App-Insights signals. The classes are real product bug vs test-defect (`TEST_STEPS_DEFECT` /
`ASSERTION_DEFECT` / `TEST_DATA_DEFECT` / `STALE_TEST`) vs `BY_DESIGN` / `ENV` / `KNOWN_ISSUE`. An inline real
bug is investigated the same way before it is filed: one `vc-fix:qa-investigate` dispatch, as that command's
Phase 4 runs it.

Ambiguous → **real bug / LOW**, never relabelled as a test-defect. A test-defect is never a ticket: on a
checklist item you fix the item; on a suite case it is a `stale_cases` entry for `/qa-test-lifecycle`.

### 4. Provenance — per real bug

| Provenance | Means | Effect |
|---|---|---|
| **PRE-EXISTING** | dedup match, or reproduces pre-change | name the existing key (`verdict.md` + the comment), don't re-file, no tracker write; doesn't fail this ticket |
| **IN-SCOPE** | in what this ticket changed | fails this ticket; becomes a row of the ticket's To-fix table at 5-file (no tracker item) |
| **OUT-OF-SCOPE incidental** | unrelated defect found opportunistically | suggested to the operator as its own ticket + a *related* link, created only on their yes; doesn't fail this ticket unless a P0 revenue-flow break |
Unclear → treat **IN-SCOPE** (fail-safe).

### 5. Severity + priority

Per `.claude/skills/qa-defect/` (P0…P3). This is the call 5-file's severity floor reads, and it is graded here —
never re-graded at 5-file to move a finding across the line.

### 6. Dedup — every finding, regardless of source

Glob `reports/bugs/**` + all `reports/tickets/Sprint*/` + the ticket's run folders (their `bugs/`), and search the tracker. A match = PRE-EXISTING. A `/qa-triage-results`-confirmed bug
still needs this tracker-wide check before 5-file can file it. A match on a `to_fix[]` row of an **earlier
round of this ticket** is not PRE-EXISTING: it is this ticket's own unfinished work, keeps its IN-SCOPE
provenance and severity, and still fails it.

### 7. Visual-lane findings — three classes, and only one of them can fail the ticket

When the visual lane ran ([`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md)), its findings enter this same triage
with **no new class and no new severity ladder** — but they split by what produced them, and the split is
what makes the axis safe to switch on:

| Finding | Treated as | Lands in |
|---|---|---|
| A **`BL-UI-*` invariant FAIL** (layout, overflow, alignment, CLS) | an ordinary finding — classified, provenanced, severity-graded, filed at 5-file under the existing floor, and able to fail 5-verdict | `summary.json.visual.invariant_failures[]` |
| A **`BL-A11Y-*` invariant FAIL** on a **functional / feature / E2E** ticket | **never blocks** — filed as its **own standalone ticket** (§7a) | `visual.a11y_findings[]` |
| A **`vs. USER` `FAIL`** — a real user cannot complete the task | an ordinary finding, like a `BL-UI` FAIL — able to fail 5-verdict | `visual.ux_findings[]` |
| A **`vs. USER` `ADVISORY`** — completed with friction | **advisory** at its real severity — reported, never fails 5-verdict | `visual.ux_findings[]` |
| A **`vs. DESIGN` `DRIFT` / `MISSING` / `UNSPEC` / `KNOWN_DIVERGENCE`** | **advisory** — reported, never filed by this rule, **never** fails 5-verdict | `visual.advisory[]` |
| **`AMBIGUOUS`** — the spec contradicts an invariant or a WCAG criterion | escalate to the human in `verdict.md` and the page; **never** resolve it by obeying the spec | `visual.advisory[]` + named in the report |
| **`SKIPPED` / `INCONCLUSIVE`** (no design source on disk; axe blocked by CSP) | an absent measurement | `visual.axes.*.skipped_reason` — **never** reported as clean |

Precedence is `BL-UI / BL-A11Y invariant > design spec > UX heuristic`: **a spec match never rescues an
invariant FAIL.** The reason drift only advises is that most drift rows are cosmetic px deltas where the
implementation is arguably better than the spec — blocking on those would train everyone to ignore the axis,
which costs more than the drift does.

#### 7a. An accessibility finding never blocks a functional, feature or E2E ticket

**`BL-A11Y-*` findings are filed as their own standalone ticket and do not fail 5-verdict** when the ticket under
test is a functional / feature / E2E story. They are still **found**, still **evidenced**, still **filed** —
what changes is that they do not hold the story.

**Why, stated so it is a decision rather than a leak.** Accessibility is a *cross-cutting property of a
surface*, not an acceptance criterion of the story that happened to touch it. A contrast ratio or a missing
accessible name is almost always **pre-existing** on the component, inherited by whichever story next edits
that file — so blocking on it fails the story for a defect it did not introduce, and the fix usually belongs
to the design system rather than to this feature. Left as a blocker it produces the outcome nobody wants:
the axis gets switched off, or the finding gets re-graded downwards to clear the gate, which corrupts the
severity ladder for everything else.

**The rules:**

- **Suggest it as a standalone ticket**, with a *related* link back to the ticket under test — the same 5-file
  shape as an OUT-OF-SCOPE incidental (asked, created only on the operator's yes), and for the same reason.
  Never a To-fix row: that row asserts this ticket caused it.
- **It keeps its real severity.** Do **not** downgrade a P1 contrast failure to make it look non-blocking —
  the whole point is that severity and blocking are now separate questions. Severity is still graded once,
  at 5-triage, and never re-graded (item 5).
- **The 5-file severity floor still applies** to whether it is filed at all: `Critical`/`High`/`Medium` file, a
  `Low` keeps its line in `summary.json.bugs_not_filed`.
- **It is named in the verdict, not hidden by it.** The page, `verdict.md` and the checklist carry the
  a11y rows with their verdicts and the standalone ticket keys, so a PASS is never mistaken for *"no
  accessibility problems here"*.
- **`BL-UI-*` is unchanged and still blocks.** Layout stability, overflow, alignment and CLS are
  functional breakage of the surface the story shipped — a control the user cannot reach because it is
  clipped is not a cross-cutting property.

**The carve-out — when a11y DOES block.** If accessibility is what the ticket is *for*, it blocks normally:
an a11y/WCAG remediation ticket, a ticket whose ACs name an accessibility outcome, or a
`/qa-accessibility` run. The test is the ticket's own ACs, not the finding's severity. State which side of
the line the ticket fell on in `verdict.md`.

**Output:** every finding carrying `class` + `provenance` + `severity` + `duplicate-of?`, and every
`BL-A11Y-*` finding additionally carrying `blocks: false` + its standalone ticket key.

---
