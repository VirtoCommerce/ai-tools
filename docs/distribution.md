# VC QA Plugin — Distribution

How the plugin reaches Virto Commerce customers, what we ship, and how we version.

> **Status:** Pre-v1.0. Distribution mechanism is **finalized below** for the v0.1.0-alpha → v1.0.0 path. Subject to refinement based on Phase 4 pilot feedback.

## Distribution Decision

The plugin ships as a **hybrid package**:

| Layer | Mechanism | Why |
|-------|-----------|-----|
| **Agents, skills, commands, knowledge files** (`.claude/`) | **Claude Code plugin** via the plugin manager | Matches how Claude Code natively discovers and loads these artifacts. Customers add it once; Claude Code handles updates. No git operations on the customer side. |
| **Scripts, CI orchestrators, schemas, templates** (`scripts/`, `ci/`, `config/`, `templates/`, `bootstrap/`, `manifest.json`) | **npm package** under `@virtocommerce/vc-qa` | These are Node.js entry points. The npm pattern is what customers expect for `npx vc-qa init …` and `npm run plugin:install`. Semver via npm versioning. |
| **Regression suite CSVs, knowledge files** (`regression/suites/`, `.claude/agents/knowledge/`) | **Bundled in both layers** | Customers need these files locally to run suites. They're the plugin's actual value — VC-specific BLs + suites. |
| **Customer's own config** (`.env.{env}`, `.env.local`, `test-data/aliases.json`, `test-data/aliases.{env}.json`) | **Customer's repo (gitignored or per-env-committed)** | Never ships with the plugin. Customer scaffolds it via `npm run plugin:install`. |

### Why hybrid?

A pure-npm package would force customers to wire up `.claude/` paths manually. A pure-Claude-Code-plugin would lose the npm script ergonomics. Hybrid keeps both natural.

### Why not a git submodule?

Considered and rejected. Submodules are operationally painful at customer scale: pinning, updates, conflict resolution all require git fluency that we shouldn't assume of QA leads. The Claude Code plugin manager handles "update to latest" with one click.

### Why not a fork?

The previous default ("just `git clone` and edit") doesn't scale past one or two customers — every customer's edits diverge from upstream, methodology drifts, and bugfixes don't propagate. The whole point of the plugin is to keep Tier A and Tier B byte-identical across customers (see [`docs/versioning.md`](versioning.md) for the freeze contract).

## Package Layout (customer view, after install)

```
customer-vc-qa/                  # the plugin, installed locally
├── manifest.json                # plugin metadata
├── package.json                 # npm scripts entry
├── .claude/
│   ├── agents/                  # 14 QA + BA agents
│   ├── skills/                  # 20 skills
│   ├── commands/                # 16 slash commands
│   ├── rules/                   # report rules, test-data policy
│   └── architecture/            # TIER.md
├── ci/                          # orchestrators (regression, full-cycle)
├── scripts/                     # validators, resolvers, taggers
├── bootstrap/                   # install.ts (customer onboarding)
├── templates/                   # .env.local.template, aliases.json.template
├── docs/                        # onboarding, configuration, versioning, this file
├── config/                      # browser MCP configs, test-suites manifest
├── regression/suites/           # 99 suites (40 Frontend + 38 Backend + others)
└── test-data/                   # base aliases.json + sample seed CSVs
                                 # ↑ Customer-overridable via aliases.{env}.json

# Customer-edited, lives alongside but not in the plugin install dir:
.env.local                       # gitignored secrets (cross-env via suffix promotion)
.env.qa                          # per-env config
.env.staging                     # per-env config
.env.prod                        # per-env config
test-data/aliases.qa.json        # per-env entity overrides (optional)
test-data/aliases.staging.json
test-data/aliases.prod.json
tests/                           # customer's own ticket evidence
reports/                         # customer's bugs + regression reports
```

## Versioning

See [`docs/versioning.md`](versioning.md) for the full contract.

- **Pre-v1.0** (`0.x.y`): plugin under development. Breaking changes possible at any minor bump. Pin a specific version.
- **v1.0+**: Tier A frozen. Customers pin a version range like `^1.0`. Plugin manager auto-updates within the range.

## Update Cadence

| Type | Cadence | What changes |
|------|---------|--------------|
| Patch (`1.0.x`) | As needed | Bug fixes, doc updates. No customer action required. |
| Minor (`1.x.0`) | Quarterly | New capabilities, new env vars (safe defaults), new suites, new BLs. Customers read changelog, no config edit. |
| Major (`x.0.0`) | Rare (~yearly) | Breaking changes. Migration guide in `docs/migrations/v{N}.md` shipped alongside. |

## Support Model

**Pre-v1.0:** Best-effort via GitHub Issues. No SLA.

**Post-v1.0 (paid tier, pricing TBD):**
- Tier 0: Self-serve docs (`docs/onboarding.md`, troubleshooting in same).
- Tier 1: Public GitHub Issues + plugin docs (free for all VC customers).
- Tier 2: Direct customer support via VC Slack + email (paid add-on, pricing TBD post-pilot).
- Tier 3: Dedicated onboarding + custom suite authoring (consulting engagement).

Full triage flow, SLA targets, communication templates, and patch-release workflow in [`./support-runbook.md`](support-runbook.md).

## Versioning Sources of Truth

| File | Authoritative for |
|------|-------------------|
| `manifest.json` `.version` | Plugin version as it appears to the customer in `npm run plugin:check`, `/qa-env-check`, etc. |
| `package.json` `.version` | npm package version (kept in sync with manifest). |
| `docs/versioning.md` | What counts as breaking, Tier A artifacts under freeze, customer upgrade path. |
| `CHANGELOG.md` (TBD) | Per-release change list. Added at v0.1.0-alpha → v0.2.0 transition. |

## Customer Migration Path (Phase 4 pilot → GA)

1. **Pre-pilot (now):** plugin lives on `feature/qa-agentic-standardization`. No customers yet.
2. **Pilot start (v0.1.0):** one friendly VC customer installs from a specific commit SHA. We support them directly through Phase 4.
3. **Pilot close (v0.2.0):** consolidate pilot feedback into a versioned release. Possibly bump to `0.2.0-beta` for second-customer dogfood.
4. **GA (v1.0.0):** at least 3 successful customer installs on a stable contract. Tier A gets the freeze stamp. `^1.0` becomes the recommended pin.
5. **Post-GA:** quarterly minor releases. Major releases paired with migration guides.

## Source of Truth: `feature/qa-agentic-standardization`

While we're pre-v1.0, this branch IS the canonical source. Once we cut v1.0:

- Branch becomes a maintenance line for the v1.x series.
- New work goes to `feature/v2-*` branches as needed.
- Releases are tagged (`v1.0.0`, `v1.0.1`, etc.) and published via the chosen distribution mechanism.

## References

- Plan: [`~/.claude/plans/functional-singing-cosmos.md`](file:///~/.claude/plans/functional-singing-cosmos.md)
- Versioning contract: [`./versioning.md`](versioning.md)
- Customer onboarding: [`./onboarding.md`](onboarding.md)
- Tier classification: [`../.claude/architecture/TIER.md`](../.claude/architecture/TIER.md)
