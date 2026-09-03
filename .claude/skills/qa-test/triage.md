# Step 5a — triage: correlate → validate evidence → classify → provenance → severity → dedup

Split out of [`close-out.md`](close-out.md) — that file is the close-out **spine** (5b · 5c · 5r · 5d) and
cites this one. Read this when you are turning a run's raw results into a list of findings each of which
has a class, a provenance and a severity.

**5a runs before 5b before 5c, and the order is load-bearing:** the verdict is expressed in terms of a
finding's provenance (5a) and the reconciled AC/DoD state (5b).

## 5a. Triage — correlate → validate evidence → classify → provenance → severity → dedup

Everything the run can surface a finding from is triaged **before** anything is filed: the **C1** run's own
FAILs, checklist-track agent-reported bugs, the **Step-3x discovery lane's** findings (it files none itself),
and correlated App-Insights signals. **C2 is not triaged here** — it has not run yet; 5r triages it against
this same taxonomy after the verdict is recorded.

### 0. Triage the C1 run through `/qa-triage-results`, not from scratch

The change-scoped run already has a `RUN_ID` with evidence bundles (`traces/*-FAIL-trace.json`, screenshots,
HAR). Invoke **`/qa-triage-results <RUN_ID> --fix`** instead of re-deriving the taxonomy ad hoc. That
command owns: deterministic collection (`triage:collect`), per-batch classification via
`ci/agents/regression-triage-agent.md`, live verification of HIGH-confidence `REAL_BUG`s, auto-application
of confirmed test-case fixes via `/qa-review-tests --fix` for the *existing* Artifact-C suites (Step 3's own
`--fix` pass only covers the newly-authored rows), and drafting confirmed bugs to `reports/bugs/`.

Two side effects `/qa-test` gets nowhere else: the cross-run **flakiness history**
(`triage:history` → `reports/regression/history.json`) and the fingerprint dedup store.

Fold its `triage-report.md` tables (confirmed bugs / test-case fixes / dismissed) directly into this
phase's finding list — **do not reclassify a finding it already resolved.** It never files a tracker ticket;
5d owns filing. Skip with a one-line note if C1 was skipped (no new cases and no `RE-BASE` ⇒ no RUN_ID) —
a skipped track is stated, never silently absent.

**Discovery-lane findings enter here like any other, with one asymmetry worth naming:** the lane explores
adjacent ground by construction, so most of what it surfaces is **PRE-EXISTING** and links rather than
files. That is not a reason to discount it — a PRE-EXISTING bug found *before* authoring still changes what
Artifact A asserts, which is the whole reason the lane runs where it does.

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
gets **no separate `BUG-AI-*` draft** — 5d's `/qa-bug` owns it.

### 2. Validate evidence quality

| Check | Action if missing |
|---|---|
| Agent claims PASS but no screenshots for critical flows | Request re-verification with evidence |
| Agent claims FAIL but no screenshot/console evidence | Get evidence before it enters the finding list |
| Critical revenue flow (checkout, payment, cart) not explicitly tested | Flag as incomplete coverage |
| A bug candidate has no reproducible evidence bundle | Get it, or carry in as LOW-confidence — never file unevidenced at 5d |
| `BL-*` listed in the prompt but not mentioned in results | Flag as untested — request verification |
| HIGH-confidence `REAL_BUG` in the window not reflected in agent results | Surface it — the UI test missed a backend error; carry into the finding list |

### 3. Classify findings that have no RUN_ID

Item 0 already classified the regression run's own FAILs. The rest — failed ACs (confirmed at 5b, folded
back here), checklist-track agent-reported bugs, App-Insights signals — use the same taxonomy
`/qa-triage-results` uses: real product bug vs test-defect (`TEST_STEPS_DEFECT` / `ASSERTION_DEFECT` /
`TEST_DATA_DEFECT` / `STALE_TEST`) vs `BY_DESIGN` / `ENV` / `KNOWN_ISSUE`.

Ambiguous → **real bug / LOW**, never relabelled as a test-defect. A test-defect routes to
`/qa-review-tests <suite> --fix`, not a ticket.

### 4. Provenance — per real bug

| Provenance | Means | Effect |
|---|---|---|
| **PRE-EXISTING** | dedup match, or reproduces pre-change | link, don't re-file, don't fail this ticket |
| **IN-SCOPE** | in what this ticket changed | fails this ticket; files as a Sub-task at 5d |
| **OUT-OF-SCOPE incidental** | unrelated defect found opportunistically | files as its own standalone ticket + a *related* link; doesn't fail this ticket unless a P0 revenue-flow break |
| **CARRIED** (`--iterate` only) | dedup match is a bug **this run filed in an earlier round** | keeps its original IN-SCOPE provenance **and** severity, so it still fails this ticket; files nothing; one comment on its existing Sub-task. **The match set comes from `5k.0`'s live read of the ticket's sub-tasks + linked bugs, not from the run's memory of what it filed** — a sub-task someone fixed, merged and deployed mid-run was verified there and is `bugs_fixed`, not CARRIED ([`modes.md`](modes.md) §Round entry) |

