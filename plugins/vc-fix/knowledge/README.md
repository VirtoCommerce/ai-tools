# Agent Knowledge Base

**Most of what agents reach for is NOT here any more — it is in the knowledge base.**

The oracles (`BL-*`, `ECL-*`, `VC-*`, the `BL-UI` matrix), the domain maps, the API and
architecture references describe the PLATFORM: what makes them untrue is a change out there, not a
change to this plugin. They live in [VirtoCommerce/vc-knowledge](https://github.com/VirtoCommerce/vc-knowledge)
and travel with it, so one copy serves every project on a machine instead of one copy per plugin
going quietly out of step.

## Getting them

    kb sync

Fetches the base once per machine into `~/.claude/vc-knowledge`. Needs the **vc-kb** plugin, which
vc-fix declares as a dependency. Without it every path below resolves to nothing, and the tools that
read them say so and exit 2 rather than reporting an empty corpus as a clean one.

**A path written `knowledge/<something>` is in the BASE**, at `~/.claude/vc-knowledge/knowledge/…` —
the tail is unchanged from when these files lived here, so every reference in `agents/`, `commands/`
and `skills/` still reads correctly. A path written `knowledge/…` *relative to this plugin* is one
of the files listed under **What is still here**.

`npm run bl:extract -- --domain <d>` hands an agent the invariants for one domain without naming a
path at all — about 7% of the oracle instead of all of it.

## What is still here

What stayed is what this PLUGIN owns — a change to vc-fix is what would make it untrue:

| Folder | What |
|--------|------|
| `agents/` | the shared instruction sets for this plugin's agent teams |
| `api/graphql-test-cases-runner.md` | the runner's own contract grammar — our format, not the platform's |
| `diagnostics/` | the self-diagnostics subsystem: the oracle, the upstream schema, the default-deny ADR |
| `execution/` | how this plugin runs: tracker ops, live discovery, the module→suite map, local verify, plugin-root resolution, Azure HTML |

