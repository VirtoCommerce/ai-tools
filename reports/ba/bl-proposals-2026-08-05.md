# Business Logic Proposals — 2026-08-05 (BL-CART-009 coupon slot, VCST-5518)

**Scope:** a single-invariant audit of `BL-CART-009` ("Storefront cart enforces a single active coupon
slot"), triggered by the `/qa-verify-fix VCST-5518` run. The entry bundles **three separable claims**;
two were resolved and applied this run (see `BL-AUDIT-2026-08-05.md`), and **one is held below** because
its axes genuinely contradict.

| Candidate | Docs | Source | Live | Verdict |
|---|:---:|:---:|:---:|---|
| BL-CART-009 Claim B — replacement call order | N/A (waived) | `dev` HEAD: remove→validate→add | validate→remove→add | **CONTRADICTORY (build skew)** |

---

## Held draft (axes contradict — build skew, a *not-yet* rather than a failure)

### BL-CART-009 / Claim B: the `applyCoupon` replacement call order

**The current oracle text (unchanged this run) says:**

> (a) clicking "Apply" on a DIFFERENT preset card auto-replaces the current coupon — `applyCoupon(new)`
> first awaits `removeCoupon(current)`, then `validateCoupon(new)`, then `addCoupon(new)`, in that order

and `Verify:` asserts that same order on the network.

**Why it is held, not applied — the two axes describe two different builds:**

| Axis | Observation |
|---|---|
| Source — `vc-frontend@dev` HEAD | `useCoupon.ts › applyCoupon()`: `removeCartCoupon` → `validateCartCoupon` → `addCartCoupon`. **Matches the current oracle text exactly.** |
| Source — `VirtoCommerce/vc-frontend#2422` head (OPEN, unmerged) | Moves the `removeCartCoupon` block to run **after** `validateCartCoupon` ⇒ `validateCartCoupon` → `removeCartCoupon` → `addCartCoupon`. This PR is itself the VCST-5518 fix. |
| Live — the environment under test | GraphQL fired in order `ValidateCoupon` → `RemoveCoupon` → `AddCoupon` (three consecutive requests, one session). The environment is pinned to the **PR's prerelease artifact**, not to `dev`. |

So live is *ahead of* `dev` — the inverse of ordinary deploy lag. Per `bl-audit-criteria.md`, a live-vs-source
conflict is held with a re-audit trigger and **never** resolved by picking whichever axis is more
convenient. Applying the new order now would make the oracle describe a build that is not yet the merged
baseline; applying nothing keeps it accurate for `dev` today. Hence: no edit, one staged item.

**Proposed edit once the trigger fires** (all four are body-only, env-agnostic):
1. `Rule:` clause (a) → `applyCoupon(new)` first awaits `validateCoupon(new)`, and only on success
   `removeCoupon(current)` then `addCoupon(new)`.
2. `Verify:` the network-order sentence → `validateCoupon`(B) → `removeCoupon`(A) 200 → `addCoupon`(B) 200,
   in that order.
3. `Source:` drop the "on `dev` HEAD" qualifier and the skew pointer.
4. `Violation signal:` retire/soften the VCST-5518 parenthetical — the described defect
   (an invalid replacement dropping the prior valid coupon) is fixed by that PR, so it stops being a
   "separately tracked" exception and becomes a **positive** assertion: an invalid replacement must leave
   the applied coupon untouched and must emit **no** `RemoveCoupon` at all.

**Re-audit trigger:** when `VirtoCommerce/vc-frontend#2422` merges to `dev`. At that point source and live
agree and the item clears the bar as a straightforward DRIFT.

**Evidence:** `useCoupon.ts` at `dev` HEAD vs the PR #2422 diff (GitHub MCP, read-only); the live GraphQL
request sequence captured this session on `playwright-firefox` with a dedicated shopper account.

---

## Coverage note (not a proposal)

**CORRECTION (2026-08-05):** this section originally said `BL-CART-009` was **BLC-004 — uncovered**. That was
**wrong** — `CPN-060` (077) and `CPN-SMK-060` (077b) both cite it in `Business_Rule`. The BLC-004 finding was a
**linter false positive**: `buildCoverage()` in `scripts/knowledge/lint-bl.ts` silently `continue`s when
`parseSuite()` throws, and `parseSuite` throws on a UTF-8 BOM — which **12 of 120** suite CSVs carry, including
both 077 files. Details + blast radius in `reports/knowledge/BL-AUDIT-2026-08-05.md` §Coverage reconciliation.

The **real** gap is narrower: no case cites `BL-CART-009` for its **read-only / input-provenance facet**
(Claim C); the two existing citations are both for last-applied-wins anti-stacking. Suggested homes,
deliberately not authored here (authoring stays with `/qa-test-cases-generator`):

- `regression/suites/Frontend/marketing/077-coupons-promotions-storefront.csv` (`CPN-*`) — the natural home
  for Claims A and C: preset-card vs custom-input replacement, per-card-type read-only assertions, and the
  single-slot assertion against `cart.coupons[]`.
- `regression/suites/Frontend/cart/029-cart-validation-persistence.csv` `CART-015` — extend rather than
  duplicate if it already exercises coupon-adjacent cart state; otherwise prefer a new `CPN-*` in 077 to
  keep coupon logic in one suite.
- Once Claim B's re-audit lands, the same case(s) should carry the call-order assertion plus a regression
  case for VCST-5518 itself — now live-reproducible as **fixed** behavior.

---

# Third set — `BL-AUTH-*` domain audit (`/qa-review-bl domain auth`, BL-AUDIT-2026-08-05)

Two parallel `ba-system-analyzer` batches over all 16 `BL-AUTH-*`. 10 auto-applied (see the oracle
diff); the 5 below are **not applied** — each names its re-audit trigger.

## 1. BL-AUTH-008 — self-impersonation · **CONTRADICTORY** — needs a human ruling

Source + live agree with each other and **contradict the invariant**. Live: an operator holding the
login-on-behalf permission impersonated **their own** user id → HTTP 200, and the header rendered
`<operator> · logged in as · <operator>` — operator == target. That is verbatim the entry's own
Violation signal, and none of the three outcomes its Rule permits. Source shows no self-target guard at
either layer (the token endpoint resolves the operator as `OperatorUserId ?? user.Id`, so a self-target
mints a token whose subject and operator claim are the same principal; the storefront calls the
impersonate grant with no self-check).

**Why it was not auto-applied even though the decision table reads DRIFT:** BL-AUTH-008 is a
**prescriptive** quality bar, not a description of behaviour. Rewriting it to match observed-and-accepted
behaviour is a retire-in-disguise, which stays human-gated. And the product has already ruled the other
way — suite `082-auth-impersonation` case `IMP-017` asserts self-impersonation is *"a harmless no-op …
a circular banner may appear — cosmetic only, no security impact"*, with References reading *"VCST-4725,
VCST-5174 (closed Not a bug / by design 2026-06-01); BL-AUTH-008 … contradicts by-design — flag for
review"*. The corpus asked for a human two months ago.

- **Option A (retire)** — accept the by-design ruling; retire the invariant and drop its `Agents:` claim
  that a backend self-target rejection exists (it does not).
- **Option B (keep, narrowed)** — keep it as a UX-polish bar: drop outcomes (a)/(b) and the
  backend-rejection premise, reduce the assertion to "no infinite redirect loop, no wedged session"
  (both still true), and record the circular banner as an accepted deviation.

**Traceability defect found alongside:** the entry says *"Applies to: IMP-017"*, but IMP-017's
`Business_Rule` cites `BL-AUTH-005, BL-AUTH-006`. `BL-AUTH-008` appears in **no** `Business_Rule` cell
anywhere in the corpus — zero citing cases (a BLC-004).

**Re-audit trigger:** a decision recorded on VCST-4725 / VCST-5174, or a code change adding a
self-target guard at either layer.

## 2. BL-AUTH-002 — email verification gate · **UNGROUNDED** (docs + source evidenced; live not observable)

Docs and source **agree with each other and both contradict the current Rule** on two points: the Rule
names **one** store setting where enforcement requires **two** (an "enabled" flag AND a "required" flag,
both defaulting to off), and it describes a **per-feature** gate where enforcement is a **sign-in
refusal** at the token request. Not applied because the refusal path could not be exercised: on the
audited environment the two flags are split (enabled true, required false) so the gate is inert, and
turning it on means mutating a shared store setting.

A full corrected body (Rule / Verify / Violation signal / Agents) is drafted and ready to apply as-is.

**Re-audit trigger:** a store with both flags true (or a dedicated single-store fixture), then a
password grant for a contact whose email is unconfirmed → assert the email-verification-required code.

## 3. BL-AUTH-001 — session expiry during checkout · **UNGROUNDED** (two axes empty)

Docs produced only adjacent facts (an access-token lifetime default, and cart merge on authentication) —
**no** statement that the cart survives session expiry or that checkout resumes at the last step. No
source anchor was found for either behaviour ("the cart is server-side" is an architectural inference,
not an anchor). Live was **partial**: a sign-out/sign-in round-trip preserved the cart exactly, but
**session expiry was never triggered** (that needs token manipulation, which the real-user rule forbids,
or a wait longer than the token lifetime) and checkout-step resumption was not observed. With **39
citing cases**, no rewrite was proposed off one partial observation.

Worth splitting on the next pass: the *cart-preserved* half now has live support; the
*checkout-resumable* half has **zero** evidence on any axis and may be aspirational.

**Re-audit trigger:** a doc or source anchor for cart retention across an expired token, **or** an
environment whose access-token lifetime is short enough to expire inside a session.

## 4. BL-AUTH-003 — account lockout after N failed attempts · **UNGROUNDED** (live axis blocked)

Docs + source both confirm, and source is now **sharper than the entry records** — the platform's own
`appsettings.json` carries the concrete `MaxFailedAccessAttempts` and lockout-duration defaults, which
anchors the Rule's "platform default: 5" claim that was previously unanchored. The live axis was
**refused by the harness auto-mode classifier**: a deliberate repeated-failed-login sequence reads as
brute force. No edit was made — with **35 citing cases** the entry keeps its existing 3/3 stamp rather
than being restamped on two axes.

**Re-audit trigger:** a permission rule allowing the lockout probe, or a manual run. Held for that pass:
adding the `appsettings.json` anchor to `Source:`.

## 5. BL-AUTH-009 — nested impersonation forbidden · **UNGROUNDED by policy** (P0-security)

Live was **deliberately not probed** — a real chained-impersonation attempt is a privilege-escalation
probe, and the skill's P0-security rule makes an unobservable live axis UNGROUNDED rather than inferred.
Source confirms the entry's `⚠️ CURRENTLY VIOLATED` block is **still accurate at default-branch HEAD**:
the login-on-behalf permission check is wrapped in a guard that skips it whenever the presented token
already carries an operator claim, so nothing in the entry needs correcting — only re-confirming.

**Re-audit trigger:** that guard disappearing (permission checked whenever a non-empty target is
supplied), or the linked nested-impersonation bug transitioning. At that point the `⚠️ CURRENTLY
VIOLATED` block must be rewritten and the live axis re-scoped to a post-fix rejection assertion, which
**is** safe to observe (expect 4xx).

## Follow-ups that are not invariant changes

- **`BL-AUTH-005` title is a misnomer** — "RBAC 6-permission model": the 6th permission is
  module-specific (`invite` for Customer, `read_prices` for Orders) and `export` exists on only ~5 of
  ~53 permission groups. The Rule **body** already says exactly this, so neither was touched — recorded
  so a later pass does not "fix" the body to match the title. 58 citing cases.
- **Fixture drift, `LOCKOUT_TEST_USERS`** — all five accounts in that inline alias are **absent** from
  the audited environment. Suites `031` (`AUTH-070`), `020` (`PLAT-081/082/083`) and `049` (`API-036`)
  cite them, so those cases cannot be executing what they claim. Needs `td:reconcile` + a
  `/qa-review-tests` pass; not touched here (`test-data/` was out of write scope).
- **`CurrentOrganizationId` is mutated by any explicit-org token grant** (the write-back now recorded in
  BL-AUTH-015). Fixture guards that snapshot it should expect drift from unrelated auth probes — this
  made a step-1-vs-step-3 probe look like a contradiction until it was traced to the handler.
