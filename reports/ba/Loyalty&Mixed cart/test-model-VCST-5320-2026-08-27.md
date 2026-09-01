# Test Model — VCST-5320 "Missions & Challenges" (Epic)

**Date:** 2026-08-27 · **Scope:** Epic VCST-5320 and its two child stories · **Env:** vcst-qa
**Build under test:** `VirtoCommerce.Loyalty_3.1006.0-pr-14-1be7` · Platform `3.1061.0` · theme `vc-theme-b2b-vue-2.57.0-pr-2396`
**Status:** Story 1 model complete, fixtures seeded, 5 defects confirmed live (see §4a); Story 2 model provisional (seeded from the ticket description + design project, pending its own context/story review).

## Executive summary

The Epic carries no description and no Epic-level acceptance criteria, so there is no goal to test against above the story level. VCST-5319's ACs are a **field checklist, not falsifiable conditions** — none of the 8 AC groups is independently testable as written, one ("transactions log similar to Loyalty Program") is not falsifiable at all, and the Customer Mission Summary AC materially disagrees with the shipped GraphQL contract. This model reduces that space to **25 atomic conditions** for Story 1, of which 16 derive from story ACs and 9 from 13 newly-identified gap-ACs. Coverage baseline is zero: the 4,155-case corpus contains no mission case.

## 1. Epic structure

| Story | Type / status | Testable | Role in the chain |
|---|---|---|---|
| VCST-5319 — [Missions][Backend] | Story · In review | Build deployed; ACs present | Slice A — produces missions, progress, rewards |
| VCST-5346 — [Missions][Frontend] | Story · Ready for test | Yes | Slice B — renders what A produces |

Dependency order is A → B. VCST-5319 is **not dev-signed-off** (todo item 7, "Review via AI tools", still open), so the Epic cannot reach a GO recommendation this cycle regardless of test outcome.

## 2. Implemented contract (grounded in vc-module-loyalty PR #14)

- **Store toggle** `Loyalty.Missions.Enable` (group `Loyalty|Missions`, Boolean, **default false**, `IsPublic`), gated on both the write path (`ProcessOrderAsync`) and the read path (`GetUserMissionsAsync`). It is **independent of base `Loyalty.Enable`** (verified 2026-08-27 at both read sites and up every caller chain), so `Loyalty.Enable=false` + `Missions.Enable=true` still accrues and still pays out.
- **Goal types** (`IMissionGoal` inside `LoyaltyMission.DynamicExpression`): `OrderValueGoal{Value, CurrencyCode?}`, `OrderCountGoal{Count}`, `PerSkuGoal{All, items[]}` → surfaces as `PerSkuAll` / `PerSkuAny`.
- **Periodicity:** the field is **never branched on** — `ResolvePeriod` is unconditional and the validator ignores it, so any value is silently treated as `None` (one Start/End window) rather than rejected. Recurring periods are modeled but not implemented, which contradicts the ACs' repeated "per mission period" wording.
- **Ledgers:** `LoyaltyMissionTransaction` (per-order contribution, idempotency key `(MissionId, ObjectId, UserId)`) and `LoyaltyBalanceOperationLog` (reward grant, `SourceType` in {`LoyaltyProgram`, `LoyaltyMission`} + `SourceId`). The REST route remains `/api/loyalty-program-operation-log` despite the entity rename.
- **Immutability:** Draft freely editable; Published → Archived is the only permitted transition; any other edit on Published throws `InvalidOperationException`; Archived fully immutable.
- **Concurrency:** `ApplyMissionInternalAsync` holds an `IDistributedLockService` lock per `(mission, user)` plus a `TransactionExistsAsync` idempotency check.
- **Reward:** `GetRewardAmount` sums the reward tree; an amount of 0 or less makes the grant a no-op while the mission still flips to `Completed`.

## 3. The AC to implementation drift that matters

The AC names 9 flat Customer Mission Summary fields. The shipped GraphQL type (`loyaltyMissionProgress` → `LoyaltyUserMissionType`) does not match on four of them. Two independent analyses converged on this.

| AC field | Shipped reality | Verdict |
|---|---|---|
| `IsCompleted` | No boolean — derive from `status === "Completed"` | DRIFT |
| `IsActive` | **Absent.** Nearest is `isStarted`, a different concept | DRIFT |
| `CustomerId` | Not returned per record; query scoped to caller via `GetCurrentUserId()` | DRIFT (by design?) |
| `OrderTotalValueCompleted` / `OrderQuantityCompleted` | Collapsed into generic `currentValue`/`targetValue` (+ `currentMoneyValue`/`targetMoneyValue`, OrderValue only) | DRIFT |
| `SkusCompleted` | `items[]` per-SKU list, not a scalar | DRIFT |

