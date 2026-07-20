---
description: "Refresh the storefront sitemap (.claude/knowledge/domain/sitemap.md) from the live environment. Runs the deterministic xAPI crawler (scripts/maintenance/refresh-sitemap.mjs), diffs against the committed snapshot, and — only when something changed — rewrites the volatile sections, bumps the rev, appends a changelog row, and syncs the vc-fix plugin mirror. Diff-gated: no change ⇒ no write."
argument-hint: "[--check] [--no-browser]"
disable-model-invocation: true
---

# /qa-sitemap — Refresh the storefront sitemap

Keeps `.claude/knowledge/domain/sitemap.md` current against the live storefront. Intended to run **once per sprint** (it is wired into `/qa-test-plan` Step 0), but safe to run anytime.

Two halves:
- **Deterministic core** — `scripts/maintenance/refresh-sitemap.mjs` (npm `sitemap:refresh`): pulls structure + versions over xAPI GraphQL + the Platform modules API. No browser, CI-safe. Writes a **per-environment** snapshot `.claude/knowledge/domain/sitemap-snapshot.<env>.json` (env = resolved `TEST_ENV`, or `--label`) and prints a diff vs the previous snapshot for that env.
- **Write-up (this command)** — reads the diff and, only if it is non-empty, rewrites the affected sections of `sitemap.md` in prose, bumps the rev, appends a changelog row, and syncs the plugin mirror.

## Flags

| Flag | Effect |
|------|--------|
| `--check` | Run `sitemap:check` only (verify the env is reachable + queryable, print the diff, write nothing). No edits. |
| `--no-browser` | Skip the optional browser pass that fills the SPA-rendered theme "Ver." and refreshes per-category counts. Structure + platform version still update. |

## Environment (vcst vs a client deployment)

The crawler is **env-driven and portable to any VC deployment** — the queries are standard xAPI + Platform APIs, present regardless of theme customization (incl. a client `vc-frontend` fork). Target selection:
- **Default (vcst):** `npm run sitemap:refresh` → baseline `sitemap-snapshot.vcst.json`, write-up target `sitemap.md`.
- **A configured client env:** `TEST_ENV=<name> npm run sitemap:refresh` (uses their `.env.<name>` — `FRONT_URL`/`BACK_URL`/`STORE_ID`) → baseline `sitemap-snapshot.<name>.json`.
- **Ad-hoc, no env file:** `node scripts/maintenance/refresh-sitemap.mjs --front <url> --back <url> --store <id> --label <name>`.

Per-env snapshots mean a client run **never clobbers the vcst baseline** or reports a false whole-catalog "changed". Two conditions for a client run: (1) `STORE_ID` is required (no default — it is per-deployment); (2) only run against a client env with **their authorization** — read-only, but it is their data (client-containment, `.claude/rules/quality-gates.md` §2a). Admin creds are optional (platform version degrades to null without them).

> **Write-up for a non-vcst env:** `sitemap.md` (and its plugin mirror) is the **vcst** storefront doc. For a client env, write a **client-scoped** doc (e.g. `sitemap.<name>.md`) from that env's snapshot — do **not** overwrite the vcst `sitemap.md`, and do **not** sync a client doc into the plugin mirror (Step 4 is vcst-only).

---

## Pipeline

### Step 1 — Run the deterministic crawler

```
npm run sitemap:refresh
```

Read its stderr diff block and the final `SITEMAP_CHANGED=yes|no` trailer. The script captures, over xAPI (`childCategories`, `products.totalCount`) + the authed `/api/platform/modules`:

- `navCategories[]` — the store "All products" nav tree (slug + name)
- `productsWithOptions[]` — children of `/products-with-options`
- `platform.maxPlatformVersion` + `platform.moduleCount` — the VC platform assembly line
- `storeTotalProducts` — store-wide product total
- `themeVersion` — best-effort; usually `null` because the footer "Ver." is SPA-rendered

**Diff gate:** if `SITEMAP_CHANGED=no`, report "sitemap already current (rev N)" and **STOP** — do not touch `sitemap.md`. This is the common, correct outcome on a quiet sprint.

### Step 2 — Optional browser pass (skip with `--no-browser` or `--check`)

