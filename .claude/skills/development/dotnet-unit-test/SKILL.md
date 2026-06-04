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

1. **Find the test project FIRST** — it decides whether this run is viable at all:
   `Glob tests/**/*.csproj`. Expect exactly one (e.g. `tests/VirtoCommerce.InventoryModule.Tests/`),
   but the name drifts: some repos use `.Test` singular (pricing), and `marketing` adds Benchmark
   projects you must ignore. **No `tests/` + `packages.config` + `net4x` csproj = a legacy module**
   (e.g. vc-module-CyberSource, branch `master`) → BAIL-back (`FIX_STATUS: FAILED`, reason: legacy
   toolchain / no test harness). For **vc-platform** pick the ONE relevant test project (e.g.
   `tests/VirtoCommerce.Platform.Core.Tests`) — never run `dotnet test` at the platform root.
2. **Read the test `.csproj`** before writing a line of test code. It tells you the available stack —
   typically `xunit.v3` 3.x + Moq 4.20.x; **FluentAssertions 7.x is common but NOT universal**
   (vc-module-customer has none — plain `Assert` there). Use only what's already referenced;
   **never add or bump a test package** (and never to FluentAssertions 8+ — paid license).
3. **Locate the seam.** From the RCA, `Grep`/`Glob` the responsible service / handler / policy /
   controller / resolver in `VirtoCommerce.<Name>.Core` / `.Data` / `.Web` (see
   `.claude/agents/knowledge/vc-module-architecture.md` §2). Verify the actual contract/field names —
   VC has many "wrong field name silently no-ops" traps.
4. **Restore — with the audit opt-out.** VC modules set `TreatWarningsAsErrors=true`, so NuGet-audit
   warnings (NU1903 vulnerable transitive package) **fail a vanilla `dotnet restore` even on the
   unmodified `dev` branch.** Append `-p:NuGetAudit=false` to every `dotnet` command (CLI-only —
   never edit `Directory.Build.props` or a csproj to suppress it):
   ```
   dotnet restore tests/VirtoCommerce.<Name>.Tests -p:NuGetAudit=false
   ```
5. **Write a NEW test** (`[Fact]`/`[Theory]`, Moq for collaborators) in the test project asserting the
   **expected** behavior. Name the class/method after the behavior + ticket
   (`CouponDiscountTests.AppliesToPostTierAmount_VCST1234`); repo convention is `*Tests.cs` /
   `*UnitTests.cs`. See `xunit-patterns.md`.
6. **Confirm RED** — scoped and filtered, so the loop stays fast (~seconds after first build):
   ```
   dotnet test tests/VirtoCommerce.<Name>.Tests --nologo -p:NuGetAudit=false --filter "FullyQualifiedName~VCST1234"
   ```
   The new test must fail on current code. **If it passes, the STR/RCA is wrong → re-investigate, do
   not proceed.**
7. Hand off to `/dotnet-fix` to make it green.

## Failure modes (seen on real checkouts — don't flounder)

| Symptom | Cause | Action |
|---------|-------|--------|
| `error NU1903: Warning As Error` on restore/build/test | NuGet audit + `TreatWarningsAsErrors` — happens on a CLEAN dev branch | `-p:NuGetAudit=false` on the command line; never edit build props |
| Any new compiler warning fails the build | `TreatWarningsAsErrors=true` in every module's `Directory.Build.props` | Fix the warning in YOUR new code; don't suppress |
| `Should()` doesn't compile | Test project has no FluentAssertions (e.g. customer) | Use plain xUnit `Assert`; don't add the package |
| New test passes immediately | STR/RCA doesn't match the code path | Re-investigate the seam; a "red" you never saw is not a repro |
| Huge test run / unrelated failures | Ran `dotnet test` at repo root of vc-platform | Scope to the single relevant test project |
| Old-style csproj, `packages.config`, net4.x | Legacy module (CyberSource-era) | BAIL-back — different toolchain, out of auto-fix scope |

## Hard rules
- **Only ADD tests.** Never edit or delete an existing test to reproduce or to pass (Gate 3). An
  existing test that breaks after the fix = contract conflict → STOP.
- **No test harness?** If the module has no test project, BAIL-back (`FIX_STATUS: FAILED`, reason: no
  test harness) rather than scaffolding a risky one.
- **Trivial-skip:** a one-line null-guard / typo / off-by-one with no behavioral branch may skip the
  dedicated repro test — note "trivial — covered by existing suite" in the PR body (Gate 2 via skip).

## References
- `xunit-patterns.md` — verified test stack + xUnit/Moq recipes for VC services/handlers/resolvers
- `.claude/agents/knowledge/vc-module-architecture.md` — repo layout, build/test profiles
- `.claude/rules/quality-gates.md` — G2 (red), G3 (green + existing tests untouched)
- Build/test commands: `REPO_PROFILES` in `ci/lib/repo-router.ts`
