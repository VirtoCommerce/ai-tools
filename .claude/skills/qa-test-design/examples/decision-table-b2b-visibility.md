# Decision Table — B2B Permissions x Product Visibility

Covers **BL-B2B** and **BL-AUTH** invariants: how organization roles and catalog assignments affect what products users can see and buy.

## Conditions

| # | Condition | Values |
|---|-----------|--------|
| C1 | User type | Guest, B2C registered, B2B member, B2B admin |
| C2 | Catalog assignment | Org has catalog assigned, Org has no catalog, N/A (non-org) |
| C3 | Product type | Physical, Configurable, Digital |
| C4 | Product visibility | Active, Inactive, Hidden (not in assigned catalog) |

## Rules

| Rule | C1: User | C2: Catalog | C3: Product | C4: Visibility | Expected | Priority |
|------|----------|-------------|-------------|----------------|----------|----------|
| R1 | Guest | N/A | Physical | Active | Visible, can add to cart | P0 |
| R2 | Guest | N/A | Configurable | Active | Visible, "Customize" button shown | P0 |
| R3 | B2C registered | N/A | Digital | Active | Visible, can purchase (no shipping) | P0 |
| R4 | B2B member | Catalog assigned | Physical | Active | Visible with contract price | P0 |
| R5 | B2B member | Catalog assigned | Configurable | Active | Visible, contract price on base + options | P1 |
| R6 | B2B member | Catalog assigned | Physical | Hidden | **Not visible** — product not in org catalog | P1 |
| R7 | B2B member | No catalog | Physical | Active | Visible with store default price (no contract) | P1 |
| R8 | B2B admin | Catalog assigned | Physical | Active | Visible + can place orders for org members | P1 |
| R9 | Guest | N/A | Physical | Inactive | **Not visible** — `isActive=false` | P1 |
| R10 | B2B member | Catalog assigned | Configurable | Inactive | **Not visible** regardless of catalog | P1 |
| R11 | B2C registered | N/A | Physical | Hidden | N/A — B2C has no catalog scoping, sees all active | P2 |
| R12 | B2B admin | No catalog | Digital | Active | Visible with store default price | P2 |

**Key invariant (BL-PRICE-007):** Org members see contract prices; non-org users never see contract prices.
