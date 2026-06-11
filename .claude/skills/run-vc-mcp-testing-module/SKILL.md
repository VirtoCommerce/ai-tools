---
name: run-vc-mcp-testing-module
description: Build, launch, smoke-test, and health-check the vc-mcp-testing-module agentic QA tooling repo. Use when asked to run, start, verify, smoke-test, or sanity-check this repo's tooling — env:check, @td() resolution, suite manifest sync, critical-UI-scope, seed dry-run, GraphQL fixture validation — or before running regression.
---

# Run: vc-mcp-testing-module

This repo is **not** a GUI/web/server app. It is an **agentic QA system** for the
Virto Commerce storefront: a collection of Node/tsx CLI scripts plus
agent/skill/command/CSV definitions that drive the *storefront* through MCP
browser servers and the Claude Agent SDK. There is nothing of its own to open in
a browser — the only thing you can launch and observe here is **the tooling**.

So "running this project" means one of two things:

1. **Health-check the tooling** (offline, fast, no secrets) — the `driver.mjs`
   harness below. **This is the agent path. Start here.**
2. **Actually drive the storefront** (regression) — `npm run ci:*` / the
   `/qa-*` slash commands. Needs `ANTHROPIC_API_KEY`, a live `BACK_URL`/`FRONT_URL`,
   and browsers. Costs money and hits a live env — documented but not run by this skill.

> Paths below are relative to the repo root (`<unit>/`). The driver lives at
> `.claude/skills/run-vc-mcp-testing-module/driver.mjs`.

## Prerequisites

- **Node 18+** (verified on `v22.22.0`) and npm (verified `11.14.1`).
- Dependencies installed:
  ```bash
  npm install
  ```
- No OS packages needed for the offline harness — it is pure Node/tsx, no browser,
  no `xvfb`. (Verified on Windows 11 / PowerShell; the driver is cross-platform.)

## Run (agent path) — the offline harness

One command runs every offline-verifiable entry point and prints a pass/fail table:

```bash
node .claude/skills/run-vc-mcp-testing-module/driver.mjs
```

Verified output this session (`7/7 checks OK`, exit 0):

```
▶ env:check … PASS (exit 0) — APPINSIGHTS_RESOURCE_STOREFRONT: SET (len=18)
▶ td-refs … PASS (exit 0) —   No bare GUID/ID literals found. ✓
▶ scope … PASS (exit 0) — [scope:validate] Suites scanned: 103 CSV file(s) under regression\suites/
▶ suites:lint … PASS (exit 0) — [suites:lint] OK (104 suites, 35 selections)
▶ seed:dry-run … PASS (exit 0) — ✅ Seed complete!
▶ graphql:fixtures … PASS (exit 1) — Markdown report: …/reports/graphql-fixtures-validation.md
▶ graphql:labels … PASS (exit 0) — ✅ No findings …
```

(Counts drift as suites are added — they were 103 CSVs / 104 manifest suites / 35
selections this run. The driver asserts exit codes, not counts, so it keeps
passing as the repo grows.)

List checks without running, or run a subset by name substring:

```bash
node .claude/skills/run-vc-mcp-testing-module/driver.mjs --list
node .claude/skills/run-vc-mcp-testing-module/driver.mjs td scope
```

What each check guards (all run from the repo root):

| Check | Underlying command | Asserts |
|-------|--------------------|---------|
| `env:check` | `node get_variables_env.js` | 33 env vars reported SET/EMPTY (exit 0 even if some EMPTY) |
| `td-refs` | `npx tsx scripts/validate-td-refs.ts` | every `@td()` ref across all suites resolves; no bare GUID/ID literals |
| `scope` | `npx tsx scripts/validate-critical-ui-scope.ts` | critical-UI-scope matrix cells point at existing test IDs |
| `suites:lint` | `npx tsx scripts/sync-test-suites.ts --check` | `config/test-suites.json` matches CSVs on disk |
| `seed:dry-run` | `node scripts/seed-test-data.js catalog --dry-run` | seed planner resolves fixtures, makes no API writes |
| `graphql:fixtures` | `npx tsx scripts/validate-graphql-fixtures.ts` | every `.graphql` fixture validates vs cached schema |
| `graphql:labels` | `npx tsx scripts/review-graphql-labels.ts <csv>` | runner-native GraphQL CSV has balanced labels |

