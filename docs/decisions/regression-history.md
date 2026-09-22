# Regression — retired designs and incident record

> Rationale and history moved out of `.claude/rules/regression.md` on 2026-09-08. Never loaded into an agent context; read by humans deciding whether to re-create something.

### 3. ~~Autonomous Interactive Regression (Agent Teams)~~ — REMOVED 2026-08-26

There was a second interactive orchestrator (`autonomous-regression-orchestrator` +
`autonomous-test-runner`, ~500 lines, plus a private `scripts/regression/reporting.ts`). It is gone,
and this tombstone records why so it is not re-created:

- **Its output went where nothing reads.** It wrote `results/{RUN_ID}/`; every consumer reads
  `reports/regression/{RUN_ID}/`. So an autonomous run got no live HTML dashboard, no
  `/qa-triage-results`, no `history.json` flakiness feed, no `reap-stalled-run` backstop and no
  `compute-metrics` quality gate — it had a parallel reporting module instead.
- **It had drifted.** Its fallback chain was still `chrome → firefox → edge`; the manifest was
  reordered to put firefox LAST on 2026-08-05 precisely because firefox cannot click on this
  storefront, so firefox in second place burned a retry. It also named firefox the *preferred*
  browser for Smoke and Payment, and knew nothing of `clickDriven` or `regression:plan`.
- **Its one unique feature contradicted policy.** Auto-filing JIRA from a regression run, while
  `/qa-triage-results` and `/qa-monitoring` both deliberately stop at drafting.

What was kept: the graduated rate-limit guard and the 30/60s backoff ladder, now in
`.claude/agents/regression-orchestrator.md` Step 5. Mode 2 (headless CI) and mode 1 (interactive)
remain; the interactive one is the path in daily use.

## Shared-tree losses

The measured incidents, 2026-08-28 and 2026-09-01. They were the evidence for the shared-tree **git
prohibition**, which was **RETIRED 2026-09-10** by operator decision and no longer exists in any tier;
the surviving rule is one-author-per-suite-CSV
([`.claude/knowledge/execution/regression-suites.md`](../../.claude/knowledge/execution/regression-suites.md)
§Working concurrently on suites). This is the only record of the incidents themselves.

**1. `git checkout --theirs -- .` reverted the whole tree (2026-08-28).** Reached for as "recovery"
after a `git stash` collision in the shared tree, it reached files it had no interest in and reverted
**every tracked file** to HEAD — destroying a completed 161-insertion suite re-pointing and 14 rule
edits belonging to other sessions. Single authorship would not have prevented it: the command was run
by the file's own author, and its blast radius was the whole tree — which is why the git prohibition
was stated *before* the one-author rule for as long as it existed.

**2. `commit all` published a second session's work (2026-08-28).** One session's user authorised a
tree-wide commit; it carried a second session's fixture work, suite fix, aliases and bug reports —
without that session's user being asked. It landed cleanly only because that half happened to be
gate-green at that minute; a patched assertion had landed moments earlier and the same command could
as easily have caught the file mid-edit. Treat the good outcome as luck, not as evidence the practice
is safe.

**2b. The calibration case (2026-09-01).** `reports/regression/test-run-status.json` was committed
mid-run and read as a repeat of incident 2, until checking showed it has been tracked for 100+ commits
and matches no ignore rule — so every commit touching that path has always recorded whatever state it
was in. That is untidiness, not the failure. The distinction has to stay sharp: a rule that flags
everything flags nothing.

**3. Two agents, one suite (2026-08-28).** Two `test-management-specialist` agents in two sessions
were given suite `083d` minutes apart. Combined with incident 1 the same day, that suite lost a
completed 161-insertion re-pointing twice over. Neither loss was a merge conflict; both were two
writers where the tree assumed one.

**4. One unparsable CSV blocked two sessions for ~15 minutes (2026-08-28).** A
`CSV_INVALID_CLOSING_QUOTE` at line 871 of one suite took `suites:sync` and `suites:lint` down for
every author in the tree. The author who caused it did not know it was blocking anything — it looked
like a local parse failure.

**5. Two coordination messages were dropped silently (2026-08-28).** Both carried load-bearing
environment facts to another session's subagent; both were treated as untrusted system-reminder
content and declined, and neither side saw a rejection.

