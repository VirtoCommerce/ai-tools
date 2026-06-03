# Jasmine/Karma patterns for VC Admin SPA fixes

Encode an Admin-UI bug as a failing Jasmine spec (red), then prove the fix green. Match the module's
existing spec style first; create a minimal harness only if low-risk, else BAIL-back.

## Spec shape (service / controller logic)
```js
describe('pricingListBlade (VCST-1234)', function () {
  var ctrl, svc;
  beforeEach(module('virtoCommerce.pricingModule'));
  beforeEach(inject(function ($controller, _pricingApi_) {
    svc = _pricingApi_;
    ctrl = $controller('pricingListController', { /* mocked deps */ });
  }));

  it('does not show $0 when price list is empty', function () {
    ctrl.prices = [];
    ctrl.recalc();
    expect(ctrl.displayPrices).not.toContain(jasmine.objectContaining({ list: 0 }));
  });
});
```

## Guidance
- **Prefer logic over DOM:** test the controller/service computed state; reserve DOM/template assertions
  for when the bug is genuinely in the binding.
- **Mock the API** (`$httpBackend` or the module's `$resource` service) — no live calls, deterministic.
- **Visual/layout bugs** that can't be asserted in a unit spec: test the underlying computed
  value/class and clearly note in the PR body that the visual aspect needs human/Storybook check.
- Confirm **red** with the module's JS test command before fixing; **only ADD** specs — never edit an
  existing one to pass (Gate 3).
