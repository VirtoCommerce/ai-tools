# vc/ — Layer 2 (Virto Commerce internal deployments, multi-env)

This directory is **Layer 2** per the product audit plan. It holds **VC's internal deployments of the Layer 1 plugin** — one subdir per VC-internal environment. Each env subdir contains that env's historical evidence, seed data overrides, and any env-specific knowledge.

> **For customers:** this directory is part of the open-source repo but contains VC's internal data. You do NOT need it. Your own equivalents live alongside the plugin's customer-facing dirs at the repo root.

## VC internal environments (currently three)

| Env subdir | What it is | `TEST_ENV` value |
|------------|-----------|------------------|
| `vc/vcst-qa/` | Primary VC QA env — most plugin development happens here | `vcst` |
| `vc/vcptcore-qa/` | Second QA env (vcptcore variant) | `vcptcore` |
| `vc/virtostart/` | Staging-like env tied to virtostart deployment | `virtostart` |

Each env subdir follows the same internal layout (some may be empty placeholders until VC accumulates evidence there):

```
vc/{env-name}/
├── tests/                          Per-ticket evidence (Sprint-XX-XX/VCST-XXXX/)
│   ├── Sprint-current/
│   ├── Sprint-NN-NN/
│   └── demo/                       Demo materials for stakeholders
├── reports/                        Env-specific historical reports (when archived from root)
└── docs/                           Env-specific docs (sprint plans archived here when retired)
```

## vc/shared/

Cross-env VC-internal materials that don't belong to a single env:

```
vc/shared/
└── workshop/                       VC team training materials (agentic-qa-cheatsheet.md, etc.)
```

## Active vs archive convention

After workstream #6, the convention is:

- **Active runs** (any env) write to `reports/regression/`, `reports/bugs/`, `tests/Sprint-XX-XX/` at the **repo root**. Agent prompts (orchestrators, test runners) reference these root paths. Customer's runs also write here.
- **VC's per-env archive** lives under `vc/{env-name}/`. Historical sprint evidence is moved here once the sprint closes; historical regression runs once they're > 6 months old.

VC's archival discipline (going forward):
- Sprint closes → `git mv tests/Sprint-NN-NN vc/vcst-qa/tests/Sprint-NN-NN` (or whichever env owned it).
- Old regression run → `git mv reports/regression/REG-OLD-DATE vc/vcst-qa/reports/regression/REG-OLD-DATE`.
- Sprint plans don't typically archive — they stay at root in `docs/Sprint plans/` (referenced by `/qa-regression sprint` at runtime).

Customer impact:
- Customer's runs accumulate at root.
- Customer doesn't need a parallel "customer archive" — they can manage their own retention.
- Customer ignores everything under `vc/`.

## Why this lives in the same repo (and not a separate one)

Per the product audit plan Section 6 (workstream #6), v0.3 uses option **6b — same-repo with `vc/` subdir**. Trade-offs:

- ✅ One git history (no cross-repo coordination); VC team's daily workflow preserved; low migration cost; the data exists publicly so customers can see real evidence of the plugin working.
- ⚠️ Customers who clone get the VC data too. They can ignore this subdir, or sparse-checkout to exclude it.

Future direction (v1.0 GA): split into two separate repos (option 6a) — Layer 1 stays public open-source; Layer 2 moves to a separate VC-internal repo. Decision deferred to post-pilot.

## What's NOT in this directory but probably should be (deferred to v0.4)

Code paths reference these at root and moving them requires a refactor:

- `test-data/aliases.json` — 211 aliases, 204 vcst-data. Resolver path is `test-data/` at root. Moving requires making the resolver path configurable.
- `test-data/orgs/`, `users/`, `products/`, etc. — vcst's seed-backing CSVs. Same constraint.
- `.env.vcst` / `.env.vcptcore` / `.env.virtostart` — VC's env profiles. config.js loader reads from CWD; moving requires loader changes.
- `.github/workflows/*` — VC's CI workflows. Workstream #20 will introduce a customer-template alongside.

These stay at root for v0.3. The per-env subdir model gives us the place to put them when v0.4 makes the move possible.

## Currently in this directory

- **`vc/vcst-qa/tests/`** — moved from root `tests/` in workstream #6 (~11M of per-ticket evidence). Sprint-current, demo materials.
- **`vc/shared/workshop/`** — moved from `docs/workshop/` in workstream #6 (~12K of VC training material).
- **`vc/vcptcore-qa/.gitkeep`** + **`vc/virtostart/.gitkeep`** — placeholder dirs reserved for future env-specific archive.

## How to clone without vc/ (customer-side sparse checkout)

```bash
git clone --filter=blob:none --no-checkout https://github.com/VirtoCommerce/vc-mcp-testing-module.git
cd vc-mcp-testing-module
git sparse-checkout init
git sparse-checkout set '/*' '!vc/'
git checkout main
```
