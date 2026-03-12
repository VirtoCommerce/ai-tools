# Store Settings — Agent Reference

QA testing knowledge for the Virto Commerce Store Settings module.
For API schema (StoreResponseType, StoreSettingsType, GraphQL queries, REST endpoints) see `.claude/skills/testing/qa-api/xapi-query-ref.md` → **Store Settings** section.

## What It Does

Store settings control all aspects of a store: identity, catalog, languages, currencies, feature flags, SEO, payment/shipping methods, and frontend behavior. Configured in Admin SPA under **Stores → select store**.

---

## Admin UI — Store Settings Sections

| Section / Blade | Location | What to Configure |
|----------------|----------|-------------------|
| **General** | Stores → select store | Name, catalog, store URL, default language & currency |
| **Languages & Currencies** | General blade | `availableLanguages`, `availableCurrencies` |
| **Payment methods** | Store → Payment methods widget | Select method, enter details, set logo URL (e.g., `/static/icons/payment-methods/credit-card.svg`) |
| **Shipping methods** | Store → Shipping methods widget | Fulfillment center linkage |
| **White Labeling** | Store → White Labeling blade | Logo, favicon, theme preset, footer/main menu link lists (see `white-labeling.md`) |
| **Frontend / Module settings** | Store → settings blade | `isSpa`, `seoLinkType`, per-module flags (GA4, etc.) |

---

## Key Feature Flags — QA Impact

| Flag | When ON | When OFF |
|------|---------|----------|
| `anonymousUsersAllowed` | Guest can browse catalog without login | Redirect to login on any catalog access |
| `isSpa` | SPA routing — all URLs resolve to `index.html` (200) | SSR mode — route misses return real 404 |
| `emailVerificationEnabled` | Verification email sent on registration | No verification step |
| `emailVerificationRequired` | Cannot proceed without verifying email | Optional verification |
| `createAnonymousOrderEnabled` | Guest checkout available | Checkout requires account |
| `quotesEnabled` | RFQ / quote workflow visible | Quote buttons hidden |
| `subscriptionEnabled` | Subscription purchase option shown | Not available |
| `taxCalculationEnabled` | Tax calculated at checkout | No tax applied |

---

## SPA Architecture — Test Implications

- `isSpa: true` → Vue.js SPA with HTML5 History API; all routes return HTTP 200 (not 404)
- Direct URL navigation and page refresh must work without breaking app state
- Deep links must render correct content (no blank page)
- Back/forward browser buttons must navigate correctly
- `seoLinkType` controls URL shape for products/categories — test that links match expected format

---

## Email Notifications

Configured at platform level via `appsettings.json` (not per-store). Gateways: `Smtp` or `SendGrid`.

**Test sending:**
```bash
POST ${BACK_URL}/api/notifications/send
{ "type": "RemindUserNameEmailNotification", "from": "no-reply@mail.com", "to": "user@example.com" }
```

Check failures in Admin SPA: **Notifications → Notification activity feed**.

---

## Related Modules / Interactions

- **White Labeling** — theme preset, logos, link lists layer on top of store settings (see `white-labeling.md`)
- **Content > Store > Link Lists** — source for footer/main menu navigation
- **Google Analytics** — configured via `settings.modules[VirtoCommerce.GoogleEcommerceAnalytics]`
- **Vue.js Storefront** — reads `isSpa`, `anonymousUsersAllowed`, `seoLinkType` at runtime via xAPI
- **vc-shell Admin SPA** — reads `graphQLSettings` for endpoint configuration

---

## Regression Suites

- **Suite 29** — Backend: `regression/suites/Backend/29-store-settings.csv`
- Covered by suite 14 (Platform API) for REST `/api/stores` endpoints

## Sources

- [StoreSettingsType](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/Store/objects/StoreSettingsType.md)
- [StoreResponseType](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/Store/objects/StoreResponseType.md)
- [store query](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/Store/queries/store.md)
- [Feature flags / module settings](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/Tutorials-and-How-tos/How-tos/feature-flags.md)
- [SPA architecture](https://github.com/virtocommerce/vc-docs/blob/main/storefront/developer-guide/docs/spa-architecture-for-seo-and-404-handling.md)
- [Email notifications setup](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/Getting-Started/Post-Installation-Steps/02-configuring-email-notifications.md)
