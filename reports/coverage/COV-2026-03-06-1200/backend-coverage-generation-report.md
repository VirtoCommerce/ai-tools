# Backend Coverage Generation Report — COV-2026-03-06-1200

## Summary
- **Run date:** 2026-03-06 12:30
- **Scope:** P0 backend (business logic invariants, score >= 8.0)
- **Gaps analyzed:** 10 (across PRICING, ORDERS, CROSS-DOMAIN, AUTH)
- **Test cases generated:** 32 (Critical: 19, High: 13)
- **Test cases validated:** 0 / 32 (generation-only run, no browser validation)
- **Suites modified:** [08, 15, 19, 20]

## Suite Changes

| Suite | Name | Before | After | Delta |
|-------|------|--------|-------|-------|
| 08 | Security Tests | 18 | 21 | +3 |
| 15 | GraphQL xAPI Tests | 20 | 29 | +9 |
| 19 | Pricing Admin Tests | 58 | 64 | +6 |
| 20 | Orders Admin Tests | 66 | 80 | +14 |
| **Total** | | **162** | **194** | **+32** |

## Batch Results

| Batch | Agent | Domains | Gaps | Cases | Suites | Duration |
|-------|-------|---------|------|-------|--------|----------|
| A-backend | qa-backend-expert | PRICING, ORDERS, AUTH | 7 | 23 | 19, 20, 08 | ~3m |
| B-backend | qa-testing-expert | CROSS-DOMAIN (xAPI) | 3 | 9 | 15 | ~2m |

## Generated Test Cases by Gap

### PRICING — Discount Stacking & Tax (BL-PRICE-001, BL-PRICE-002)

| ID | Title | Invariant | Priority |
|----|-------|-----------|----------|
| PRICE-059 | Coupon on sale price (not list price) | BL-PRICE-001 | Critical |
| PRICE-060 | Coupon on tier price at qty threshold | BL-PRICE-001 | Critical |
| PRICE-061 | 3-layer stack: sale + tier + coupon | BL-PRICE-001 | Critical |
| PRICE-062 | Tax = taxRate x (subtotal - discount) | BL-PRICE-002 | Critical |
| PRICE-063 | Tax recalculates when coupon removed | BL-PRICE-002 | Critical |
| PRICE-064 | Tax base uses post-tier amount | BL-PRICE-002 | Critical |

### ORDERS — State Machine Guards (BL-ORD-001, BL-ORD-004, BL-ORD-007)

| ID | Title | Invariant | Priority |
|----|-------|-----------|----------|
| ORD-077 | Payment: Pending->Captured (illegal skip) | BL-ORD-001 | High |
| ORD-078 | Payment: Voided->Captured (illegal) | BL-ORD-001 | High |
| ORD-079 | Payment: Refunded->Captured (illegal) | BL-ORD-001 | High |
| ORD-080 | Admin shows only valid transition buttons | BL-ORD-006 | High |
| ORD-081 | Partial refund exceeds remaining balance | BL-ORD-004 | High |
| ORD-082 | Refund on voided payment rejected | BL-ORD-004 | High |
| ORD-083 | Double refund on fully refunded rejected | BL-ORD-004 | High |
| ORD-084 | Shipment: New->Sent (skip PickPack) | BL-ORD-007 | High |
| ORD-085 | Shipment: New->Delivered (skip 2 states) | BL-ORD-007 | High |
| ORD-086 | Shipment: Delivered->Sent (backward) | BL-ORD-007 | High |

### ORDERS — Multi-System Side Effects (BL-CROSS-005)

| ID | Title | Invariant | Priority |
|----|-------|-----------|----------|
| ORD-087 | Inventory decremented per line item | BL-CROSS-005 | Critical |
| ORD-088 | Order in customer history | BL-CROSS-005 | Critical |
| ORD-089 | Cart cleared after order | BL-CROSS-005 | Critical |
| ORD-090 | Order number, status, totals match | BL-CROSS-005 | Critical |

### AUTH — Session Expiry (BL-AUTH-001)

| ID | Title | Invariant | Priority |
|----|-------|-----------|----------|
| SEC-SESSION-001 | Session expiry re-auth preserves cart | BL-AUTH-001 | High |
| SEC-SESSION-002 | Re-auth resumes checkout from last step | BL-AUTH-001 | High |
| SEC-SESSION-003 | No orphan order on session expiry | BL-AUTH-001 | High |

### CROSS-DOMAIN — xAPI (BL-CROSS-002, BL-CROSS-010, BL-CROSS-004)

| ID | Title | Invariant | Priority |
|----|-------|-----------|----------|
| GQL-021 | Cart uses live price, not cached index | BL-CROSS-002 | Critical |
| GQL-022 | Listing may lag, syncs after reindex | BL-CROSS-002 | Critical |
| GQL-023 | Price change updates existing cart item | BL-CROSS-002 | Critical |
| GQL-024 | createOrderFromCart idempotent (1 order) | BL-CROSS-010 | Critical |
| GQL-025 | Second call returns same orderId | BL-CROSS-010 | Critical |
| GQL-026 | Cart invalidated after order | BL-CROSS-010 | Critical |
| GQL-027 | Currency switch: all items use new price list | BL-CROSS-004 | High |
| GQL-028 | Shipping rates in new currency | BL-CROSS-004 | High |
| GQL-029 | Product without currency becomes unavailable | BL-CROSS-004 | High |

## Validation Failures

N/A — Generation-only run.

## Remaining Backend Gaps (score < 8.0, deferred to P1 run)

| Gap | Invariant | Score | Reason |
|-----|-----------|-------|--------|
| Price list deletion -> $0 protection | BL-CROSS-001/012 | 7.8 | PRICE-010 partially covers |
| Module disable -> graceful degradation | BL-CROSS-003/011 | 7.0 | Infrastructure-level |
| Feature flag toggle -> immediate effect | BL-CROSS-006 | 6.5 | Lower frequency |
| Entity deletion cascade cleanup | BL-CROSS-007 | 6.0 | Lower frequency |
| Eventual consistency bounded 120s | BL-CROSS-009 | 6.5 | GQL-022 partially covers |

## Next Steps

1. **Validate** backend P0 cases via `/qa-regression 15,19,20` focusing on new IDs
2. **P1 backend run** to address remaining gaps above
3. **Update business-logic.md** with test case cross-references per invariant
