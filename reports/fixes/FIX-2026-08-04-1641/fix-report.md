# FIX-2026-08-04-1641 — VCST-5657

**Ticket:** [VCST-5657](https://virtocommerce.atlassian.net/browse/VCST-5657) — *[Mixed cart] Place order is active if select only loyalty products* (Bug, High)
**Repo:** `VirtoCommerce/vc-module-loyalty` (`repoKind: module`) · **Branch:** `claude/qa-autofix/VCST-5657` · **Commit:** `eda5abc`
**PR:** https://github.com/VirtoCommerce/vc-module-loyalty/pull/15 (base `dev`, OPEN, not draft, **not merged**)
**Env verified against:** vcst-qa @ Platform 3.1055.0, Loyalty 3.1004.0, theme 2.55.0-pr-2407

## Outcome

Root cause found, fixed, unit-proven, reviewed, PR open for human review. **Nothing merged.**

## Root cause

`LoyaltyCartValidator` rule 2 compared two operands built over different line-item sets:

| Operand | Source | Gifts excluded | Selection-filtered |
|---|---|---|---|
| `hasPointProducts` | `cart.CartTotals` | yes (`DefaultShoppingCartTotalsCalculator.cs:33`) | yes (`:81`) |
| `hasCashProducts` (before) | raw `cart.Items` | no | no |

A *deselected* cash line stays in `cart.Items`, so `hasCashProducts` never went false and `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` was never emitted — a points-only order was placeable.

**Fix:** evaluate the cash side over `CartAggregate.SelectedLineItems` (non-gift ∧ selected — the calculator's own item set), so the operands cannot diverge again. Rules 1, 3, 4 byte-identical. BL-LOY-010 and BL-LOY-008 preserved.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| G0 triage | PASS | Localized, non-breaking, code-fixable |
| G1 route | PASS | Single repo; RCA anchor confirmed by source read; push rights verified |
| G1b provenance | N/A | Native platform, no client fork |
| G2 reproduction | PASS | RED: `Assert.Contains() Failure … Collection: []` — matches live `validationErrors: []` |
| G3 fix | PASS | 4/4 tests; build 0 warnings / 0 errors |
| G4 review | APPROVE | 1 revision round (REQUEST_CHANGES → APPROVE) |
| G5 CI | **RED — not code-related** | Build ✅, Unit Tests ✅, SonarCloud QG ✅, license/cla ✅. Sole failure of 37 steps: **"Push Build Info to Jira"** (see below) |
| G6 E2E | **NOT RUN** | Static-only by design; PR flagged needs deploy verification |
| G7 human review | STOP | PR open, never merged |

**Independent red→green** (run by the orchestrator, not the developer agent): reverting only the production predicate with the test file untouched fails both reproduction tests while the over-correction guard and pre-existing stub stay green; restoring gives 4/4 and a clean tree.

## Diff scope

3 files: the one-line predicate + comment (`LoyaltyCartValidator.cs`), a new `LoyaltyCartValidatorTests.cs` (3 tests), and one `ProjectReference` wiring `Loyalty.ExperienceApi` into the test project. No new PackageReference (hand-rolled `ILoyaltyLogicService` fake). No existing test modified. No REST/GraphQL/DTO/schema/manifest change.

## Notable

- **A review finding was partly wrong and is recorded so it isn't re-litigated.** Gate 4 initially called the gift path a second *reachable* route to the defect. Verification showed `RecalculateAsync` calls `ApplyRewardsAsync` unconditionally and an empty promotion result *removes* unmatched gift lines, so such a cart cannot reach the validator. The gift-excluding form was kept for operand alignment; the commit and PR body state explicitly that the gift case is unreachable, so no reviewer wastes time on it. **One live defect: deselection.**
- **G5 was red because of a case ID in the PR description — FIXED, `ci` now passes.** `module-ci.yml`
  runs *Parse Jira Keys from All Commits* (`vc-github-actions/get-jira-keys`) over the **PR body**, using
  `/(([A-Z]+)-\d+)/g`, then *Push Build Info to Jira* rejects any result failing Jira's key pattern
  (which requires **≥2 characters** before the hyphen). The body cited regression case **`MCO-E2E-008`**;
  `[A-Z]+` cannot match `E2E` (it contains a digit), so the regex backtracked to **`E-008`** — a
  1-character prefix — and the step errored. Reproduced locally against the real body: extracted
  `VCST-5657, LOY-010, LOY-008, VCST-5365, AC-6, GQL-012, E-008`, only `E-008` rejected. Rewording that
  one reference to `MCO-E2E` case 008 made every key valid and the step green.
  **The branch name `claude/qa-autofix/VCST-5657` was NOT the cause** — an earlier diagnosis in this run
  said so and was wrong; the keys come from the PR body, not the branch. No convention change is needed.
  Durable guard added to the plugin (both surfaces) — see `/qa-fix` Phase 5 and `/qa-bug` Step 5.
- **`gh pr create` failed on the env PAT** (`Resource not accessible by personal access token`) — the fine-grained `GITHUB_FIX_BUGS_TOKEN` carries Contents but not Pull-requests rights. Resolved via this repo's documented routing (`env -u GITHUB_TOKEN` + the `gh` keyring classic token, `repo` scope). Worth fixing in the token if unattended runs are planned.
- **`TestCartAggregate` pins 12 base-ctor args** matching `XCart 3.1023.0`; x-cart `dev` already has 13 (`ICartItemBuilder`). Breaks loudly as a compile error on the next bump — commented in-file.
- **Adjacent bug, NOT filed and NOT verified live:** a rejected gift may return to the cart selected when the `EqualsReward` identity match fails (`CartAggregate.cs:476-489`, `AddGiftItemsAsync:544-546`), with suspect `&&`/`||` grouping in `RewardExtensions.EqualsReward`. Against `vc-module-x-cart`. Reproduce before filing.

## Follow-ups

1. Human review + merge PR #15; confirm `ci` and SonarCloud QG green first.
2. Post-deploy: `/qa-verify-fix VCST-5657` — re-run the original STR, **payment method pinned to `Manual`** (*Pay with points* is blocked by a different rule and masks this one).
3. Regression cases `MCO-GQL-012` (075b) + `MCO-E2E-008` (083b) are expected-RED until this deploys.