This is plausibly a deliberate API consolidation. It needs a product decision, not a bug report — but it is the exact surface VCST-5346 consumes, so tests assert the **real** field names.

## 4. Story 1 — atomic conditions (25)

| # | Condition | Impl verdict |
|---|---|---|
| C1 | toggle=false so no contribution applied on order | SATISFIED |
| C2 | toggle=false so user missions empty | SATISFIED |
| C3 | all three goal types creatable, `missionType` resolves | SATISFIED |
| C4 | only `Periodicity=None` processed | **DRIFT — any value silently accepted as None** |
| C5 | PerSku `All=true` needs every SKU; `All=false` any one | SATISFIED (absent from ACs) |
| C6 | CustomerIDs targeting restricts qualification | UNCONFIRMED |
| C7 | Customer-group targeting restricts qualification | UNCONFIRMED |
| C8 | precedence when both CustomerIDs and group set | **needs product decision** |
| C9 | reward grants exactly the configured points | SATISFIED |
| C10 | reward=0 completes mission, grants nothing | SATISFIED (undocumented) |
| C11 | LocalizedName / Description / BannerUrl persist and localize | SATISFIED |
| C12 | balance-log row carries `SourceType`/`SourceId` | SATISFIED |
| C13 | one transaction row per contributing order, `ObjectId=orderId` | SATISFIED |
| C14 | `percentage` = current/target, capped at 100 | SATISFIED |
| C15 | `IsCompleted`/`IsActive` booleans in the summary | **DRIFT — absent** |
| C16 | SKU progress exposed as `items[]`, not a scalar | DRIFT |
| **C17** | **Published + `Public=false` mission excluded from customer query** | **CONFIRMED DEFECT (live, 2026-08-27)** |
| C18 | currency-mismatched order contributes nothing, silently | SATISFIED (silent) |
| C19 | OrderValue mission with null `CurrencyCode` accepts any currency | **REFUTED — save rejects null (400); see §4a** |
| C20 | editing a Published mission blocked, inline message not raw error | SATISFIED (backend); UI unconfirmed |
| C21 | zero-target mission never completes | SATISFIED (undocumented) |
| C22 | `StartDate > EndDate` rejected at save | UNCONFIRMED |
| C23 | concurrent qualifying orders grant reward exactly once | LIKELY SATISFIED |
| C24 | guest checkout attributes no progress | SATISFIED |
| C25 | disabling toggle mid-flight hides in-progress summary | SATISFIED (intent unconfirmed) |

**C17 is CONFIRMED, live (2026-08-27, during fixture provisioning).** `loyaltyMissionProgress` returned **9 of 10** seeded missions to an authenticated customer, including `AGENT-TEST-MSN-PUBLISHED-PRIVATE` (`public=false`). The Draft mission *was* correctly excluded, so the read path filters `Status` but not `Public`. Source agrees: `GetQualifyingMissionsAsync` sets only `StoreIds` / `Status=Published` / `Take=50`, while `LoyaltyMissionSearchCriteria` exposes an unused `Public` property. Dual-sourced (live + code). This is a **visibility regression against a dev-claimed-complete item** (todo item 2, struck through).

### 4a. Further defects found during provisioning (2026-08-27)

Four more, all found before a single authored test ran:

| Finding | Detail |
|---|---|
| **`CurrencyCode` contract lies** | `OrderValueGoal.CurrencyCode` is nullable in the DTO *and* published Swagger, but save rejects `null` / `""` / omitted with HTTP 400 "Currency code is required for the order value goal". Validation is **asymmetric** — presence enforced, validity not: `"XYZ"` and lowercase `"usd"` persist verbatim, so a wrong-currency mission can never fail at save time. A currency-agnostic order-value mission is **not expressible on this build**, by API or UI. |
| **`OnlyActive` never set** | `GetQualifyingMissionsAsync` leaves `OnlyActive` unset, so a mission the user has already started is returned regardless of `EndDate` — expired missions keep appearing. |
| **`Periodicity` never branched on** | `ResolvePeriod` is unconditional and the validator ignores the field, so a non-`None` value is silently accepted and treated as `None` rather than rejected. Worse than unimplemented: it accepts a configuration it does not honour. |
| **`LocalizedString` fails open** | Must be posted as `{values:{locale:text}}`. The obvious flat `{'en-US': …}` returns **HTTP 201 with `{"values":{}}`** — every translation silently discarded. A naive C11 case would "pass" by asserting a missing translation against an empty field. The seeder now read-backs after create so a wrong wire shape fails the seed. |

