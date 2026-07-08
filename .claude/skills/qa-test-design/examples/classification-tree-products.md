# Classification Tree — Product Coverage Structure

Pick one leaf from each branch to form one test case.

```
Product Under Test
├── Type
│   ├── Physical Simple ─────────── CFG-007 (Product No variations, $900)
│   ├── Physical + Variations ───── CFG-008 (No B2C Layout, From $300), Jeans
│   ├── Configurable
│   │   ├── Product section ─────── CFG-001 (Hat, $15), CFG-010 (Test Bike, $438)
│   │   ├── Variation section ───── CFG-009 (Bike with options, VCST-4765)
│   │   ├── Text section ────────── CFG-006 (Base product EN, 3 text sections)
│   │   └── File section ───────── CFG-004 (optional), CFG-005 (required)
│   └── Digital ─────────────────── Gift Cards (no shipping step)
├── Pricing State
│   ├── List price only
│   ├── Sale price active ───────── CFG-005 ($250 sale / $300 list)
│   └── Sale + promo/coupon ─────── CFG-010 + coupon (see decision-table-promo-configurable.md R3)
└── Availability
    ├── In stock + Active ───────── Default state for all CFG-* products
    ├── Out of stock ────────────── Simulate by setting stock=0 in admin
    └── Inactive / Not buyable ──── Deactivate product in admin catalog
```

**Coverage math:** 7 type leaves x 3 pricing x 3 availability = **63 theoretical**. After removing invalid combos and deduplicating with pairwise matrix: **~50-60 unique test cases**.