## Run-infrastructure failures (REG-2026-09-18-1818, 2026-09-18/19)

A sprint-26-18 Frontend run (24 suites / 896 cases) was paused twice by an org API spend limit and
triaged across the gap. The product findings live in
`reports/regression/REG-2026-09-18-1818/triage-report.md`; what follows is only what went **wrong with
the machinery**, because each item is silent when it happens and cost real rework here.

**1. The dashboard watcher marked a rate-limit-paused run as `stalled`.**
`scripts/regression/generate-regression-html-report.ts:1957` calls `markRunStalled` once
`DEFAULT_IDLE_LIMIT_MS` (45 min, `scripts/regression/reap-stalled-run.ts:35`) elapses with no artifact
movement. The orchestrator was alive the whole time — it was waiting out a 429, and a paused agent
writes nothing, which is byte-for-byte what a dead one looks like. The flag landed at
`2026-09-18T22:07:10Z` with reason `no progress for 45 min (...:in_progress:17:676:640)` — note the run
was still `in_progress` when it was overwritten. **Everything downstream inherited it:** the triage was
written as a post-mortem on an aborted run, `tc:promote` refused on `PR-013`, and the run was twice
described to the operator as dead while it was still producing results. **A pause and a stall are not
distinguishable by artifact mtime, and the watcher decides as if they were.** If this is re-touched, the
idle rule needs a signal that separates "no progress" from "no permission to progress" — or it should
propose rather than write.

**2. `suites:merge` turned an unterminated fragment into a clean `0/0/0/0`.**
When a runner agent died mid-suite (before its Phase-5 write), merging its fragment produced a canonical
`suite-*-results.json` reporting zero cases and zero failures — i.e. **a suite that never ran read as a
suite that ran and found nothing.** Caught by the orchestrator during close-out, which archived the
partials to `partial-interrupted/` and re-merged them as honest `lane_lost` BLOCKED placeholders. This is
the same failure shape as the `recordHar.path` directory bug: the artifact exists, looks healthy, and is
wrong in the one direction nobody re-checks. **A merge that consumes a fragment with no terminator must
not emit a clean zero.**

**3. HAR capture recorded no request/response bodies, on every lane, for as long as the configs existed.**
`recordHar.omitContent: true` was set on all four interactive lanes
(`config/mcp-playwright-*.config.json`, including `mobile`) **and** on
`ci/config/mcp-playwright-chrome.ci.json` — the template every CI lane derives from, so the headless pool
was affected too. Measured: `grep -c salesRepCustomerCounts session.har` returned **0** for a request that
demonstrably occurred. That silently defeats `.claude/rules/reports.md` section 8, which directs a report
to reference the HAR for exactly this evidence; a verifier had to re-capture GraphQL documents by hand.
**Fixed 2026-09-19** — all five now use `content: "embed"` (`omitContent` is deprecated *and* body-less).
A/B on Playwright 1.62, same 11 requests: `omitContent` gave 0 bodies / 23 KB; `content: "embed"` gave 5
bodies / 634 KB. Confirmed live post-restart: 139 entries, 132 with bodies, 11 of 11 GraphQL request
documents recoverable. Guarded in `scripts/unit/playwright-lane-configs.test.mjs` and
`scripts/unit/lane-mcp-config.test.ts` (the latter also asserts the field survives lane derivation).
**Cost of the fix: roughly 28x HAR size.** `recordHar.urlFilter` is the lever if that becomes a problem;
it was deliberately not used, because asset-404 evidence would be the first casualty.

**The fix being CORRECT is not the same as the fix being IN FORCE — see incident 9.** A day later, a
long-running MCP server was still emitting body-less HARs from the old config while every file-level
check said the change was in place. Do not read this entry as "HAR bodies are captured"; read it as
"the configs are right", and verify the live artifact per 9 before relying on a HAR for payload evidence.

