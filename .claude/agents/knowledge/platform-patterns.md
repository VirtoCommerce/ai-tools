# Virto Commerce Platform Patterns

Cross-layer architecture knowledge shared by all QA agents.

## Storefront (Vue.js, `FRONT_URL`)

- **SSR + Hydration**: `[Vue warn]: Hydration` in console = server/client mismatch, causes UI flicker and stale state
- **xAPI GraphQL**: Returns errors *inside* HTTP 200 — always check `response.data.errors[]`, not just status code
- **Cart state**: Lives in localStorage + server. Desync after refresh = stale prices/quantities. Common after Admin price changes
- **Coffee theme**: CSS custom properties for theming. Theme switch may cause FOUC if variables load late
- **Search**: Elasticsearch via xAPI — reindex lag means newly created products won't appear immediately
- **Payment iframes**: Skyflow, CyberSource live in cross-origin frames — console errors from the iframe are NOT visible in the main console

## Admin SPA (Angular/VC-Shell, `BACK_URL`)

- **Blade UI**: Sliding modal panels that stack left-to-right — the core navigation model
- **Memory leaks**: Angular console errors on blade open/close = bug (watch for repeated open/close)
- **State persistence**: Edit form -> open nested blade -> return -> edits must persist
- **Tooltip behavior**: Only one tooltip unfolded at a time, folds when switching
- **Hangfire dashboard** (`/hangfire`): Shows background job health — silent failures hide here
- **Module changes**: Admin changes may not reflect on storefront until Elasticsearch reindex or cache purge

## API Layer

### REST
- **Status codes**: 201=created, 204=deleted, 400=validation, 401=unauthorized, 403=forbidden, 404=not found. "200 for everything" = contract bug
- **Idempotency**: PUT is idempotent (repeat = same result), POST is not (repeat = duplicate). Test this.
- **Pagination**: `skip/take` with `totalCount` in response
- **Error responses**: Should include error code, message, no stack traces in production. Validate error shape, not just status code

### GraphQL xAPI
- **Errors inside HTTP 200**: Always check `response.data.errors[]` — partial data with errors is valid GraphQL behavior
- **Store context**: All xAPI queries require `storeId`, `cultureName`, `currencyCode` — missing context = confusing errors
- **Pagination**: `first/after` cursor-based. Off-by-one bugs common at boundaries

## Data Cascade Effects

Where the worst cross-module bugs hide:
- Delete catalog -> products, prices, search index entries should cascade-delete
- Delete price list -> storefront shows $0 + "Unavailable", can't add to cart
- Cancel order -> inventory adjusts only if "Adjust inventory" flag enabled
- Disable module -> API returns 404, Admin section disappears, dependent modules may break
- Change product -> search index stale until rebuild (event-based indexation may or may not trigger)
- Change FFC stock to 0 -> storefront "Sold out" label, "Add to cart" disabled
