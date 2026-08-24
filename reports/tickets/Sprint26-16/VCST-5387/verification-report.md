# VCST-5387 — Verification Report

**Ticket:** [VCST-5387](https://virtocommerce.atlassian.net/browse/VCST-5387) — Stream catalog image/file binaries during Export/Import instead of embedding base64 in JSON
**Type:** Story · **Verdict:** PASS WITH NOTES · **Date:** 2026-08-19
**Env:** vcptcore-qa1 — Platform `3.1061.0-pr-3099-829a`, Catalog `3.1042.0-pr-904-2bfa`, BackupRestore `3.1004.0-pr-5-2048`, theme `2.55.0`
**Result:** 19 of the 21 cases written for this ticket executed, **0 failed**, 2 not executed (justified below)

## 1. What was being verified

The change replaces inline base64 binaries in the catalog export with streamed side-car entries. It spans three
repos and only works when all three are installed together, so the first job was getting a matched build set onto
an environment: Platform [#3099](https://github.com/VirtoCommerce/vc-platform/pull/3099),
Catalog [#904](https://github.com/VirtoCommerce/vc-module-catalog/pull/904),
BackupRestore [#5](https://github.com/VirtoCommerce/vc-module-backup-restore/pull/5) — all open at the time.

The story declares no numbered acceptance criteria. The de-facto spec is the assignee's 2026-08-11 comment
(final architecture + a 10-step QA procedure), which supersedes the two earlier comments. All 21 test conditions
were derived from that comment plus the three PR diffs.

## 2. Delivery

Deployed via [vc-deploy-dev#6389](https://github.com/VirtoCommerce/vc-deploy-dev/pull/6389) (merged 13:28Z).
Both deploy Actions went green ~2 min **before** the new build actually served traffic, so the landing was
confirmed by polling `/api/platform/modules` for the target versions rather than trusting `/health`.

Two earlier attempts are worth recording as dead ends: a deploy PR to `vcst-qa` (#6373) pinned artifacts that
were rebuilt the next day and went stale, and `vcst-qa` additionally had a pending release-baseline PR (#6384)
touching the same manifest lines. vcptcore-qa1 was chosen because it carried no other ticket's PR builds — only
two AI-module pins, both preserved.

## 3. Method

All verification was done through the platform REST API and by inspecting the produced ZIP packages
programmatically. No browser was used: the feature has no UI surface, and package contents, checksums and
reference graphs are all better checked as data than by eye.

**Fixture** (`AGENT-TEST-BKRS5387` catalog): a category, a product and a variation, each carrying one image and
one file asset; one relative URL shared between the category and the variation (dedup case); one external
absolute URL on the product. Contents are **real files** — repo bug screenshots 78–224 KB and two real PDFs.
An initial pass used synthetic 77–80 byte stubs; every packaging assertion was re-verified against real content
before the restore tests.

**Large assets:** two 90 MiB incompressible files (deflate ratio 1.0003) on two *different* entities — split
deliberately, since that is what exercises the "memory scaled with asset size **and batch size**" claim. 200 MiB
was prepared but cannot be uploaded: Cloudflare caps the request body at 100 MB (413), and 90 MiB is the largest
that passes — measured, not assumed.

**Memory instrument:** Grafana, Kubernetes workload `vcptcore-qa1-platform`, **per-pod** series (two replicas —
a deployment average would halve any spike). Pods run at ~520–560 MiB against a 4 GiB limit, so buffering
180–240 MB would *not* have caused an OOM: a container restart is not a valid detector here, only the graph
delta is. Noise floor ~10–15 MiB, calibrated from the two 90 MiB uploads which moved the pods by +13 and +11 MiB.

## 4. Results

| Area | Cases | Evidence |
|---|---|---|
| Module load | 001 | Both modules `isInstalled=true`, `validationErrors` empty, 91 modules healthy — despite `module.manifest` demanding a prerelease `platformVersion` string |
| Package shape | 002–005 | Readable JSON (not a nested ZIP); 1050 `assets/<sourceUrl>` entries keeping hierarchy/names/extensions; zero SHA256 `.bin`; a reference per asset and **zero non-null inline `binaryData`**; references ↔ entries consistent both ways (0 dangling, 0 orphaned) |
| Dedup / external | 006, 007 | Shared URL → 1 entry / 2 references; external URL byte-identical with no reference and no entry |
| Round trip | 008, 009, 019 | Blobs deleted (confirmed 404) → restored byte-identical by SHA256, associations intact; re-proven on two 90 MiB assets |
| Flag gating | 012 | Flag off → 3 entries, no `assets/`, no references, 504 KB vs 63 MB; flag-off restore recovers no binaries |
| Backward compat | 013, 014, 015 | All three legacy shapes import: plain JSON with inline base64, nested package with SHA256 `.bin`, nested package with readable paths |
| Path safety | 016 | 7 hostile references all rejected (`..`, `./`, backslash, no prefix, empty, control char, percent-encoded traversal); **zero stray files outside the asset root** |
| Error policy | 010, 020 | Missing blob → warning, export succeeds, module not errored, entity exported without that binary; non-participating module keeps its own plain-JSON part |
| Bounded memory | 018, 019 | See below |

**Bounded memory — the core claim.** Export: 5 back-to-back exports pushed **900 MiB** of incompressible assets
in 3.5 min; pod went 559 → 559 MiB with a +4 MiB peak. Buffering would have reached ~1.4 GiB by run 5. A single
export lasts only ~30 s, which at ~1 min sampling could fall between samples — hence the sustained series, so a
flat result cannot be dismissed as a missed peak. Import: a restore streaming 180 MiB back moved the executing
pod 511 → 544 MiB (**+33 MiB**), which also covers writing 594 entities to the DB; the ramp is *visible* on the
graph, so this is a measured magnitude, not an argument from silence.

Memory does not return to baseline immediately — that is lazy GC release plus container page cache with no
pressure at a 4 GiB limit, not a leak. The series is what rules out accumulation.

## 5. Not executed (2)

- **017** — the `_failedEntries` guard (a reference that failed once must not be silently rewritten with different
  content). Not reachable through the API: a blob write cannot be broken mid-stream from outside. Also **not
  covered by unit tests** — `BackupRestoreManagerBinaryDataTests.cs` holds only 2 tests, both happy-path. This is
  the one branch of the feature confirmed neither by test nor by live run.
- **021** — BackgroundJobs regression. Belongs to VCST-5490 (Task, Done), not to this ticket; its files left the
  #904 diff once #903 merged to `dev` on 2026-08-18.

## 6. Findings

| # | Finding | Severity | Disposition |
|---|---|---|---|
| F8 | BackupRestore has 2 happy-path unit tests only; `_failedEntries` guard and `BinaryDataEntryPath.Validate` untested | low | review note on #904 |
| F7 | `DoExportAsync_BlobReadFailure_ReportsErrorAndContinuesWithRemainingFiles` asserts the opposite of its name (`Errors.Should().BeEmpty()` + one Warning) | trivial | review note on #904 |
| — | `CatalogModuleCategoriesController.cs` carries a whitespace-only diff (+4/−4) | trivial | review note on #904 |
| F6 | A failed backup leaves a 0-byte artifact in `backups/` | low | filed as [VCST-5756](https://virtocommerce.atlassian.net/browse/VCST-5756) |
| F2 | Prerelease `platformVersion` coupling — feared to block module load | — | **cleared** by 001 |
| F1 | Suspected scope creep (VCST-5490 files in #904) | — | **withdrawn**: resolved by #903 merging; the original check predated that merge |

Two further pre-existing platform defects were observed and deliberately left unreported per the operator's
decision. Both reproduce on a release build and neither is caused by this change.

## 7. Reproducing this

!!! note
    The suite has since been widened beyond this ticket to cover the BackupRestore module as a
    whole (74 cases), and renamed accordingly. The 21 cases described in this report are the
    ticket-scoped subset. See the suite itself for the current scope.

Test cases: `regression/suites/Backend/import-export/096-backup-restore.csv` (the 21 cases written for this ticket, `Draft` at the time of writing,
deliberately unregistered in `config/test-suites.json` — registering unexecuted Draft cases would enrol them in
`full`/`backend` selections and fail other runs against environments lacking the feature).

Structured record: `summary.json` in this folder. Fixture and all backup artifacts were cleaned up afterwards;
the `backups/` folder was left empty and the fixture verified 6/6 byte-identical.

One environment caveat for anyone re-running this: the qa1 asset store is **read-after-write lagged** — blobs
verified present read back 404 moments later and vice versa. Lag produces false *negatives*, so it cannot inflate
a positive result, but absence-based assertions were additionally backed by package structure rather than timing.
