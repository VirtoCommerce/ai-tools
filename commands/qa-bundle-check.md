---
description: "Compare a VirtoCommerce stable bundle's pinned module/Platform/Theme versions against the latest same-line hotfix on GitHub. Accepts a bundle name (v12, v14) or a full package.json URL. Flags only hotfixes (newer patch on the same major.minor line), not newer minors (a frozen bundle is meant to trail master); traces each hotfix to its PR + JIRA task."
argument-hint: "vN | <package.json-url> [--json] [--no-platform] [--no-theme] [--no-trace] [--no-links|--links]"
disable-model-invocation: true
---

# /qa-bundle-check — Bundle Hotfix Check

Compare a `vc-modules` stable bundle against GitHub and report which pinned modules (plus
Platform and Theme) have a newer **hotfix** available on their **same `major.minor` line**.
Backed by the [`/qa-bundle-check` skill](../skills/qa-methodology/qa-bundle-check/SKILL.md) —
the command is the terminal entry; the skill holds the methodology.

## Usage
```
/qa-bundle-check v12                        # bundle name → bundles/v12/package.json
/qa-bundle-check v14                        # bundle name → bundles/v14/package.json
/qa-bundle-check v12 --no-theme             # skip the Theme (vc-frontend) check
/qa-bundle-check v12 --json                 # machine-readable output
/qa-bundle-check https://github.com/VirtoCommerce/vc-modules/blob/master/bundles/v12/package.json
```

`$ARGUMENTS` is either a **bundle name** (`vN` — expands to
`https://github.com/VirtoCommerce/vc-modules/blob/master/bundles/<vN>/package.json`, branch
overridable via `BUNDLE_REF`) or a **full** `github.com/.../blob/...` / raw URL. Pass through any
flags after it.

## Execution

Run the deterministic checker (it accepts the `vN` shorthand directly):

```bash
npm run bundle:check -- v12
# or a full URL / extra flags:
npm run bundle:check -- "<vN | bundle-url>" [--json] [--no-platform] [--no-theme] [--no-trace]
```

- `scripts/bundle-version-check.ts` parses the bundle (modules from `Sources[].Modules[]`,
  `PlatformVersion` → `vc-platform`, `ThemeB2BVue` → `vc-frontend`), resolves each module Id →
  repo via `config/module-repo-map.json` (a **self-healing cache** — unmapped modules are
  auto-resolved at runtime and appended), and probes tags on the **same major.minor line** for a
  newer patch.
- For every hotfix it then traces **the PR that raised the version → the linked JIRA task** (PR
  title/branch/body, falling back to commit messages when the release has no notes) and prints
  them as a clickable list. Disable tracing with `--no-trace`.
- Exit: `0` all current · `1` ≥1 hotfix available · `2` tool error / unresolved repo.
- Auth: reads `GIT_TOKEN` from `.env.local` (without it GitHub caps at 60 req/h).

Report the resulting table to the user. If any row is `⚠ unresolved` / `✗ line-missing`, follow
the skill's fallback procedure (verify the repo name, add it to the map, or do a targeted agent
probe) — never report a partial result as "all current".
