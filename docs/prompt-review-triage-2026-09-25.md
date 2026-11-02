# Prompt-review triage — 2026-09-25

`/prompt-review all` snapshot at `17afe09` (branch `claude/skills-prompt-review-g63rlo`). **A dated snapshot, not a
live count** — sizes and hits move with every edit; regenerate before acting on a row (command at the end).
Method and column meanings: [`.claude/skills/prompt-review/SKILL.md`](../.claude/skills/prompt-review/SKILL.md)
Step 1, [`review-dimensions.md`](../.claude/skills/prompt-review/review-dimensions.md) §Collect.

## Summary

- **125** prompt files scanned — 81 under `.claude/`, 44 under `plugins/*/` (commands, agents, `SKILL.md`).
- Cap read from `npm run context:report` (`BUDGET.promptBodyChars`), never transcribed into the check.
- **6 breaches — all in `plugins/vc-fix/`**: over the cap and in no baseline, because BUDGET-004
  (`context:check`) scans only `.claude/`. Nothing gates them today.
- **26** `.claude/` files over the cap, all in `scripts/maintenance/.prompt-size-baseline.json` (shrink-only).
- **0** DOC-002/003/004/006 findings under `.claude/`.

## How to read the columns

| Column | Meaning | Reliability |
|---|---|---|
| chars | loaded-whole size | exact |
| BREACH | over cap **and** not in the baseline | exact; for `plugins/*` it is *ungated*, not a build failure |
| over | chars above the cap | exact |
| DOC | `context:check` DOC findings (`.claude/` only) | exact |
| unres / dangling | citation-sweep hits / of those, names found nowhere in the repo | **noisy** — sampled hits were runtime artifacts (`project-profile.json`, `.mcp.json`), gitignored files, template names and other-repo paths; not used for ranking |
| badBL | `BL-*` ids with no heading in `business-logic.md` | candidate — `qa-design`'s 3 are ids labelled *proposed* |
| grep (slug) | grep-pack hits (memory slugs) | candidate |

## Recommended next runs

1. `/prompt-review plugins/vc-fix/skills/project-init` — 3.9× the cap, loaded whole on every customer `/project-init`;
   the `.claude/` copy is ~2.7× smaller, so the two copies have diverged far — the divergence itself needs a decision.
2. `/prompt-review plugins/vc-fix/commands/qa-bug.md` — `qa-triage-results` now depends on its Steps 1, 4, 5.
3. `/prompt-review plugins/vc-fix/commands/qa-fix.md`
4. `/prompt-review plugins/vc-fix/commands/qa-verify-fix.md`
5. `/prompt-review qa-test-lifecycle` — largest in-repo prompt; 5 memory-slug hits; the Phase 4c caller of `qa-review-bl`.

**Structural decision pending:** extend BUDGET-004 to `plugins/*` (a `lint-claude-docs.mjs` change + baseline
entries for the six breaches) so plugin prompts stop growing unobserved.

## Full table

Sorted by breach → overage → DOC → dangling → unresolved → grep. Paths drop `.claude/` and `/SKILL.md`.

