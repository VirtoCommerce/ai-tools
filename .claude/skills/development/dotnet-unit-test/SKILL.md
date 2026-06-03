---
name: dotnet-unit-test
description: "[Development] Reproduce a Virto Commerce backend bug as a failing xUnit test (red), then prove the fix turns it green — without modifying existing tests. Used by the fullstack-backend developer agent in the /qa-fix pipeline (Gate 2/G3)."
---

# /dotnet-unit-test — Reproduce a bug as a failing xUnit test

Encode a confirmed bug (STR + root cause) as a **new** xUnit test that fails on current code, so the
fix has an objective red→green proof. This is **Gate 2** of the auto-fix ladder
(`.claude/rules/quality-gates.md`).

## When to use
- A backend bug in a `vc-module-*` / `vc-platform` repo has been routed and the source is checked out
  in `.fix-workspace/<repo>/` (via `ci/lib/repo-router.ts` `checkoutForFix`).
- Before writing any production-code fix — the test comes first.

## Steps
1. **Locate the seam.** From the RCA, `Grep`/`Glob` the responsible service / handler / policy /
   controller / resolver in `VirtoCommerce.<Name>.Core` / `.Data` / `.Web` (see
   `.claude/agents/knowledge/vc-module-architecture.md` §2). Verify the actual contract/field names —
   VC has many "wrong field name silently no-ops" traps.
2. **`dotnet restore`** in the checkout.
3. **Write a NEW test** (`[Fact]`/`[Theory]`, Moq for collaborators) in `VirtoCommerce.<Name>.Tests`
   asserting the **expected** behavior. Name it after the ticket/behavior. See `xunit-patterns.md`.
4. **Confirm RED:** `dotnet test --nologo` — the new test must fail on current code. If it passes, the
   STR/RCA is wrong → re-investigate, do not proceed.
5. Hand off to `/dotnet-fix` to make it green.

## Hard rules
- **Only ADD tests.** Never edit or delete an existing test to reproduce or to pass (Gate 3). An
  existing test that breaks after the fix = contract conflict → STOP.
- **No test harness?** If the module has no test project, BAIL-back (`FIX_STATUS: FAILED`, reason: no
  test harness) rather than scaffolding a risky one.
- **Trivial-skip:** a one-line null-guard / typo / off-by-one with no behavioral branch may skip the
  dedicated repro test — note "trivial — covered by existing suite" in the PR body (Gate 2 via skip).

## References
- `xunit-patterns.md` — xUnit + Moq recipes for VC services/handlers/resolvers
- `.claude/agents/knowledge/vc-module-architecture.md` — repo layout, build/test profiles
- `.claude/rules/quality-gates.md` — G2 (red), G3 (green + existing tests untouched)
- Build/test commands: `REPO_PROFILES` in `ci/lib/repo-router.ts`
