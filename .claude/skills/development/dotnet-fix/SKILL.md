---
name: dotnet-fix
description: "[Development] Implement a minimal, idiomatic .NET 10 / C# fix in a single Virto Commerce module (or vc-platform) that turns the reproduction test green while preserving BL-* invariants and leaving existing tests untouched. Used by the fullstack-backend developer agent in /qa-fix (Gate 3)."
---

# /dotnet-fix — Implement a minimal C# fix in a VC module

Turn the red reproduction test (`/dotnet-unit-test`) green with the **smallest correct change**, then
pass the build/test gate. This is **Gate 3** of `.claude/rules/quality-gates.md`.

## Preconditions
- Source checked out in `.fix-workspace/<repo>/` on branch `claude/qa-autofix/VCST-XXXX`.
- A NEW failing test exists (Gate 2) or trivial-skip is justified.

## Steps
1. **Understand the seam** (controller → service → domain → repo → events). Confirm the real
   root cause, not a symptom. See `.claude/agents/knowledge/vc-module-architecture.md`.
2. **Implement the smallest correct change** to production code only. See `fix-patterns.md` and
   `dotnet10-best-practices.md`. Match the repo's existing style.
3. **Green:** `dotnet test --nologo` — repro test passes; **all pre-existing tests still pass and are
   UNMODIFIED**.
4. **Gate:** `dotnet build -c Debug` + `dotnet test --nologo` (at least the affected test project) —
   both clean. (Use `repoProfile` commands from `ci/lib/repo-router.ts`.)
5. Hand the diff to `backend-reviewer` (Gate 4) before any PR is opened.

## Hard rules (a violation = STOP, not "push anyway")
- **Single repo.** All changed files in ONE `vc-module-*` (C# and/or its `Web/Scripts/` Admin UI).
  Root cause in a NuGet dependency → cross-module → STOP (`ROOT_CAUSE: belongs in <dep>`).
- **Minimal diff.** No refactors, no nuget upgrades, no formatting churn, no unrelated files.
- **Never modify/delete existing tests** — only ADD. An existing test going red = contract conflict → STOP.
- **Never touch** secrets, connection strings, `*.Development.json`, CI config. Generated migrations
  are high-risk — if the fix truly needs one, flag loudly (may warrant a BAIL-back).
- **Preserve BL-* invariants** (`business-logic.md`). A fix that passes the STR but breaks a `BL-*`
  rule is a regression — reject it.
- If the correct fix is unclear or risky → `FIX_STATUS: FAILED`, don't push speculative changes.

## References
- `fix-patterns.md` — common VC fix shapes (null-guard, mapping, cascade, RBAC, async)
- `dotnet10-best-practices.md` — modern C# idioms to apply within a minimal diff
- `.claude/rules/quality-gates.md` — G3 (green), G4 (review), G5 (build/CI), G7 (no auto-merge)
- `.claude/agents/knowledge/vc-bug-catalog.md` — don't re-introduce a historical failure pattern