| file | chars | BREACH | over | DOC | unres | dangling | badBL | grep (slug) |
|---|---|---|---|---|---|---|---|---|
| `plugins/vc-fix/skills/project-init/` | 74530 | YES | 55530 |  | 48 | 46 |  | 11(0) |
| `plugins/vc-fix/commands/qa-bug.md` | 45341 | YES | 26341 |  | 16 | 7 |  | 2(1) |
| `plugins/vc-fix/commands/qa-fix.md` | 35605 | YES | 16605 |  | 20 | 4 |  |  |
| `plugins/vc-fix/commands/qa-verify-fix.md` | 32258 | YES | 13258 |  | 36 | 7 |  | 1(1) |
| `plugins/vc-fix/skills/vc-self-check/` | 20835 | YES | 1835 |  | 6 | 6 |  |  |
| `plugins/vc-fix/agents/fullstack-frontend.md` | 19866 | YES | 866 |  | 15 | 4 |  |  |
| `commands/qa-test-lifecycle.md` | 66378 |  | 47378 |  | 40 | 13 |  | 8(5) |
| `commands/qa-test.md` | 59883 |  | 40883 |  | 23 | 2 |  |  |
| `skills/qa-review-tests/` | 42360 |  | 23360 |  | 8 |  |  | 2(1) |
| `skills/qa-test-cases-generator/` | 41956 |  | 22956 |  | 9 | 1 |  | 4(0) |
| `commands/qa-regression.md` | 40256 |  | 21256 |  | 17 | 5 |  | 1(0) |
| `agents/ui-ux-expert.md` | 38962 |  | 19962 |  | 11 | 4 |  | 3(3) |
| `agents/ba-doc-writer.md` | 35455 |  | 16455 |  | 33 | 14 |  | 1(1) |
| `agents/ba-system-analyzer.md` | 34993 |  | 15993 |  | 9 | 2 |  | 1(0) |
| `skills/qa-seed-data/` | 32650 |  | 13650 |  | 41 | 5 |  | 5(5) |
| `skills/qa-design/` | 30203 |  | 11203 |  | 6 | 1 | 10 |  |
| `agents/qa-lead-orchestrator.md` | 29780 |  | 10780 |  | 7 | 2 |  | 4(0) |
| `agents/regression-orchestrator.md` | 28838 |  | 9838 |  | 10 | 5 |  | 5(0) |
| `skills/vc-self-check/` | 27413 |  | 8413 |  | 6 | 3 |  |  |
| `skills/qa-test/` | 27346 |  | 8346 |  | 7 | 2 |  | 3(1) |
| `skills/project-init/` | 27249 |  | 8249 |  | 11 | 10 |  | 1(0) |
| `agents/test-management-specialist.md` | 26828 |  | 7828 |  | 10 |  |  | 1(0) |
| `commands/qa-design.md` | 26649 |  | 7649 |  | 2 | 1 |  | 2(2) |
| `commands/qa-exploratory.md` | 25791 |  | 6791 |  | 5 | 2 |  |  |
| `agents/ba-story-writer.md` | 25412 |  | 6412 |  | 5 | 1 |  |  |
| `skills/qa-local-env/` | 25254 |  | 6254 |  | 2 | 2 |  |  |
| `skills/qa-review-oracles/` | 23362 |  | 4362 |  | 5 |  | 1 | 4(3) |
| `commands/qa-test-plan.md` | 23298 |  | 4298 |  | 3 | 1 |  | 1(1) |
| `skills/qa-hotfix-check/` | 22708 |  | 3708 |  | 7 | 6 |  | 1(0) |
| `skills/qa-hotfix/` | 22230 |  | 3230 |  | 5 | 3 |  |  |
| `commands/ba-analyze.md` | 21490 |  | 2490 |  | 8 | 2 |  |  |
| `agents/qa-testing-expert.md` | 19282 |  | 282 |  | 11 |  |  |  |
| `plugins/vc-fix/commands/qa-env-check.md` | 13704 |  |  |  | 8 | 8 |  |  |
| `plugins/vc-fix/commands/project-init.md` | 13482 |  |  |  | 10 | 7 |  |  |
| `plugins/vc-perf/commands/perf-init.md` | 4550 |  |  |  | 6 | 5 |  |  |
| `agents/fullstack-backend.md` | 13223 |  |  |  | 18 | 4 |  |  |
| `plugins/vc-fix/agents/fullstack-backend.md` | 13838 |  |  |  | 18 | 4 |  |  |
| `agents/fullstack-frontend.md` | 17169 |  |  |  | 15 | 4 |  |  |
| `skills/qa-coverage-gap/` | 17691 |  |  |  | 11 | 4 |  | 1(0) |
| `plugins/vc-fix/skills/qa-investigate/` | 7756 |  |  |  | 10 | 4 |  |  |
| `skills/qa-investigate/` | 9048 |  |  |  | 8 | 4 |  |  |
| `commands/qa-smoke.md` | 13598 |  |  |  | 6 | 4 |  | 1(0) |
| `skills/qa-deploy-pr/` | 12358 |  |  |  | 5 | 3 |  | 3(3) |
| `skills/vc-shell-fix/` | 11206 |  |  |  | 5 | 3 |  |  |
| `plugins/vc-fix/skills/vc-shell-fix/` | 11203 |  |  |  | 5 | 3 |  |  |
| `skills/vue-unit-test/` | 5104 |  |  |  | 4 | 3 |  |  |
| `plugins/vc-fix/skills/vue-unit-test/` | 5076 |  |  |  | 4 | 3 |  |  |
| `plugins/vc-fix/skills/qa-fix-routing/` | 4679 |  |  |  | 10 | 2 |  |  |
| `plugins/vc-fix/commands/qa-monitoring.md` | 6987 |  |  |  | 6 | 2 |  | 6(4) |
| `agents/ba-api-specialist.md` | 18937 |  |  |  | 5 | 2 |  |  |
| `skills/qa-perf-measure/` | 14070 |  |  |  | 4 | 2 |  | 8(7) |
| `skills/vue-fix/` | 4616 |  |  |  | 4 | 2 |  |  |
| `plugins/vc-fix/skills/vue-fix/` | 4588 |  |  |  | 4 | 2 |  |  |
| `plugins/vc-perf/skills/perf-loadtest/` | 5189 |  |  |  | 4 | 2 |  |  |
| `commands/qa-teams-watch.md` | 10539 |  |  |  | 2 | 2 |  | 1(0) |
| `plugins/vc-fix/skills/qa-monitoring/` | 7647 |  |  |  | 2 | 2 |  | 1(1) |
| `commands/qa-hotfix-check.md` | 8553 |  |  |  | 2 | 2 |  |  |
| `plugins/vc-fix/agents/self-check-deliverer.md` | 6572 |  |  |  | 9 | 1 |  |  |
| `commands/qa-sitemap.md` | 11559 |  |  |  | 8 | 1 |  | 1(1) |
| `agents/backend-reviewer.md` | 6185 |  |  |  | 7 | 1 |  |  |
| `plugins/vc-fix/agents/backend-reviewer.md` | 6171 |  |  |  | 7 | 1 |  |  |
| `agents/frontend-reviewer.md` | 7301 |  |  |  | 6 | 1 |  |  |
| `plugins/vc-fix/agents/frontend-reviewer.md` | 7274 |  |  |  | 6 | 1 |  |  |
| `skills/qa-monitoring/` | 5418 |  |  |  | 5 | 1 |  | 1(1) |
| `skills/qa-api/` | 13980 |  |  |  | 3 | 1 |  |  |
| `plugins/vc-perf/commands/perf-fix.md` | 3512 |  |  |  | 3 | 1 |  |  |
| `plugins/vc-fix/agents/self-check-diagnostician.md` | 11077 |  |  |  | 2 | 1 |  |  |
| `commands/qa-perf-measure.md` | 6572 |  |  |  | 1 | 1 |  | 3(3) |
| `commands/qa-triage-results.md` | 12560 |  |  |  | 1 | 1 |  | 1(1) |
| `plugins/vc-fix/skills/vc-docs/` | 6258 |  |  |  | 1 | 1 |  | 1(0) |
| `skills/angular-admin/` | 9086 |  |  |  | 1 | 1 |  |  |
| `skills/qa-triage-results/` | 8676 |  |  |  | 1 | 1 |  |  |
| `plugins/vc-fix/commands/vc-feedback.md` | 2298 |  |  |  | 1 | 1 |  |  |
| `plugins/vc-fix/commands/vc-self-check.md` | 5567 |  |  |  | 1 | 1 |  |  |
| `plugins/vc-fix/skills/angular-admin/` | 9072 |  |  |  | 1 | 1 |  |  |
| `plugins/vc-perf/skills/perf-trace/` | 4213 |  |  |  | 1 | 1 |  |  |
| `agents/test-data-engineer.md` | 18005 |  |  |  | 18 |  |  |  |
| `agents/qa-backend-expert.md` | 16867 |  |  |  | 17 |  |  |  |
| `agents/qa-frontend-expert.md` | 13428 |  |  |  | 9 |  |  |  |
| `skills/qa-test-design/` | 6738 |  |  |  | 9 |  |  |  |
| `plugins/vc-fix/agents/qa-backend-expert.md` | 13265 |  |  |  | 9 |  |  |  |
| `skills/qa-generate-data/` | 18053 |  |  |  | 8 |  |  | 6(5) |
| `commands/qa-seed-data.md` | 7201 |  |  |  | 7 |  |  |  |
| `plugins/vc-fix/agents/qa-frontend-expert.md` | 10623 |  |  |  | 6 |  |  |  |
| `plugins/vc-fix/agents/qa-testing-expert.md` | 15065 |  |  |  | 6 |  |  |  |
| `plugins/vc-perf/skills/perf-loop/` | 9293 |  |  |  | 4 |  |  |  |
| `agents/test-runner-agent.md` | 18992 |  |  |  | 3 |  |  | 2(0) |
| `commands/qa-local-env.md` | 9430 |  |  |  | 3 |  |  | 1(0) |
| `skills/kb-report/` | 13161 |  |  |  | 3 |  |  | 1(0) |
| `skills/qa-evidence/` | 2714 |  |  |  | 3 |  |  |  |
| `skills/qa-sbtm/` | 10024 |  |  |  | 3 |  |  |  |
| `plugins/vc-fix/skills/qa-checklist/` | 16543 |  |  |  | 3 |  |  |  |
| `commands/qa-domain-map.md` | 15238 |  |  |  | 2 |  |  |  |
| `skills/qa-postman/` | 13569 |  |  |  | 1 |  |  | 2(0) |
| `skills/qa-accessibility/` | 11041 |  |  |  | 1 |  |  | 1(1) |
| `skills/qa-checklist/` | 18979 |  |  |  | 1 |  | 1 | 1(0) |
| `commands/qa-onboarding.md` | 10527 |  |  |  | 1 |  |  |  |
| `skills/dotnet-fix/` | 3727 |  |  |  | 1 |  |  |  |
| `skills/qa-bundle-check/` | 7517 |  |  |  | 1 |  |  |  |
| `skills/qa-plan/` | 3764 |  |  |  | 1 |  |  |  |
| `plugins/vc-fix/skills/dotnet-fix/` | 3699 |  |  |  | 1 |  |  |  |
| `plugins/vc-fix/skills/qa-risk/` | 3277 |  |  |  | 1 |  |  |  |
| `plugins/vc-perf/agents/perf-analyst.md` | 3300 |  |  |  | 1 |  |  |  |
| `commands/qa-review-oracles.md` | 13097 |  |  |  |  |  |  | 3(3) |
| `skills/prompt-review/` | 11464 |  |  |  |  |  |  | 3(0) |
| `skills/qa-metrics/` | 4061 |  |  |  |  |  |  | 1(0) |
| `skills/qa-storybook/` | 4641 |  |  |  |  |  |  | 1(1) |
| `skills/vc-docs/` | 7543 |  |  |  |  |  |  | 1(0) |
| `plugins/vc-perf/skills/perf-benchmark/` | 17363 |  |  |  |  |  |  | 1(0) |
| `commands/code-review-full.md` | 10194 |  |  |  |  |  |  |  |
| `commands/qa-bundle-check.md` | 2918 |  |  |  |  |  |  |  |
| `commands/qa-deploy-pr.md` | 3270 |  |  |  |  |  |  |  |
| `commands/qa-hotfix.md` | 7762 |  |  |  |  |  |  |  |
| `commands/qa-status.md` | 3591 |  |  |  |  |  |  |  |
| `skills/dotnet-unit-test/` | 5324 |  |  |  |  |  |  |  |
| `skills/qa-defect/` | 4553 |  |  |  |  |  |  |  |
| `skills/qa-review-bl/` | 2280 |  |  |  |  |  |  |  |
| `skills/qa-risk/` | 3325 |  |  |  |  |  |  |  |
| `plugins/vc-fix/agents/monitor-triage-agent.md` | 5292 |  |  |  |  |  |  |  |
| `plugins/vc-fix/skills/dotnet-unit-test/` | 5296 |  |  |  |  |  |  |  |
| `plugins/vc-fix/skills/qa-defect/` | 4540 |  |  |  |  |  |  |  |
| `plugins/vc-fix/skills/qa-evidence/` | 3010 |  |  |  |  |  |  |  |
| `plugins/vc-perf/commands/perf-benchmark.md` | 1240 |  |  |  |  |  |  |  |
| `plugins/vc-perf/commands/perf-loop.md` | 1079 |  |  |  |  |  |  |  |
| `plugins/vc-perf/commands/perf-verify.md` | 1694 |  |  |  |  |  |  |  |

## Regenerate

Run `/prompt-review all` in a session on this repo (triage-only, read-only). Not verified at snapshot time:
open PRs touching these files; product claims (triage mode does not check them).