The driver calls these scripts **directly** rather than via their `npm run`
aliases on purpose — see Gotchas.

**Editing a specific suite?** Most changes here touch CSV suites, not code. Lint
just what you changed instead of the whole driver — the label linter takes a file
**or** a directory:

```bash
npx tsx scripts/review-graphql-labels.ts regression/suites/Backend/graphql/
```

(Verified: scans 16 files / 300 runner-native cases, exit 0 when balanced.) For
non-GraphQL CSV edits, re-run the `td-refs` and `suites:lint` checks:
`node .claude/skills/run-vc-mcp-testing-module/driver.mjs td-refs suites`.

## Run (real storefront regression) — needs secrets + live env

Not run by this skill (needs API key + live env + browsers, costs money). For
reference, the real entry points are:

- Interactive: the `/qa-regression`, `/qa-smoke`, `/qa-test` slash commands
  (see `.claude/rules/regression.md`).
- Headless CI: `npm run ci:smoke` / `ci:critical` / `ci:full`
  (`ci/run-regression.ts`, Claude Agent SDK). Requires `ANTHROPIC_API_KEY`,
  `BACK_URL`/`FRONT_URL`, and `npx playwright install chromium firefox`.

## Gotchas

- **Several `npm run` aliases are bash-only and break on Windows cmd.exe.**
  `npm run schema:check` fails with `The system cannot find the path specified.`
  because its script ends in `> /dev/null`. The `ci:*` aliases use inline
  `VAR=val cmd` syntax that cmd.exe also can't parse. The driver sidesteps this
  by invoking the scripts directly (`npx tsx scripts/…`) — do the same if you run
  a check by hand on Windows.
- **`graphql:fixtures` exits 1 when a fixture has drifted — that is findings, not a crash.**
  As of this session 66/67 pass; `test-data/graphql/queries/products.graphql`
  reports 2 errors (known schema drift). The driver treats exit 0 **and** 1 as
  "ran OK"; only a missing-file / crash exit is a real failure.
- **The GraphQL schema cache is a local artifact, not committed.**
  `scripts/.graphql-schema.cache.json` (~1.4 MB) is not tracked by git. A fresh
  clone has no cache, so `graphql:fixtures` can't validate until you regenerate it
  with `npx tsx scripts/validate-graphql-fixtures.ts --refresh` — which needs
  `BACK_URL` in `.env` (live platform). On a machine that already ran against the
  env (like this one) the cache exists and the check runs fully offline.
- **`.env` files are layered and partly gitignored.** `env:check` reads them via
  the layered loader (`.env.defaults` → `.env.${TEST_ENV}` → `.env.local` → `.env`).
  Some vars showing `EMPTY` (e.g. `BROWSERSTACK_*`, 3DS cards) is expected — those
  are optional. `env:check` still exits 0.
- **`.mcp.json` is gitignored** — create it locally before any browser-driven run.
  Irrelevant to the offline harness.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `The system cannot find the path specified.` from `npm run schema:check` | Bash-ism (`> /dev/null`) under Windows. Run the script directly: `node scripts/refresh-graphql-schema.mjs --dry-run`. |
| `graphql:fixtures` fails with file-not-found / schema cache missing | Regenerate the cache: `npx tsx scripts/validate-graphql-fixtures.ts --refresh` (needs `BACK_URL` in `.env`). |
| `tsx: not found` / `command not found` | `npm install` — `tsx` is a devDependency. |
| Driver reports a check as `FAIL (exit ERR:ENOENT)` | `node`/`npx` not on PATH, or you ran the driver outside the repo. Run from repo root with Node 18+. |
