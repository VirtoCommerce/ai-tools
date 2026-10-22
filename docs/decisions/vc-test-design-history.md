# `vc-test` — superseded decisions

Normative text: [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../superpowers/specs/2026-10-15-vc-test-plugin-design.md) §2.
This file keeps the earlier wording of decisions the owner later revised, so the spec's tables carry only what
holds now. Moved out of the spec on 2026-10-22 (review of the spec).

| # | Earlier decision | Revised by |
|---|---|---|
| U13 | **The orchestrator writes the checklist, inline** — it already holds the bundle and the strategy, and a subagent would need them retold | O2 (2026-10-21): VCST-6314's main session was 18% of the run at 2.5M output, so a narrow agent writes a thin checklist |
| U15 | **A delta strategy built anew each round** | 2026-10-21: round N ≥ 2 is a refresh — nothing round 1 built is rebuilt, new material is appended as risks |
| U18 | **Yes — after the verdict, then one run of the new cases only** (owner, revising redesign D2 for this flow). The single author is the **`test-management-specialist` agent** (fresh context, Sonnet; its brief is file paths — checklist with results and evidence, strategy, bug reports — so nothing is retold, and the orchestrator never writes the corpus): cases from the passing checklist items and from every bug's reproduction (`Catches:` that bug). One wave runs only the new cases. A new case that fails is a defect **of the case** — fixed or marked, never a change to the verdict, which was decided on the checklist. Cases land in the project's agent-native corpus; a client's own suites (Playwright, TestRail, …) are untouched | U27 (2026-10-21): a new case is a passing scripted check kept as a `.spec`, so there is no new-case wave |
| U31 | **One command, depth by risk.** A simple ticket is fast because its strategy selects little, not because someone picked a lighter mode. QA and developers run the same command and find the same bugs | U35 (2026-10-21): the developers' chat — a separate developer command on the same engine |