**4. A seeder mutated a shared store setting mid-run and manufactured two P1s.**
`scripts/seed-data/b2b/set-membership-roles-whitelist.mjs` was being developed and run against
`B2B-store` while the regression was in flight. `Customer.MembershipRolesWhitelist` went through a state
where `organization.assignableRoles` returned `[]`, which bricked the Invite-member and Change-role
dialogs and produced two **P1** classifications (`B2C-MBR-004`, `B2C-MBR-008`) plus roughly 12
cascade-BLOCKED cases. Both survived agent classification at MEDIUM confidence and only dissolved under
live verification, which proved the resolver correct and whitelist-driven (byte-identical output on two
stores). Timeline: failure captured 18:24:10Z, seeder pre-state 18:54:32Z, commit at 19:05Z. **The
platform exposes no settings-change log** (`/api/platform/changelog/operations` and
`/api/platform/operationlog` both 404), so this is a mechanism-and-timeline argument, not a replay. **A
shared store setting is run-visible state; writing one while any run is live invalidates it.**

**5. Per-lane credential isolation was nominal, not real.**
`.env.playwright.local` provisions only `AGENT_SLOT1_PASSWORD`. Slots 2 and 3 and `personal` have no
password, so affected suites silently fell back to the slot's B2B account. No functional loss this run,
but the three-slot isolation the browser pool is built on did not exist, and nothing reported it.

**6. `carts:check` false-positives on every multi-org account — second confirmation.**
Its groupKey is `(customerId, storeId, currency)` and ignores `organizationId`, so per-org carts read as
competing carts. `carts:sweep --apply` would therefore **delete a legitimate company cart**
(BL-B2B-005). Recorded in this run's own pre-flight note *and* independently re-found at close-out. It
has now been documented twice and fixed zero times.

**7. A browser lane read as broken when the config was already correct.**
`playwright-firefox` timed out on every pointer action at Playwright's `visible, enabled and stable`
gate. `config/mcp-playwright-firefox.config.json` already carried
`widget.windows.window_occlusion_tracking.enabled=false`; the **running MCP server predated the config**,
and `browser_close` plus relaunch does not reload it. A verifier reasonably concluded the lane was down
and fell back to another server. The whole remedy was an MCP restart, after which 2 of 2 clicks including
a navigation succeeded. **MCP config changes need a server restart — check that before concluding a lane
is broken.** Separately, the orchestrator reports the sticky stall recurred about 6 times per suite
*during* the run while producing zero BLOCKED verdicts, so the lane was degraded throughout rather than
failing cleanly.

**8. Resuming into the same `RUN_ID` mixed two executions in one folder.**
After the first pause the orchestrator resumed and wrote into `REG-2026-09-18-1818` alongside the
already-triaged results. Three different totals were then in circulation for one run — disk
`432/38/305/121`, the HTML dashboard `458/38/279/121` (its generator normalises a `done` case into the
pass bucket), and the orchestrator's close-out `534/42/249/132` (taken before it archived the interrupted
partials). All three were defensible and none was wrong; they simply counted different things at
different moments. **FAIL was stable at 38 throughout, which is why the triage held.** A fresh `RUN_ID` on
resume would have kept the two executions separable.

**9. A config fix can be correct on disk and absent from the running server, with no signal at all.**
Measured 2026-09-19, during `REG-2026-09-19-1035`, and it is the second failure mode of incident 3.

Every `config/mcp-playwright-*.config.json` carried `content: "embed"`, `grep` found no `omitContent`
anywhere in the repo, and the change had been verified live on the firefox lane the previous night
(139 entries, 132 with bodies). Yet while the run was in flight:

| lane | entries | response bodies | GraphQL with document |
|---|--:|--:|--:|
| `playwright-mobile` (driven fresh) | 108 | **104** | **6 / 6** |
| `playwright-firefox` (serving suite 097) | 208 | **0** | 0 / 15 |

Same config file, same repo state, opposite output. The firefox HAR parsed cleanly — so that context
*had* closed, and this was not a mid-write artifact — and every entry carried the old shape:
`response.content` with `size`/`mimeType`/`compression` and **no `text`**, `request.postData.text`
empty. That is `omitContent` behaviour from a server whose process predates the fix.

**The operative distinction: `/mcp` "Reconnected" re-attaches the client; it does not guarantee the
server process re-reads its config.** The operator reconnected all three lanes before this run and the
message said `Reconnected to playwright-firefox.` — which reads exactly like a restart and is not one.
A long-lived MCP server can therefore serve a stale config indefinitely while every file-level check a
reviewer would run says the fix is in place.

This generalises incident 7, where the *reverse* mistake was made: the firefox click stall was read as
a broken lane when the config was already correct and only a restart was missing. Both directions have
now cost time, and the same one-line rule settles both: **a config file is evidence of intent, never
evidence of effect — verify against a live artifact the server just produced.** For HAR that is one
command against a lane that is idle:

