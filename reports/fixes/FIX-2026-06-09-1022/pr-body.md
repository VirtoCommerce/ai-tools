## 🛑 DO NOT MERGE until human review

Automated fix opened by `/qa-fix` (interactive twin of `ci/run-fix-cycle.ts`). Opened for human review — **never auto-merged**.

### Bug — VCST-4767
Admin SPA → Marketing → Promotions → [Promotion] → Coupons → Add Coupon. The coupon **Code** field renders the hint *"Coupon code may contain only alphanumeric characters"*, but no validation enforced it — `TEST@#$%!`, spaces, and unicode were accepted and the coupon was created successfully.

### Fix — client-side only (non-breaking)
Added `ng-pattern="/^[a-zA-Z0-9]+$/"` to the coupon Code `<input>` in `coupon-detail.tpl.html`. The Create button is already `ng-disabled="!isValid()"` and `isValid()` returns `formCoupon.$valid`, so the pattern now blocks creation of non-alphanumeric codes — matching the existing hint text exactly. The same `isValid()` gate backs the edit-mode toolbar **Save**, so the rule applies uniformly (expected). `required` already covers the empty case.

**Scope: client-side only — no server/API/DTO change, no new 400s (non-breaking).** Server-side enforcement was intentionally excluded because newly rejecting previously-accepted input would be a breaking API behavior change.

```diff
-  <input ... type="text" ng-model="blade.currentEntity.code" />
+  <input ... type="text" ng-model="blade.currentEntity.code" ng-pattern="/^[a-zA-Z0-9]+$/" />
```

### Gate evidence
- **Gate 2 (RED) → Gate 3 (GREEN)** via an uncommitted Node scratch harness that reads the real template and replicates AngularJS ngModel validity:
  ```
  BEFORE: RED — accepted "TEST@#$%!", "CODE WITH SPACE", "naïve", "sale-2024", "A_B", "10%off"  (exit 1)
  AFTER:  GREEN — rejects non-alphanumeric; still accepts SUMMER2024, abc123, PROMO, 42         (exit 0)
  ```
- **Build:** `dotnet build VirtoCommerce.MarketingModule.Web.csproj -c Debug` → Build succeeded, 0 warnings, 0 errors.
- **Pre-existing tests:** none modified (module has no in-repo JS harness; backend tests untouched).
- **Gate 4 (review):** APPROVE — `ng-pattern` propagates to `formCoupon.$valid` (the input's missing `name` attr does not prevent aggregate form validity), regex matches the hint, applies consistently to create + edit.

### Deploy verification
🔖 **needs deploy verification** — backend/Admin-SPA is static-only in CI; the live disabled-button behavior is confirmed post-deploy. Gate 6 closes via `/qa-verify-fix VCST-4767` once this PR's artifact deploys to QA.

Relates to **VCST-4767**.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
