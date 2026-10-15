---
name: visual-compare
description: "Use after merging upstream vc-frontend into a theme fork (vc-frontend-next, a customer theme), or when asked to show or screenshot what a merge changed, to capture the same pages on upstream, the fork before the merge and the fork after it, and build one side-by-side HTML report with a pixel diff per page."
argument-hint: "[upstream ref] — defaults to the merge commit's second parent"
---

# visual-compare — upstream, fork before, fork after, side by side

A merge can pass types, tests and the build and still change what users see: a conflict resolved in
the wrong side's markup, an upstream style the fork's tokens no longer override. This skill serves the
three builds one at a time, screenshots the same pages in each, and measures before→after per shot.
**A page the merge was not meant to touch must come out unchanged**; every changed pixel has a reason
in the report.

The scripts are in this file's directory: `capture.mjs`, `run-variant.sh`, `report.mjs`, `login.mjs`,
`report-template.html`. Resolve them against **this file's directory**, not the working directory. They
need Node and Playwright (a project install, a global `playwright`, or `playwright-cli`; `lib.mjs` finds
it and falls back to the installed Chrome).

## 1. Pick the pages

The pages come from the merge, not from a fixed list. Read the merge's brief and log
(`upstream-merges/<date>-<ref>.md`) and take:

- every conflict whose file renders: the page that shows it, in the state that renders it (a breakpoint,
  the dark scheme, a pinned header, a filled list);
