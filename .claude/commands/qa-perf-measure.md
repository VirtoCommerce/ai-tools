---
description: "Measure backend work per request on a deployed environment: pick the instrument → establish the builds → drive identical work → count dependencies via an App Insights operation_Id join with paired positive/negative controls → read the residual (N+1 vs distinct shapes vs floor) → report + STOP. Counts transfer across environments; latency does not. Measure-and-report only — never files a tracker item or opens a PR."
argument-hint: "<ticket-key> | <surface> [--ab <before-env>:<after-env>] [--scale] [--load]"
disable-model-invocation: true
---

# /qa-perf-measure — Deployed-Environment Performance Measurement (interactive)

Prove, with evidence a reviewer can recompute, whether a request does more backend work than it needs
and whether a change moved it. Works on any request-serving surface (GraphQL xAPI, REST, Admin API) and
any dependency type (search, SQL, cache, outbound HTTP). Methodology + the concrete recipe live in the
[`/qa-perf-measure` skill](../skills/qa-perf-measure/SKILL.md) and
[`es-call-ab-method.md`](../knowledge/execution/es-call-ab-method.md); this file is the run order.

## Usage
```
/qa-perf-measure <ticket-key> --ab vcptcore-qa:vcst-qa   # A/B: pre-change build vs changed build
/qa-perf-measure <ticket-key>                            # temporal A/B on one env across its own deploy
/qa-perf-measure "product listing page" --scale           # characterize only: N+1 hunt, no A/B
/qa-perf-measure <ticket-key> --load                      # add the k6 throughput/p95 arm (one env)
```

> **Hard rule — measure-and-report only.** This flow ends at a report and a recommendation. Never file a
> tracker item, transition one, open a PR, or edit product code. A human decides what the numbers mean
> for the release.

> **Counts transfer across environments; latency does not.** Report call counts cross-env; take latency
> from one env only. Publishing a cross-env p95 comparison is a defect, not a finding.

---

## Phase 0 — Frame the question and establish the builds
1. Pick the instrument from the routing table in the skill. "Is this slow?" and "does this do redundant
   work?" are different measurements with different verdicts — commit to one before touching a query.
2. Confirm App Insights access: Azure MCP (`applicationinsights`) **or** `APPINSIGHTS_APP_ID_*` +
   `APPINSIGHTS_API_KEY_*` (`npm run env:check`). Neither → **STOP**.
3. For an A/B, confirm both builds from the login-page version (never `/health`) and the
   `vc-deploy-dev@<env-branch>` → `backend/packages.json` pin. Temporal A/B: boundary in **UTC**, with a
   guard band on both sides.

## Phase 1 — Build the harness
> **Owner:** `qa-backend-expert`.
- Byte-identical request text sent straight to each backend — never through two storefronts.
- Fixed input shape; fixtures verified to actually exercise the path (the four-condition filter — an
  `addItem` that silently no-ops leaves you measuring nothing).
- Uniquely named operations so a **harness log line** maps back to what produced it — telemetry names the
  route (`POST graphql/`), not the operation, so attribute a per-request row to its arm **by window**.
- **Rotate targets — one distinct target per repetition**, so every observation is cache-cold. A repeated
  target measures the platform cache, not the code.
- **Include the paired controls in the same run**: a positive control (N byte-identical calls in one
  request — must collapse) and a negative control (N calls differing in one argument — must not).
- Discovery warms its targets: discover, then measure *different* ones.

## Phase 2 — Count
> **Owner:** `qa-backend-expert`.
- Run the `requests ⋈ dependencies` join on `operation_Id` (skill reference §3) over each arm's window —
  the **same absolute window on both legs** (never `ago(...)` on one and a literal on the other, which
  silently joins nothing and reports a false floor).
- Carry `totalDeps` as the control on every row. Report **per-request rows**, not just an average.
- **Counting pass: keep every row.** Discard-the-first-request is the *latency* rule (cold start); applying
  it to a count throws away the discriminating cold observation. Rotate targets instead (reference §4).
- Budget 3–4× the volume on a traffic-carrying env — sampling is asymmetric against an idle baseline.

## Phase 3 — Attribute (Gate)
- A drop alone does not attribute itself to the change. **The positive control must have fired and the
  negative control must have held**, in the same window. If not, the measurement is inconclusive — say
  so; do not publish the delta.
- Prefer a within-one-env contrast (vary only the input property under study) before relying on a
  cross-env delta.

## Phase 4 — Read the residual
- Vary the input size: **scales** → N+1, batch it; **flat > 1** → distinct call shapes, collapse or
  cache; **flat = 1** → at the floor. Name the category — a request-scoped dedup does nothing for an
  N+1 whose calls each carry a different key.
- Optional `--load`: k6 L2 for throughput/p95 on **one** env
  (`plugins/vc-perf/skills/perf-loadtest/`). Set `RESULTS_DIR="$PWD/.vc-perf/results"`.
- Ranking what to optimize next → delegate to `perf-analyst` (read-only).
- **Both need the separate `vc-perf` plugin, which is not enabled by default** (skill §Agent delegation).
  Not installed → report `--load`/L3 as unavailable and rank inline via `qa-backend-expert`; never
  substitute one-shot repeats for load, which measure cache warming. Phases 0–3 need nothing extra.

## Phase 5 — Report + STOP
- `reports/performance/{topic}-investigation-<date>.md` (category 10, 40–80 lines, cap 120), or a
  category-6 per-ticket report when the work is ticket-scoped.
- Required content: the question, both builds, per-arm numbers, the control outcomes, the residual
  reading + recommended lever, and an explicit **"not claimed"** list.
- A well-controlled **null** result is publishable. So is "counts moved, p95 didn't" — it redirects the
  next investigation.
- **STOP.** Present numbers + recommendation; the human decides.

---

## Rules
- Measure-and-report only — no tracker writes, no PR, no code edits
  (`feedback_subagent_external_writes`).
- Never invent a threshold or baseline for a call count (`feedback_never_hardcode_in_scripts`).
- Every figure re-traceable to its query, window and arm; state what was not measured.
- Deliverables carry the finding, not the story of getting there
  (`feedback_no_self_referential_commentary_in_deliverables`).
- Reports follow `.claude/rules/reports.md`; long logs via SendMessage, not on disk.
