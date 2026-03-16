# User Stories Index

This directory contains Agile user stories produced by the `ba-story-writer` agent for the Virto Commerce B2B e-commerce platform. Each file covers one epic.

## Epics

| File | Epic ID | Title | Stories | Status |
|------|---------|-------|---------|--------|
| [EPIC-CP-SORT-stories.md](./EPIC-CP-SORT-stories.md) | EPIC-CP-SORT | Configurable Product Sorting Improvements | 4 | Draft |

## Story Summary

### EPIC-CP-SORT — Configurable Product Sorting Improvements

Addresses four sorting gaps identified during BA analysis of the configurable products feature domain.

| Story ID | Title | Type | Priority | Effort |
|----------|-------|------|----------|--------|
| CP-SORT-01 | Show Effective Minimum Price on Configurable Product Listing Cards | Improvement | High | M |
| CP-SORT-02 | Preserve Sort Order When Shopper Applies Facet Filters | Bug Fix | High | S |
| CP-SORT-03 | Allow Shoppers to Sort Options Within a Configuration Section on PDP | Feature | Medium | M |
| CP-SORT-04 | Allow Catalog Managers to Set Display Order of Section Options in Admin | Feature | Medium | S |

**Recommended implementation order:** CP-SORT-02 first (unblocks everything; lowest risk), then CP-SORT-04 (data model foundation), then CP-SORT-01 and CP-SORT-03 in parallel.

## Conventions

- Story IDs follow the pattern `[EPIC-ID]-[NN]`
- BDD acceptance criteria use Given/When/Then with explicit verifiable outcomes
- All "From" price labels use i18n key `product.price.from`
- Sort URL parameter key: `sort`; values: `price-asc`, `price-desc`, `name-asc`, `featured`