Two facts the deterministic core can't get:
1. **Theme "Ver."** — navigate `playwright-chrome` to `{FRONT_URL}/` and read the footer `Ver. X` text (real-user `browser_snapshot`, not `evaluate` — the `enforce-real-user` hook blocks arbitrary DOM eval; read-only `getBoundingClientRect`/`getComputedStyle` are the only allowed eval shapes).
2. **Per-category counts** (only if the diff shows category adds/removes worth re-counting) — the live `/catalog` grid tiles carry counts; the xAPI virtual-catalog ids don't map cleanly to `category.subtree`, so counts come from the grid, not the API. Counts are informational only — the doc says never assert on them.

Use one browser session, close it when done.

### Step 3 — Rewrite the volatile sections (only if changed)

Edit `.claude/knowledge/domain/sitemap.md`, touching **only** what the diff flagged. Section → snapshot-field map:

| sitemap.md section | Source |
|---|---|
| Header "Storefront (theme) version" / §13 | `themeVersion` (browser) + `platform.maxPlatformVersion` / `moduleCount` |
| §3 Top-Level Categories | `navCategories[]` (+ grid counts from the browser pass) |
| §4 Seed categories | the `/seed-*` slugs within `navCategories[]` |
| §5 `/products-with-options` | `productsWithOptions[]` |
| §11 "All products" dropdown / inline nav | `navCategories[]` |
| §14 estimates | counts derived above |

Discipline (honor `.claude/rules/reports.md` brevity + `feedback_env_resilience`):
- **Bump the rev** (`rev N` → `rev N+1`) and the **Generated** date in the header + the footer "Last Updated".
- **Append one changelog row-set** under a new `## Changelog (vs. <prev date> rev N)` block — deltas only (added/removed/renamed slugs, version bumps). Do not rewrite prior changelog blocks.
- Keep the **guest-crawl caveat** and the **"not re-verified this rev"** note honest — say which sections you actually touched.
- Never assert exact prices/IDs; counts are "as of <date>" snapshots, flagged as drift candidates.

### Step 4 — Sync the plugin mirror

`plugins/vc-fix/knowledge/domain/sitemap.md` is a maintained duplicate (self-contained plugin copy). Copy the updated file over it, then re-apply its **one** intentional divergence — Note #1 uses path-free wording (no `.claude/rules/...` reference):

```
cp .claude/knowledge/domain/sitemap.md plugins/vc-fix/knowledge/domain/sitemap.md
```
then Edit the plugin copy's Note #1 back to: "Treat any hardcoded IDs/slugs/SKUs as drift candidates — resolve entities by querying the live system instead." Verify with `diff` that only that one line differs.

> The `sitemap-snapshot.<env>.json` files live **only** under `.claude/` — QA-tooling artifacts, not plugin assets. Do not copy them into `plugins/vc-fix/`.

### Step 5 — Report

```
Sitemap refresh — {CHANGED | already current}

Env: {env} @ {FRONT_URL}
Rev: {old} → {new}   (or: unchanged, rev N)
Changes: {n categories added/removed/renamed, version bumps}
Files: .claude/knowledge/domain/sitemap.md (+ snapshot), plugins/vc-fix/.../sitemap.md
```

The committed `sitemap-snapshot.<env>.json` is written by the script in Step 1 (when not `--check`/`--dry-run`) — it becomes the baseline for next sprint's diff for that environment.

---

## Rules

- **Diff-gated.** No structural/version change ⇒ no edit to `sitemap.md`, no rev bump. A quiet sprint is a clean no-op.
- **Deterministic first.** Structure + platform version come from the script (reproducible, CI-safe). The browser is used only for the theme "Ver." and optional counts.
- **Read URLs/creds from env** (`config.js` layering) — never hardcode `vcst-qa…` hosts. Admin token uses password grant with **no** `client_id` and never prints the password.
- **SPA caveat:** every storefront path returns the 200 shell, so HTTP status can't confirm existence — judge from the xAPI `childCategories` set / `/catalog` grid, never from a curl status.
- **Real-user browser rule:** the `enforce-real-user` hook blocks arbitrary `browser_evaluate`; use `browser_snapshot` / read-only measurement eval only.
- Keep the plugin mirror in sync (Step 4) — the two copies differ only in Note #1.
