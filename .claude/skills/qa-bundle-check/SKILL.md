---
name: qa-bundle-check
description: "[QA Methodology] Check a VirtoCommerce stable bundle (bundles/vN/package.json) for available module/Platform/Theme HOTFIXES — newer patch releases on the SAME major.minor line that the bundle has not yet picked up. Use when asked to verify a bundle is up to date, audit pinned versions, or check 'есть ли хотфиксы / are there newer patches'. Does NOT flag newer minors (a frozen bundle intentionally trails master)."
argument-hint: "vN | <package.json-url> [--json] [--no-platform] [--no-theme] [--no-trace] [--no-links|--links]"
---

# Bundle Hotfix Check

A VirtoCommerce **stable bundle** (`vc-modules/bundles/vN/package.json`) pins every
module, the Platform, and the storefront Theme to one coherent generation
(e.g. `v12` → Platform `3.917.x`). The recurring question is **not** "is each module
on the absolute latest release" — a frozen bundle is *meant* to trail `master`.
The real question is:

> For each pinned version `A.B.C`, has a newer **hotfix** `A.B.(C+n)` shipped on the
> **same `A.B` line** that this bundle hasn't absorbed yet?

That is the only comparison this skill makes.

## Why a deterministic script (not agents)

Version comparison is mechanical: parse JSON → query GitHub → compare integers.
LLM agents are the wrong tool here — slow, token-expensive, and non-deterministic
(a re-run can miss a module or misread a page). So:

- **Primary engine:** `scripts/hotfix/bundle-version-check.ts` does 99% of the work.
- **Agent fan-out is a FALLBACK only** — used when a module Id doesn't resolve to a
  repo (new/renamed module absent from the map) or the GitHub API is unavailable.

## Run it

```bash
npm run bundle:check -- v12        # short bundle name → bundles/v12/package.json
npm run bundle:check -- "https://github.com/VirtoCommerce/vc-modules/blob/master/bundles/v14/package.json"
# or directly:
npx tsx scripts/hotfix/bundle-version-check.ts "<vN | bundle-url>" [--json] [--no-platform] [--no-theme] [--no-trace] [--concurrency=N]
```

- Accepts a `github.com/.../blob/...` URL or a raw URL (normalized internally).
- `GIT_TOKEN` is read from `.env.local` (raises the GitHub limit to 5000 req/h;
  without it the API caps at 60/h and the run will likely rate-limit → exit 2).

### How it works (`scripts/hotfix/bundle-version-check.ts`)

1. Fetch + parse the bundle: modules from `Sources[].Modules[]` (`{Id, Version}`),
   `PlatformVersion` → repo `vc-platform`, and the version embedded in the
   `ThemeB2BVue` download URL → repo `vc-frontend`.
2. Resolve each `Id` → GitHub repo via **`config/module-repo-map.json`** (a cache, not a
   hand-maintained allowlist — many repo names are irregular: `Contracts`→`contract`,
   `Xapi`→`x-api`, `ApplicationInsights`→`app-insights`, `FileSystemAssets`→
   `filesystem-assets`, `PageBuilderModule`→`pagebuilder`, …).
   **The module set varies per bundle (vN), so the map always lags.** Any `Id` absent from it
   is **auto-resolved at runtime**: the tool generates repo-name candidates (kebab, drop-`Module`,
   collapsed casing, singular) and verifies each by checking the bundle's **pinned tag exists** in
   it (one call proves both repo + version line). The discovered mapping is **persisted back into
   the map** (self-healing), so the next run is deterministic and free. Only an `Id` that no
   candidate resolves is flagged `⚠ unresolved` → exit 2 (then use the agent fan-out below).
3. For each target, confirm the pinned tag exists, then probe `A.B.(patch+1)`,
   `A.B.(patch+2)`, … until a `404` (GitHub git-ref existence check). The highest tag
   that exists on the line is the answer — cheap (1–3 calls each), no pagination.
