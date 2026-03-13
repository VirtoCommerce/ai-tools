# State Transition — Toggle Changes Mid-Session

Tests what happens when admin toggles change while a user has an active cart/session.

## State Transition Table

| # | Current State | Event (Admin Toggle) | Expected Behavior | BL Reference |
|---|---------------|---------------------|-------------------|-------------|
| ST-1 | Configurable, section filled, item in cart | `isRequired` toggled OFF on section | Cart remains valid, existing config preserved | — |
| ST-2 | Configurable product in cart | Product deactivated (`isActive` → false) | Cart flags item as unavailable, blocks checkout | BL-CART-002 |
| ST-3 | Config option selected, item in cart | Selected option's stock drops to 0 | Error on checkout attempt, option marked unavailable | BL-CART-002 |
| ST-4 | Sale price active, item in cart | Sale price removed in admin | Cart recalculates to list price on next refresh | BL-PRICE-001 |
| ST-5 | Auto promo applied to cart total | Promotion disabled in admin | Cart total recalculates, discount removed | BL-CART-003 |
| ST-6 | Coupon applied + configurable in cart | User clicks "Edit configuration", changes option | Price recalculates with new option + coupon reapplied | BL-PRICE-001 |
| ST-7 | File uploaded in required File section | Admin changes section from required to optional | Upload preserved, "None" option now available | — |
| ST-8 | Text entered in Text section | Admin adds new predefined values to section | Existing custom text preserved; new values available on re-edit | — |

## State Diagram: Product Availability Transitions

```
                    deactivate
  Active+Buyable ──────────────► Inactive
       │    ▲                       │
       │    │ reactivate            │ reactivate
       │    │      ┌────────────────┘
       │    │      ▼
       │    Active+Buyable
       │
       │ stock → 0
       ▼
  Active+NotBuyable ◄──── Out of Stock badge
       │
       │ restock (qty > 0)
       ▼
  Active+Buyable
```
