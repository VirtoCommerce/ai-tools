# Evidence Capture & Root-Cause Synthesis — Operational Companion

> **This is the runnable companion to [`bug-investigation-flow.md`](bug-investigation-flow.md).**
> That file is the *reference* (decision trees, VC patterns P1–P8, source archaeology, KQL). **This** file
> is the *protocol*: a single ordered pass that captures **all** evidence into one package, then a worksheet
> that forces each root-cause claim to be backed by that evidence. Run Part A during reproduction; fill
> Part B before you write the bug report.
>
> **Why this exists:** the weak point isn't knowing *where* evidence lives — it's (1) capturing it
> *completely and in one pass* (the trace/operation ID is unrecoverable once the tab moves on), and
> (2) turning a pile of artifacts into a *defensible* root cause instead of stopping at "API returned 500".

---

## 0. Bundle the package first — `scripts/bundle-evidence.ts`

Before you start capturing, scaffold the evidence package so every artifact lands in one place with a
manifest:

```bash
# scaffold a package for the ticket (run once, at the start of repro)
npx tsx scripts/bundle-evidence.ts VCST-5391 --sprint=Sprint-current --browser=chrome \
  --symptom="extendedPrice null after editing a configured item"

# …capture evidence into the printed package dir (Part A)…

# re-scan and report what's still missing (run before writing the report)
npx tsx scripts/bundle-evidence.ts VCST-5391 --sprint=Sprint-current --check
```