```
node -e "const h=require('./test-results/<lane>/har/session.har');const e=h.log.entries;console.log(e.length,'entries,',e.filter(x=>x.response?.content?.text!=null).length,'with bodies')"
```

**Consequences carried by this run:** suites executed on firefox and edge in `REG-2026-09-19-1035`
produced body-less HARs, so `.claude/rules/reports.md` §8's "reference the HAR" path is degraded for
those lanes exactly as it was the night before. Traces still carry console and network summaries, so
triage is not blind. The servers were **not** restarted mid-run — that would have killed three
in-flight suites — so the remedy is deferred to run close-out, and any HAR-based evidence from those
two lanes should be treated as unavailable rather than as proof of absence.

### The methodological result worth keeping

Of the six P1 candidates agent classification produced from run artifacts, **three were not product bugs
at all**, and two more had their root cause or severity materially corrected once reproduced live. One
(`MSNF-030`) was falsified from component source: the control renders *units remaining*, not the absolute
target, so the "storefront promises a reward the backend will not honour" reading was wrong. That finding
also invalidated an already-approved CSV correction **before it was applied** — and the wrong correction
would have *passed*, because on an empty cart `remaining` equals `target`. Classification from artifacts
is a hypothesis generator. **Phase 4 live verification is not optional polish; it is what separates a
finding from a plausible story.**

## Tooling failures found in the follow-up (2026-09-19)

### 10. `bl:remap` reported `0 case(s) in 0 file(s)` for citations that existed

`npm run bl:lint` reported `BL-CFG-003` cited by 4 cases in `072e-configurable-products-conditional-sections.csv`;
`npm run bl:remap -- --propose BL-CFG-003` reported **zero**, for the same id in the same corpus. Raw grep
sided with the lint. Because only one of the two tools can write, the four `BL-CFG-*` ids were left
baselined in `BLC_002_BASELINE` as debt that could not be burned down by the sanctioned path.

Root cause was in `bl:remap`, not in the data, and the full write-up lives in that file's header comment
(`scripts/knowledge/remap-bl-citations.ts` §THE BOM INCIDENT) — not restated here. Two things are worth
recording at this level:

**The failure mode is the one this repo keeps paying for: a tool that is wrong and silent.** The guard that
dropped the files was `if (ci < 0 || ii < 0) continue;` — no report, no count, no exit code. A zero from a
tool that cannot say which files it failed to read is not a measurement, and it was believed for long
enough to get written into a baseline comment as a permanent disagreement between two tools. `lint-bl.ts`
had already learned this lesson and encoded it as **BLC-005** (`buildCoverage` returns `unparsed` rather
than swallowing it, after the same class of bug produced 3 false BLC-004 findings); `bl:remap` carried the
identical hazard with no equivalent report. The fix therefore has two halves — strip/restore the BOM, *and*
report every skipped suite — and splits the report into `legacy` (a known corpus class, exit 0) and
`unreadable` (a real anomaly, exit 1), because a warning that fires on every run is a warning nobody reads.

**Fixing the first defect exposed a second that the tool's own verification could not see.** With discovery
working, applying the 14 citations rewrote **111 of 111 lines** and dropped 1,140 bytes: `ser()` re-quoted
minimally, stripping quotes from every cell that did not strictly need them, across columns the tool's own
SAFETY block promises never to touch. Its post-write check passed — it compares *parsed* values, which were
identical. That is the right check for correctness and the wrong one for churn, and in a repo where a suite
CSV has exactly one author per change and a conflict in one is **never** resolved with git, the diff
footprint *is* a correctness property. After the fix the same operation touches 14 lines and +126 bytes
(14 × `PROPOSED-`), with the BOM and all 651 CRs byte-identical.

Regression tests: `scripts/unit/remap-bl-citations.test.ts` (6 tests, mutation-checked — reverting either
half of the fix fails them). Both tools now agree id-for-id and case-for-case; `BLC_002_BASELINE` shrank
from 9 entries to 5, and `BL-SEC-001`/`BL-SEC-002` were tightened to their measured counts (6→3, 3→1)
because the ratchet accepts a shrink silently, so an entry left above its real count is headroom the next
drift can grow into unnoticed.
