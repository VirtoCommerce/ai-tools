---
id: BL-CART-010
title: Cart total excludes tax until a shipping address is known
scope: platform
kind: invariant
appliesTo: ">=3.800.0 <4.0.0"
relation: new
status: active
tags: [cart, tax, totals]
audited:
  date: 2026-08-20
  source: live
  ref: REG-2026-08-20-0900/SMK-004
---

The cart summary shows a tax line of `0.00` and excludes tax from the grand total
until the shopper has supplied a shipping address. Tax becomes part of the total only
once an address makes a tax jurisdiction resolvable.

**Violation signal:** a non-zero tax line on an address-less cart, or a grand total
that differs from the sum of line subtotals plus shipping.