**Open question 4 is answered: `Loyalty.Missions.Enable` is INDEPENDENT of base `Loyalty.Enable`** — verified at both read sites (`ProcessOrderAsync`, `GetUserMissionsAsync`) and up every caller chain; no `IsLoyaltyEnabled()` helper picks it up implicitly. So `Loyalty.Enable=false` + `Missions.Enable=true` is a supported state in which missions still accrue **and still pay out points**. That warrants a product opinion, not just a test.

## 5. Gap-ACs (13) — behaviour with no governing AC

gap-1 Published-mission edit blocked with an inline message · gap-2 zero-target rejected at save · gap-3 `StartDate > EndDate` rejected · gap-4 concurrent completion grants once · gap-5 zero/negative reward completes but grants nothing · gap-6 currency-mismatched order contributes nothing, no error · gap-7 null `CurrencyCode` accepted via direct API · gap-8 non-Public mission hidden from customers · gap-9 CustomerIDs vs Customer-group precedence · gap-10 guest checkout attributes nothing · gap-11 toggle-off mid-flight hides in-progress summary · gap-12 Start/End are UTC-normalised · gap-13 Archived mission leaves stale `InProgress` rows unclosed.

Also unspecified by any AC but implemented: the distributed lock, the idempotency check, `ExpireMissionsAsync`, and the `SourceType`/`SourceId` generalisation. These are the concurrency, idempotency and expiry guarantees a loyalty feature needs — they should be ACs, not silent scope.

## 6. Story 2 — provisional model (VCST-5346)

Ticket requirements: (1) notify on new and completed missions; (2) show name, description, goal, reward, days left, progress; (3) for SKU missions show target quantities and whether met.

The linked Claude Design project ("E-commerce missions feature") specifies 8 frames: desktop missions section, generic/Order-value detail modal, SKU detail modal with per-SKU steppers, login popup for new missions, login popup for completion, registration preview, mobile carousel, mobile completion bottom sheet.

**Two design-declared behaviours have no AC:**

- The notification trigger is **login** — both popups fire on sign-in. The AC says only "must be notified".
- **Frame 6 (registration preview)** — a mission teaser during auto-registration — is absent from the ticket entirely.

Design also declares semantic state colours as tokens (`--color-danger-500` near-expiry, `--color-warning-500`, `--color-success-500` complete), which the `vs. DESIGN` token axis can check rather than eyeball. Because the backend exposes no `isActive`, the card's "days left" / "Mission complete" states must be derived client-side from `status` plus dates — a seam worth explicit coverage.

## 7. Risks carried into execution

- **ECL-14.8 / VCST-5651** — PR #14's forward EF migration is already applied to the shared vcst-qa database and has no down-migration. Reverting the module reproduces the original incident (`Invalid column name` leading to `data.cart: null`). **Do not revert the Loyalty pin on vcst-qa.**
- **ECL-14.9** — the cart validator loop is unguarded, so one loyalty validator exception nulls the entire `cart` object for every module. Trigger is any loyalty-priced line, not a mixed cart specifically.
- **ECL-14.7** — mission progress updates via an order event, asynchronously to the checkout response. Post-order assertions need a settle, never a fixed sleep.
- **No documentation exists** — VirtoOZ has no Missions content; the PR adds 4 lines. A DoD gap in its own right.
- **Admin blade checks cannot run on firefox** (`browser_click` limitation on the Admin SPA) — chrome/edge only.

## 8. Open questions for the story author

1. Is the consolidated `loyaltyMissionProgress` shape the intended contract, or should the flat 9-field AC-8 projection be built? (Blocks C15/C16 expected values.)
2. Which log does AC-7 mean — the contribution ledger or the balance log?
3. When both CustomerIDs and a Customer-group condition are set, is the rule AND or OR? (C8 is unanswerable without this.)
4. ~~Is `Loyalty.Missions.Enable` independent of base `Loyalty.Enable`?~~ **ANSWERED: independent.** Now a product question — missions accrue and pay out with the base loyalty program switched off. Is that intended?
5. Is the unrenamed `/api/loyalty-program-operation-log` route intentional back-compat?

## 9. Proposed invariants (for /qa-review-oracles, not written directly)

`PROPOSED-BL-LOY-015` published-mission immutability + zero-reward completion · `PROPOSED-BL-LOY-016` save-time validation (date range, zero/negative target) · `PROPOSED-BL-LOY-017` mission currency matching.

---

*Sources: Jira VCST-5320 / 5319 / 5346 / 5651; vc-module-loyalty PR #14; Claude Design project `e3742011-b4ef-4cd0-a419-722e09833d37`; `.claude/knowledge/oracles/business-logic.md` Domain 17; `.claude/knowledge/oracles/e-commerce-edge-cases-library.md` §13.3, §14.7–14.9.*