> **In `vc-fix`:** `scripts/bundle-evidence.ts` is full `vc-qa` plugin only, not shipped here.
> Create the package dir by hand at the path in "Package location" below (`reports/tickets/<TICKET>/evidence-<UTCstamp>/`
> — `vc-fix` has no sprint context, so always use the ad-hoc path), with `screenshots/ network/ console/ har/`
> subfolders, and write `evidence-index.md` / `root-cause.md` yourself following the manifest/worksheet
> shapes below (Part A's table is the `evidence-index.md` checklist; Part B is `root-cause.md`). There is
> no `--check` completeness script — self-verify against Part A's **M** rows before writing the bug report.

What the script does (full `vc-qa` plugin only):
- Resolves `TEST_ENV` and pre-fills the **env header** (TEST_ENV, FRONT_URL/BACK_URL, ENV_RISK) into the
  manifest — no hardcoding.
- Creates the package dir + subfolders: `screenshots/ network/ console/ har/ source/`.
- Auto-discovers raw browser artifacts already in `test-results/<browser>/` (HAR, video, console logs) and
  **references** them in the manifest by path (HAR/video are big + gitignored — referenced, not copied;
  small JSON/console captures you save into the package are kept).
- Writes `evidence-index.md` (the manifest/checklist with the mandatory-artifact slots + the **trace-ID
  slot**) and `root-cause.md` (the worksheet from Part B).
- `--check` re-scans the package and prints a **completeness report**: which mandatory slots are still
  empty, whether the trace ID is filled, and whether the worksheet's alternatives are ruled out. A clean
  `--check` is the gate before you write the bug report.

Package location (matches `output-paths.md`):
- `--sprint=<S>` → `tests/<S>/<TICKET>/evidence-<UTCstamp>/`
- otherwise → `reports/tickets/<TICKET>/evidence-<UTCstamp>/` (ad-hoc, no sprint context)

---

## Part A — Evidence Capture Protocol (run during reproduction)

Capture in this order **on the reproducing run** — not afterward. Each row says the exact tool and where the
artifact goes in the package. **Mandatory** rows must exist before you can name a root cause; **conditional**
rows fire only when the trigger applies.

| # | Artifact | Trigger | Tool / source | Lands in | M/C |
|---|----------|---------|---------------|----------|-----|
| 1 | **Failure-state screenshot** (annotated) | always | `browser_take_screenshot` | `screenshots/` | **M** |
| 2 | **DOM snapshot** at failure | always | `browser_snapshot` → save text | `screenshots/dom-*.txt` | **M** |
| 3 | **Network capture** — full request list | always | `browser_network_requests` → save JSON | `network/requests.json` | **M** |
| 4 | **The failing request** — URL, method, payload, status, response body | any 4xx/5xx/`errors[]`/wrong-data | `browser_network_request` (single) → save JSON | `network/failing-<op>.json` | **M** |
| 5 | **Trace / operation ID** of the failing request | any server-side component | read `Request-Id` / `traceparent` response header in row 4 → write into manifest slot | `evidence-index.md` | **M\*** |
| 6 | **Console messages** tied to the action | always | `browser_console_messages` → save (errors+warnings only) | `console/console.json` | **M** |
| 7 | **HAR file** | always (auto-captured by browser config) | reference `test-results/<browser>/har/*.har` | manifest link | **M** |
| 8 | **Admin SPA console** (Angular zone errors) | Admin-UI symptom | Chrome DevTools `list_console_messages` | `console/admin-*.json` | C |
| 9 | **REST cross-check** (call the API directly) | "GraphQL wrong — is REST too?" | `browser_evaluate` `fetch()` / Postman+Newman | `network/rest-crosscheck-*.json` | C |
| 10 | **App Insights trace** for the op ID | any REST/xAPI/Admin/job layer | Azure MCP `applicationinsights` KQL (flow §9) → save result | `network/appinsights-<opId>.json` | **M\*** |
| 11 | **Hangfire** Failed/Scheduled state | "didn't happen" symptom (P8) | `{BACK_URL}/hangfire` screenshot | `screenshots/hangfire-*.png` | C |
| 12 | **Deployed versions** (platform + modules + theme) | always (header + P1 + §8C) | per `profile.buildVerify.source` (`tracker-ops.md` §5): native → **`vc-deploy-dev` `backend/packages.json` + `theme/artifact.json`** via GitHub MCP (branch = `TEST_ENV`: `vcst-qa`/`vcptcore`/`virtostart`); client → `{BACK_URL}/api/platform/modules`. `{BACK_URL}/#!/workspace/systeminfo` is a live cross-check | manifest header | **M** |
| 13 | **Source evidence** (file path + line + quote) | browser/logs don't explain it | GitHub MCP `search_code` / `get_file_contents` (flow §8) | `source/findings.md` | C |
| 14 | **Reproduction rate** (X/10) | intermittent | note in manifest | `evidence-index.md` | C |

> **M\*** — mandatory *whenever a server-side layer is involved*. A storefront-only CSS bug needs no trace
> ID or App Insights; anything touching REST/xAPI/Admin/jobs does. When in doubt, capture it.

### Capture rules that prevent the usual misses

- **The trace ID is the join key — grab it during repro (row 5).** It turns a browser 500 into a full
  server-side root cause (rows 10, §9). It's gone once you navigate away. This is the single most-skipped,
  most-expensive-to-recover artifact.
- **Capture the *failing* request body, not a summary.** Quote the 2–3 fields that matter in the report;
  keep the full JSON in the package (`reports.md` §6 — reference, don't inline).
- **"GraphQL wrong" is not a root cause until you've checked REST (row 9).** REST right + GraphQL wrong =
  xAPI resolver layer; REST also wrong = module/data. This one check decides the repo (`bug-investigation-flow.md` §3 Step 5).
- **One pass, one package.** Don't scatter screenshots at repo root or across tabs — everything goes under
  the package dir the script printed. `reports.md` budgets still apply (1 failure-state + 1 context shot is
  usually enough; the package can hold the rest as referenced raw artifacts).
- **No hardcoding in captures.** Env/URLs come from the manifest header (resolved by the script); entities
  are referenced by `@td()` alias, not pasted IDs.

---

## Part B — Root-Cause Synthesis Worksheet (`root-cause.md`)

Pattern-matching against P1–P8 gives you a *hypothesis*. This worksheet is what turns it into a *conclusion*.
Fill every section; an empty "Alternatives ruled out" or a claim with no evidence citation is an incomplete
investigation, not a root cause.

```markdown
## Root-Cause Worksheet — VCST-XXXX

### 1. Symptom (one line, observable)
<what a user sees — not the cause>

### 2. Lowest failing layer (lowest wins)
Network tab said: [ ] storefront-only  [ ] xAPI/GraphQL  [ ] REST  [ ] module/data  [ ] infra
Decided by: <which captured artifact proved the layer — cite row # from Part A>
→ repoKind: <frontend | module | platform>  → repo: <vc-frontend | vc-module-x-… | vc-module-… | vc-platform>

### 3. Evidence → claim chain (every claim cites evidence)
| # | Claim | Evidence (artifact in package + the exact value) |
|---|-------|--------------------------------------------------|
| 1 | <e.g. "addItem returns extendedPrice: null"> | `network/failing-addItem.json` → `data.addItem.items[0].extendedPrice == null` |
| 2 | <server threw, not the client> | `network/appinsights-<opId>.json` → `NullReferenceException` in `CartLineItemBuilder` |
| 3 | <the line that does it> | `source/findings.md` → `CartModule .../LineItemService.cs:142` missing null-guard |

### 4. The "why" in one sentence
<Because X, Y happens — the causal link, not a restatement of the symptom.>

### 5. Alternatives ruled out (MANDATORY — at least the obvious 2)
| Alternative hypothesis | How it was ruled out |
|------------------------|----------------------|
| By-design / config-gated | <checked source / setting / VirtoOZ doc — cite> |
| Env data drift (stale index, missing fixture, orphaned org) | <checked Admin / @td fixture / org exists> |
| Flaky / timing (race, ES lag, cache) | <repro rate X/10; passes-on-retry? §10> |
| Version skew (P1) | <compared systeminfo across good/bad env> |

### 6. Regression archaeology (only if "used to work" / post-deploy / version skew)
- Introduced in: <repo> commit <sha> (PR #NNN, "<title>", merged <date>)  — flow §8C
- Last good: <ver / env / green REG-ID>   First bad: <ver>
- Why it broke: <intended change vs. the side effect that became this bug>
- Diff plausibly explains the symptom AND lands in the window? [ ] yes  (correlation ≠ causation)

### 7. Confidence
[ ] HIGH — server-side proven (trace + exception + source line) or DOM-vs-response proven for frontend
[ ] MEDIUM — strong evidence, one link inferred
[ ] LOW — hypothesis only → keep investigating or escalate; do NOT name a repo in the handoff

### 8. Fix Routing handoff (for /qa-fix Gate 1)
owning layer · repoKind · exact repo · file:line (if known) · revert-safe vs fix-forward
```

### The confidence bar before you name a repo

Name a `repoKind`/repo in the Fix Routing block **only at MEDIUM+**, and only when:
- the **lowest failing layer** is proven by a captured artifact (Part A row #), not assumed; and
- at least the two obvious **alternatives are ruled out** (by-design, data drift); and
- for a server-side bug, the **trace ID + App Insights exception** corroborate the browser symptom; and
- for a regression, the introducing diff **explains** the symptom *and* sits in the window (§8C).

LOW confidence is a valid, honest outcome — hand off "symptom + layer + what's left to check" rather than a
guessed repo. A wrong route costs the fixer more than an honest "needs more investigation".

---

## How this maps onto the 5-phase flow

| Flow phase (`bug-investigation-flow.md`) | This file |
|------------------------------------------|-----------|
| §1 Resolve TEST_ENV | script pre-fills the manifest header |
| §2 Reproduce | Part A runs *during* the reproducing pass |
| §3 Isolate layer | Part A rows 3–4–9 feed worksheet §2 |
| §4 + §9 Gather all logs | Part A rows 1–12 (the ordered pass) |
| §7 Patterns P1–P8 | worksheet §5 alternatives + §3 claims |
| §8 Source / §8C archaeology | Part A row 13 → worksheet §3 / §6 |
| Document & hand off | worksheet §8 → Fix Routing block |
