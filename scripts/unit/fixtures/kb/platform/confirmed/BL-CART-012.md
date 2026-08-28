---
id: BL-CART-012
title: Minimum order quantity is reported at cart validation, not at add time
scope: platform
kind: invariant
appliesTo: ">=3.900.0"
relation: new
status: active
supersedes: BL-CART-011
tags: [cart, moq]
audited:
  date: 2026-08-20
  source: source
  ref: vc-module-cart/CartValidator.cs:104
---

A line below its minimum order quantity is added to the cart and surfaces as a cart
validation error; checkout is blocked until the quantity is raised.
