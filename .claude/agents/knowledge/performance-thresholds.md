# Performance Thresholds — Virto Commerce Platform

Unified performance criteria for storefront, API, and admin testing.

## Storefront (Vue.js)

| Metric | Good | Bug | P0 Escalation |
|--------|------|-----|---------------|
| LCP | < 2.5s | > 2.5s | > 4.0s |
| CLS | < 0.1 | > 0.1 | Any shift during checkout |
| FCP | < 1.5s | > 1.5s | — |
| TTI | < 3.5s | > 3.5s | — |
| FID | < 100ms | > 100ms | — |
| Page weight | < 2MB | > 2MB | — |

## API (REST + GraphQL)

| Metric | Good | Bug | P0 Escalation |
|--------|------|-----|---------------|
| REST API response | < 500ms | > 500ms | > 2s |
| GraphQL query | < 500ms | > 500ms | > 2s (nested) |

## Admin SPA (Angular/VC-Shell)

| Metric | Good | Bug | P0 Escalation |
|--------|------|-----|---------------|
| Admin blade open | < 1s | > 2s | — |

## Backend Jobs & Indexing

| Metric | Good | Bug | P0 Escalation |
|--------|------|-----|---------------|
| Search index rebuild | < 30s | > 60s | stuck > 5min |
| CSV import (100 items) | < 30s | > 60s | — |
| Hangfire job | completes | fails silently | stuck > 5min |