Unclear → treat **IN-SCOPE** (fail-safe).

**`--iterate`:** without the CARRIED row, item 6's dedup matches this run's own round-1 Sub-task and
the PRE-EXISTING row then says *don't re-file, don't fail this ticket* — wrong twice, since it is this
ticket’s own Sub-task and it is still failing. Rationale, plus what happens when a carried bug goes
green: [`modes.md`](modes.md) §5k §Three carve-outs.

### 5. Severity + priority

Per `.claude/skills/qa-defect/` (P0…P3). This is the call 5d's severity floor reads, and it is graded here —
never re-graded at 5d to move a finding across the line.

### 6. Dedup — every finding, regardless of source

Glob `reports/bugs/**` + all `reports/tickets/Sprint*/`, and search the tracker (per
`feedback_duplicate_check_across_all_sprints`). A match = PRE-EXISTING. A `/qa-triage-results`-confirmed bug
still needs this tracker-wide check before 5d can file it.

**`--iterate` — the one exception, and it matters because this item runs AFTER item 4.** A match on a
bug **this run filed in an earlier round** is **CARRIED**, never PRE-EXISTING. Dedup re-emits
`provenance` for every finding, so without this line the item-4 CARRIED call is overwritten one step
later: the bug stops failing 5c, and the round reports PASS on a defect this same run filed and that is
still red. Match on the bug key, not on the symptom — it is this ticket’s own Sub-task.

### 7. Visual-lane findings — three classes, and only one of them can fail the ticket

When the Step-4 visual lane ran ([`visual-axis.md`](visual-axis.md)), its findings enter this same triage
with **no new class and no new severity ladder** — but they split by what produced them, and the split is
what makes the axis safe to switch on:

| Finding | Treated as | Lands in |
|---|---|---|
| A **`BL-UI-*` invariant FAIL** (layout, overflow, alignment, CLS) | an ordinary finding — classified, provenanced, severity-graded, filed at 5d under the existing floor, and able to fail 5c | `summary.json.visual.invariant_failures[]` |
| A **`BL-A11Y-*` invariant FAIL** on a **functional / feature / E2E** ticket | **never blocks** — filed as its **own standalone ticket** (§7a) | `visual.a11y_findings[]` |
| A **`vs. DESIGN` `DRIFT` / `MISSING` / `UNSPEC` / `KNOWN_DIVERGENCE`** | **advisory** — reported, never filed by this rule, **never** fails 5c | `visual.advisory[]` |
| **`AMBIGUOUS`** — the spec contradicts an invariant or a WCAG criterion | escalate to the human in the 5e report; **never** resolve it by obeying the spec | `visual.advisory[]` + named in the report |
| **`SKIPPED` / `INCONCLUSIVE`** (no `/design-login`; axe blocked by CSP) | an absent measurement | `visual.axes.*.skipped_reason` — **never** reported as clean |

Precedence is `BL-UI / BL-A11Y invariant > design spec > UX heuristic`: **a spec match never rescues an
invariant FAIL.** The reason drift only advises is that most drift rows are cosmetic px deltas where the
implementation is arguably better than the spec — blocking on those would train everyone to ignore the axis,
which costs more than the drift does.

#### 7a. An accessibility finding never blocks a functional, feature or E2E ticket

**`BL-A11Y-*` findings are filed as their own standalone ticket and do not fail 5c** when the ticket under
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

- **File it standalone**, with a *related* link back to the ticket under test — the same 5d shape as an
  OUT-OF-SCOPE incidental, and for the same reason. Never a Sub-task: a Sub-task asserts the parent caused it.
- **It keeps its real severity.** Do **not** downgrade a P1 contrast failure to make it look non-blocking —
  the whole point is that severity and blocking are now separate questions. Severity is still graded once,
  at 5a, and never re-graded (item 5).
- **The 5d severity floor still applies** to whether it is filed at all: `Critical`/`High`/`Medium` file, a
  `Low` keeps its `reports/bugs/open/low/` draft and its line in the 5e comment.
- **It is named in the verdict, not hidden by it.** The 5e report and the Artifact-B checklist carry the
  a11y rows with their verdicts and the standalone ticket keys, so a PASS is never mistaken for *"no
  accessibility problems here"*.
- **`BL-UI-*` is unchanged and still blocks.** Layout stability, overflow, alignment and CLS are
  functional breakage of the surface the story shipped — a control the user cannot reach because it is
  clipped is not a cross-cutting property.

**The carve-out — when a11y DOES block.** If accessibility is what the ticket is *for*, it blocks normally:
an a11y/WCAG remediation ticket, a ticket whose ACs name an accessibility outcome, or a
`/qa-accessibility` run. The test is the ticket's own ACs, not the finding's severity. State which side of
the line the ticket fell on in the 5e report.

**Output:** every finding carrying `class` + `provenance` + `severity` + `duplicate-of?`, and every
`BL-A11Y-*` finding additionally carrying `blocks: false` + its standalone ticket key.

---
