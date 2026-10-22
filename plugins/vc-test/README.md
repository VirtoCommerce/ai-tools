# vc-test — prototype

The QA command of the `vc-test` design ([spec](../../docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md),
[plan](../../docs/superpowers/plans/2026-10-22-vc-test-prototype.md)), as a thin slice: it calls the skills under
`.claude/` in place, so it runs only from a checkout of this repository. It implements the layered run the spec
described before U60 (change map → strategy → checklist lanes → triage → verdict); the scenario-driven run of
U60–U66 is P0 and is not built yet.

Load it for one session with `claude --plugin-dir plugins/vc-test`, then `/vc-test:qa-ticket <KEY> [<env>] [--dry-run]`.
It is not in the marketplace until P1.
