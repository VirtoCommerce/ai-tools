# Distribution

How the ai-tools tooling reaches Virto Commerce teams and customers, what ships, and how it is versioned.

> **Status:** pre-v1.0. Each plugin carries its own `0.x` version and tag (below); read the manifests rather than a
> number here, which goes stale.

## What ships, and how

| What | Mechanism | Who uses it |
|------|-----------|-------------|
| **Marketplace plugins** — `vc-init`, `vc-secrets`, `vc-fix`, `vc-test` (preview), `vc-perf`, `vc-frontend`; the list is [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) | Claude Code plugin manager: `/plugin marketplace add VirtoCommerce/ai-tools`, then `/plugin install <name>@ai-tools`. Each plugin is self-contained under `plugins/<name>/` and installs its own npm dependencies on session start. | Customers and the VC team, in any project folder |
| **The full `vc-qa` toolset** — ticket testing, regression, BA analysis, the reference suites, test-data framework | **Direct clone** of this repo. Its agents, skills, commands, hooks and knowledge are project-scoped under `.claude/` and load automatically in the checkout; `scripts/`, `ci/` and `config/` run via `npm run <script>`. Not listed in the marketplace and not packaged as a plugin. | The VC QA team |

**Install order.** `vc-init` first: it holds `/project-init`, is the only writer of `project-profile.json`, and pulls
in `vc-secrets`. Every plugin that reads the profile (`vc-fix`, `vc-test`, `vc-perf`) depends on it and stops with
"run /project-init" until the profile exists. Step by step: [`onboarding.md`](onboarding.md) and
[`../plugins/vc-init/README.md`](../plugins/vc-init/README.md).

## The customer's own config never ships

`/project-init` writes it into the customer's project, gitignored unless noted: `project-profile.json`, `.env.<env>`
(URLs and identifiers, no secret; committable in their own repo), `.env.test-env` (the default env), `.env.local`
(the tracker connection and any test-user passwords not kept in vc-secrets), `.claude/vc-secrets.local.json` (which
secrets the project declares, no values), `.mcp.json`, `.claude/settings.local.json` (`VC_RUN` and `VC_SECRETS`
paths) and the committed `.claude/rules/vc-browser.md`. Tokens live only in vc-secrets (the OS credential store or
Azure Key Vault). Per-env test-data overrides go in `test-data/aliases.<env>.json`.

### Why not a git submodule?

Considered and rejected. Submodules are operationally painful at customer scale: pinning, updates and conflict
resolution all require git fluency we shouldn't assume of QA leads. The plugin manager updates with one action.

### Why not a fork?

"Just `git clone` and edit" doesn't scale past one or two customers: every customer's edits diverge from upstream,
methodology drifts, and bugfixes don't propagate. The plugins keep Tier A and Tier B identical across customers
(see [`versioning.md`](versioning.md) for the freeze contract).

## Versioning sources of truth

| File | Authoritative for |
|------|-------------------|
| `plugins/<name>/.claude-plugin/plugin.json` `.version` | **That plugin's version** — what the plugin loader reads. Each plugin versions independently. |
| `{name}--v{version}` git tag | What a dependency range (`"vc-init": ">=0.4.1"`) resolves against. A version bump without its tag strands dependents ([`release-process.md`](release-process.md) §Step 1 and §Step 5a). |
| `.claude-plugin/marketplace.json` `.version` | The catalog's version, not any plugin's. |
| `package.json` `.version` | Internal npm version of the tooling repo; not customer-facing. |
| [`versioning.md`](versioning.md) | What counts as breaking, Tier A artifacts under freeze, the upgrade path. |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Per-release change list, each entry naming the plugins and versions it moves. |

After a plugin upgrade a customer runs `/project-init --check`: it migrates a stale profile to the current schema
and moves any token an older onboarding left in a file into vc-secrets.

## Update cadence

| Type | Cadence | What changes |
|------|---------|--------------|
| Patch (`x.y.Z`) | As needed | Bug fixes, doc updates. No customer action required. |
| Minor (`x.Y.0`) | As features land | New capabilities, new env vars (safe defaults), new suites, new BLs. Customers read the changelog. |
| Major (`X.0.0`) | Rare | Breaking changes, with a migration note in the changelog entry. |

## Support model

**Pre-v1.0:** best-effort via GitHub Issues on this repo, no SLA. `vc-fix`'s `/vc-self-check` can file a
consent-gated issue built from its own telemetry.

**Post-v1.0 (pricing TBD):**
- Tier 0: self-serve docs (`docs/onboarding.md`, its troubleshooting section).
- Tier 1: public GitHub Issues + plugin docs (free for all VC customers).
- Tier 2: direct support via VC Slack + email (paid add-on).
- Tier 3: dedicated onboarding + custom suite authoring (consulting engagement).

## Source of truth: `main`

Pre-v1.0, `main` is the canonical source; customers pin a plugin version, not the branch tip. Releases follow
[`release-process.md`](release-process.md).

## References

- Versioning contract: [`versioning.md`](versioning.md)
- Release steps and tags: [`release-process.md`](release-process.md)
- Onboarding: [`onboarding.md`](onboarding.md)
- Tier classification: [`../.claude/architecture/TIER.md`](../.claude/architecture/TIER.md)
