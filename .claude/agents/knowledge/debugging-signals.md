# Debugging Signals — Console & Network Error Patterns

## Console Error Patterns

| Pattern | Meaning | Severity |
|---------|---------|----------|
| `[Vue warn]: Hydration` | SSR/client mismatch — UI flicker, stale state | Medium (High if checkout) |
| `Unhandled promise rejection` | Async error not caught — feature may silently fail | High |
| `ChunkLoadError` | Bundle not found — deployment or CDN issue | High (P0 if blocks page) |
| `TypeError: Cannot read properties of null` | Missing DOM element or null API response | High |
| `CORS error` | Cross-origin blocked — integration broken | High (P0 if payment iframe) |
| `CSP violation` | Content Security Policy blocks resource | Medium (High if functional impact) |
| `extension://` messages | Browser extension noise | Ignore |
| Angular `ExpressionChangedAfterItHasBeenChecked` | Change detection error — blade state bug | Medium |

## Network Red Flags

- **HTTP 4xx on API calls** = application error — inspect request payload for what went wrong
- **HTTP 5xx** = server error — capture full request that triggered it
- **Duplicate API calls** on single action = missing debounce, performance bug
- **CORS preflight failure** on payment iframes = integration configuration issue (Skyflow, CyberSource)
- **GraphQL response with both `data` and `errors`** = partial failure, inspect both sections
- **Slow response (> 500ms)** = performance bug, check if it's consistent or intermittent
- **Silent 4xx on lazy-loaded images** = visual bugs with no console trace
- **Mixed content warnings** = security flag, blocks resources on HTTPS