- every upstream feature in the range with UI, and every page a clean-but-risky file from the brief renders;
- the pages `fork-map.json` replaces (the fork's home, header), so the report shows upstream's version beside them;
- one or two baseline pages (home, sign-in): they must be pixel-identical.

Find real data on the backend the builds use before writing a step: a product with a variations list,
a configurable one, a category with several products, a simple product to add to the cart. Query its
GraphQL directly (`store(domain:"localhost") { storeId }`, then `products(...)`) rather than guessing slugs.

Write the scenarios to `upstream-merges/visual-scenarios.json` in the fork and commit it with the
merge's log: the next merge starts from it and edits it. The format:

```json
{
  "scenarios": [
    {
      "id": "compare",
      "title": "Compare page",
      "why": "compare-table.vue conflict: upstream's native table, the fork's tab group",
      "schemes": ["light", "dark"],
      "seed": {
        "keys": ["compareProducts"],
        "steps": [{ "goto": "/bolts" }, { "click": "button[aria-pressed='false'][aria-label*='compar' i]", "count": 4 }]
      },
      "steps": [{ "goto": "/compare" }]
    },
    { "id": "compare-stuck", "title": "Compare, header pinned", "why": "…", "fullPage": false,
      "steps": [{ "goto": "/compare" }, { "scroll": 700, "wait": 800 }] },
    { "id": "missions", "title": "Missions", "why": "…", "auth": true, "steps": [{ "goto": "/account/missions" }] }
  ]
}
```

- `viewports` defaults to `["desktop", "mobile"]` (1440 wide; 390 wide at 2×), `schemes` to `["light"]`.
- Steps run in order: `goto`, `click` (+`count`), `fill` + `value`, `press`, `scroll`, `wait` (ms). Each
  step waits for the network to settle. Pick selectors that exist in all three builds — upstream's
  markup differs from the fork's (an `aria-label` usually survives; a fork class does not).
- `seed` builds localStorage state once and replays it into every build, so the three render the same
  list. Never let each build seed itself: the backend's search order varies between runs.
- `auth: true` scenarios run only with a saved session (step 3).

## 2. Three checkouts

After the merge commit (`vc-frontend:merge-upstream` step 4), in worktrees **outside** the repository:

```bash
git worktree add --detach "$TMP/vc-visual/upstream" HEAD^2
git worktree add --detach "$TMP/vc-visual/before" HEAD^1
```

`after` is the fork's own checkout. In each worktree: `yarn install --immutable`, and copy `.env.local`
(the same `APP_BACKEND_URL` for all three) and `.certificates/` from the fork. A `dist/` already present
is served as it is — delete it when the checkout changed since it was built.

## 3. Capture, one build at a time

```bash
S=<this skill's directory>; OUT="$TMP/vc-visual/shots"; SC=upstream-merges/visual-scenarios.json
"$S/run-variant.sh" upstream "$TMP/vc-visual/upstream" "$OUT" "$SC"
"$S/run-variant.sh" before   "$TMP/vc-visual/before"   "$OUT" "$SC"
"$S/run-variant.sh" after    .                         "$OUT" "$SC"
```

Each run builds (when needed), serves on `PORT` (3100; 3000 is usually the developer's own server),
captures and stops the server. Never run two at once, and never start a preview by hand on the same
port: the runner refuses a busy port, because a leftover server is captured silently in place of the
build. Re-run one scenario across all three with `--only <id>` after the four arguments.

**Signed-in pages.** The agent never types credentials — the preview proxies sign-in to a remote
backend. Ask the user to sign in: `node "$S/login.mjs" --base https://localhost:3100 --save "$OUT/auth.json"`
while one build is served opens a visible browser and saves the session once they are in. Pass
`--auth "$OUT/auth.json"` to every run. The session belongs to the origin, so one sign-in covers all
three builds; if signed-in shots come out as the sign-in page, the token expired.

## 4. Diff, look, decide

```bash
node "$S/report.mjs" --shots "$OUT" --scenarios "$SC" --diff
```

prints before→after per shot: the share of pixels that changed, or the height change. Then open every
shot that is not 0% — side by side, cropped to the changed area — and give each scenario one verdict:

| Verdict | When |
|---|---|
| `same` | 0%, or only a difference you can name as noise (a few pixels from a scroll position) |
| `expected` | an upstream feature the merge brought in — say which and where it shows |
| `data` | the backend answered differently between runs: product order, a carousel slide, stock counts. Confirm by comparing the changed area, not by assuming |
| `check` | anything else. It goes back to the merge before the report goes out |

Also read each shot's `results.json` errors: GraphQL errors in `after` that `before` lacks are a finding;
the same console noise in all three (a QA image host that does not resolve) is not.

## 5. Report

Write `report-meta.json` beside the shots:

```json
{
  "title": "Merge v2.60.0",
  "fork": "VirtoCommerce/vc-frontend-next", "branch": "chore/merge-upstream-2.60.0",
  "range": "2b75c7de7..68a13ec9d (33 upstream commits)", "mergeCommit": "b4c8e4df0",
  "backend": "https://… (signed out)", "date": "YYYY-MM-DD",
  "variants": { "upstream": "tag 2.60.0 (68a13ec9d)", "before": "origin/dev (d996e503d)", "after": "merge commit b4c8e4df0" },
  "checks": [["validate:types", "pass", "ok"], ["lint", "30 errors, the same 30 as on dev", "warn"]],
  "conflicts": [["compare-table.vue", "<resolution>", "<scenario ids that show it>"]],
  "notCovered": ["<page> — <what it needs: a role, a setting, data>"],
  "scenarios": { "<id>": { "verdict": "same", "note": "<what the shots show, one or two sentences>" } }
}
```

```bash
node "$S/report.mjs" --shots "$OUT" --scenarios "$SC" --meta "$OUT/report-meta.json" --out "$OUT/merge-<ref>-visual.html"
```

The report is one self-contained HTML file (about 1 MB per 2 shots): a summary of verdicts, checks,
conflicts and gaps, then each page with its three builds in synced scroll, a before/after-only layout,
and a full-size view where keys 1·2·3 flip builds at the same position. Send it to the user; do not
commit it. The merge's log records, under Smoke, the verdict per page and what was not captured, and
`notCovered` goes into the PR's QA checklist.

Remove the worktrees when the merge is done: `git worktree remove --force "$TMP/vc-visual/<name>"`.

## Common mistakes

| Mistake | Instead |
|---|---|
| Two previews at once, or one left running | One build at a time; the runner stops its server and refuses a busy port |
| Each build seeds its own state | `seed` runs once and is replayed into every build |
| `width`/`height` at the top of a Playwright context | Inside `viewport` — at the top level they are ignored and every shot is 1280 wide |
| Calling a change "data" without looking | Crop the changed area in both shots and name what differs |
| A page where the conflict's markup never renders (a PDP without a SKU line) | Find the product or state that renders it, and check the shot shows it |
| Typing the user's password into the preview | `login.mjs`; the user signs in |
| Committing the report | It is large and regenerable; the log keeps the verdicts |