4. **Provenance (hotfixes only):** for every new patch above the pinned one, read the
   GitHub release notes to find the PR that produced it, fetch that PR, and extract the
   JIRA task key(s) from its title / branch / body (regex `[A-Z]{2,}-\d+` → linked as
   `JIRA_BASE_URL/browse/KEY`, default `virtocommerce.atlassian.net`). If a release has
   no notes (e.g. theme releases with `body: null`), it falls back to diffing
   `prev..tag` and mining commit messages for PR refs + task keys. Disable with
   `--no-trace`. Set `JIRA_BASE_URL` to point at a different tracker.

### Output & exit codes

| | Meaning |
|---|---|
| `✓ current` | pinned == highest patch on its line — nothing to do |
| `⬆ HOTFIX AVAILABLE → X.Y.Z` | a newer same-line patch exists; bundle should bump |
| `⚠ unresolved` / `✗ line-missing` | repo/version couldn't be verified — see fallback |

- Exit `0` = all current · `1` = ≥1 hotfix available · `2` = tool error / unresolved.
- `--json` emits `{ bundle, checkedAt, counts, results[] }` (each hotfix result carries
  `traces[]` → `{ version, date, releaseUrl, prs[{number,title,url,taskKeys,taskUrls}], commitTaskKeys }`).
- When hotfixes exist the table is followed by a **provenance list** — per module, each
  new patch with the PR that raised it and the JIRA task it links to, e.g.:
  `3.815.4 (2026-06-23) — PR #162 "VCST-5328: …"` / `task: VCST-5328, VP-9216`.
  The PR number and each task key are emitted as **OSC 8 terminal hyperlinks** — the
  label itself is clickable (VS Code / Windows Terminal / iTerm2) when stdout is a TTY.
  Piped/redirected output (and `--no-links`) falls back to `label (url)` so the URL is
  never lost; `--links` forces hyperlinks even when piping.

## CI gating

`bundle:check` is exit-code driven, so it drops into a pipeline directly: run it
against the current stable bundle on a schedule (or on bundle PRs); exit `1` means
"new hotfixes to absorb", exit `2` means "the check itself needs attention" (an
unmapped module or an auth/rate-limit problem) — treat those differently.

## Fallback: still-unresolved repo (agent fan-out)

Runtime auto-resolution (step 2 above) handles the normal "new module" case and self-heals the
map. This fallback is only for an `Id` that **even auto-resolution couldn't crack** (the repo
name matches none of the generated candidates, e.g. an unusual rename), shown as `⚠ unresolved`
/ `✗ line-missing`:

1. Find the correct repo: web-search `VirtoCommerce vc-module-* <ModuleName>`, or open
   `https://github.com/VirtoCommerce/<repo>/releases` for likely variants.
2. Confirm the pinned tag exists and probe the next patch directly:
   `https://github.com/VirtoCommerce/<repo>/releases/tag/A.B.(C+1)` (200 = hotfix exists, 404 = current).
3. **Add the verified mapping to `config/module-repo-map.json`** (and, if the candidate
   generator should have caught it, widen `repoCandidates()` in the script).

Only when several modules are unresolved at once, parallelize step 1–2 across a few
`general-purpose` agents (one batch each) — but still record the results back into the map.

## Reporting

This is tooling output, not one of the five tracked report categories
(`.claude/rules/reports.md`) — print the table to the user / CI log; do **not** create a
file under `reports/`. If a hotfix matters for a release decision, it flows into the
normal release/regression report, not a standalone bundle file.

## Maintenance

- `config/module-repo-map.json` is a **self-healing cache** — the tool appends auto-resolved
  modules to it (verified against `v12`/`v14` on 2026-06-23). It should rarely need hand-editing;
  if it does, that means `repoCandidates()` missed a naming variant worth adding.
- Tag scheme assumed: bare `Major.Minor.Patch` (VC's release convention). If a repo ever
  switches to `v`-prefixed tags, adjust `tagOf()` in the script.
