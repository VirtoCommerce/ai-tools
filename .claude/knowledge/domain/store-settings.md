---
applicability: reference
applicability_rationale: "Storefront store config patterns. Customer's settings differ."
---

# Store Settings — Agent Reference

QA testing knowledge for the Virto Commerce Store Settings module.
For API schema (StoreResponseType, StoreSettingsType, GraphQL queries, REST endpoints) see `skills/qa-api/xapi-query-ref.md` → **Store Settings** section.

## What It Does

Store settings control all aspects of a store: identity, catalog, languages, currencies, feature flags, SEO, payment/shipping methods, tax providers, and frontend behavior. Configured in Admin SPA under **Stores → select store**. You can create any number of stores, each with independent configuration. Customer accounts can be linked across stores.

---

## Admin UI — Store Settings Sections

| Section / Blade | Location | What to Configure |
|----------------|----------|-------------------|
| **General** | Stores → select store | Name, catalog, store URL, default language & currency |
| **Languages & Currencies** | General blade | `availableLanguages`, `availableCurrencies` |
| **Payment methods** | Store → Payment methods widget | Enable/disable per method, set priority (display order at checkout), edit settings, custom UI config, logo URL (e.g., `/static/icons/payment-methods/credit-card.svg`) |
| **Shipping methods** | Store → Shipping methods widget | Fulfillment center linkage |
| **Tax providers** | Store → Tax providers widget | Tax calculation provider selection |
| **SEO** | Store → SEO settings | `seoLinkType`, SEO metadata, URL slug patterns |
| **White Labeling** | Store → White Labeling blade | Logo, favicon, theme preset, footer/main menu link lists (see `white-labeling.md`) |
| **Frontend / Module settings** | Store → settings blade | `isSpa`, per-module public flags (GA4, etc.) — see Public Store Settings below |

---

## Key Feature Flags — QA Impact

| Flag | When ON | When OFF |
|------|---------|----------|
| `anonymousUsersAllowed` | Guest can browse catalog without login | Redirect to login on any catalog access |
| `isSpa` | SPA routing — all URLs resolve to `index.html` (200), soft 404s | SSR mode — route misses return real 404 |
| `emailVerificationEnabled` | Verification email sent on registration | No verification step |
| `emailVerificationRequired` | Cannot proceed without verifying email | Optional verification |
| `createAnonymousOrderEnabled` | Guest checkout available | Checkout requires account |
| `quotesEnabled` | RFQ / quote workflow visible | Quote buttons hidden |
| `subscriptionEnabled` | Subscription purchase option shown | Not available |
| `taxCalculationEnabled` | Tax calculated at checkout | No tax applied |

### Public Store Settings Architecture (Platform 3.813+ / xAPI 3.812+)

Feature flags use the **Public Store Settings** mechanism. Each `SettingDescriptor` has an `IsPublic` property — when true, the setting is exposed to client apps via xAPI. The storefront queries these at runtime per-module:

```graphql
query {
  store(storeId: "B2B-store", cultureName: "en-US") {
    storeId
    settings {
      quotesEnabled
      subscriptionEnabled
      taxCalculationEnabled
      anonymousUsersAllowed
      isSpa
      emailVerificationEnabled
      emailVerificationRequired
      createAnonymousOrderEnabled
      seoLinkType
      modules {
        moduleId
        settings { name value }
      }
    }
  }
}
```

**Module settings example response** (GA4):
```json
{
  "modules": [
    {
      "moduleId": "VirtoCommerce.GoogleEcommerceAnalytics",
      "settings": [
        { "name": "GoogleAnalytics4.EnableTracking", "value": true },
        { "name": "GoogleAnalytics4.MeasurementId", "value": "GA-B2B-STORE" }
      ]
    }
  ]
}
```

**QA note:** Only settings marked `IsPublic` appear in the xAPI response. If a module setting is missing from the response, verify the `IsPublic` flag on the backend `SettingDescriptor`, not just the store config.

### The storefront capability manifest — `npm run store:caps`

The same query carries a third thing the section above leaves out: **`modules { version }`**. That turns this payload into a **capability manifest** — which modules the storefront can see, at which version, and which flags each one exposes — and vc-frontend gates its own UI on exactly this response. Documented end to end in [Application Initialization](https://docs.virtocommerce.org/storefront/developer-guide/application-initialization), which calls it a **capability manifest** and spells out the four boot steps: load the shell → fire an anonymous `InitializeApplication` → cache the manifest → build a **feature map** from its installed-module list and gate every later query against it.

**Do not hand-write the query or transcribe its answer.** Run the probe:

```
npm run store:caps                      # module | version | #public settings
npm run store:caps -- --settings        # every public flag name=value, per module
npm run store:caps -- --module loyalty  # one module (substring filter)
npm run store:caps -- --store           # + store scalars, languages, currencies
npm run store:caps -- --json            # machine-readable
```

It replays the committed fixture (`test-data/graphql/queries/initializeApplicationClient.graphql`) against the `TEST_ENV` host. There is **no committed snapshot and no drift gate** — the deployed manifest changes on every deploy, so a snapshot of it would be stale by design.

#### Two mechanisms that bite QA, both `{DOC}`

**Gating strips, it does not fail.** Optional selections carry `@needsModule`, and the Apollo `apply-gates-link` **removes any selection whose named module is absent from the manifest before the request leaves the browser** — so there is no HTTP 400 and no "Cannot query field" error. A field gated this way (every `VirtoCommerce.WhiteLabeling` contribution, for instance) simply is not asked for. **So "the response has no data for X" has two very different causes** — the backend did not return it, or the client never requested it — and only the outgoing request body tells them apart. Check the request, not just the response, before filing a backend bug.

**The manifest is CACHED, per browser session, shared across tabs**, under `localStorage["vc:initialStore:v1:<storefront-domain>"]`. The boot query is single-fire across navigations: if a cached manifest exists for the domain it is used and `InitializeApplication` is never sent. **A module or flag changed in Admin is therefore invisible to an open session** — and to every other tab on that domain — until that key is cleared. When a flag flip "does not take effect", clear the key before suspecting the platform.

#### Three vantages on "is this deployed?" — they disagree routinely

| Vantage | Source | Needs a token | Answers |
|---|---|---|---|
| `declared` | `vc-deploy-dev` `backend/packages.json` | GitHub MCP | what git says SHOULD be on the env |
| `deployed` | `GET {{BACK_URL}}/api/platform/modules` | **yes**, admin bearer | what IS installed — platform ground truth |
| `storefront-visible` | **this query** / `store:caps` | **no** | what the STOREFRONT can see and gate on |

The third is not a cheaper form of the second, it is a different fact. A module can be installed and healthy at the platform level yet carry no capability the storefront can see — the platform manifest calls that env green while the feature's button never renders. That is the shape of "it's deployed but it isn't there", and only this vantage shows it. Being token-free, it is also the cheapest pre-flight available to any lane.

#### The one toggle that changes how to read it

`XAPI.Security.ReturnModuleVersion` decides what the manifest means, so read the probe's mode line first:

- **ON** (the default) — every installed module is listed **with** its version, *including modules exposing zero public settings*. The list is a full deployed manifest obtained without a token. This is the documented shape: the manifest "lists the store settings and the installed modules with their versions" `{DOC}`, and it matched live on vcst-qa 2026-09-23 `{OBSERVED}`.
- **OFF** — `version` returns `""` (empty string, not `null`; it preserves the `String!` contract) **and modules with no public settings drop out of the list entirely.** In this mode absence is evidence of nothing, and versions must come from the platform manifest. **This half is NOT documented** — VirtoOZ describes the manifest only in its ON shape and never names `XAPI.Security.ReturnModuleVersion`, so the OFF behaviour rests on our own `{OBSERVED}` record (VCST-4642) and was not re-measured on 2026-09-23. Treat it as a doc gap worth reporting upstream, not as settled behaviour.

Version disclosure being anonymous is **by design** when the toggle is ON; operators may turn it off in production. Either way, do not assert on a module COUNT — it tracks the deployed manifest, not a contract.

#### Using it

- **Before filing "feature X is missing"** — check whether the module is visible and whether its flag is ON. `Loyalty.Mode`, `Loyalty.Missions.Enable`, `Catalog.BrandStoreSetting.BrandsEnabled`, `ApplicationInsights.EnableTracking` and friends all read out of `--settings` in one anonymous call, no Admin SPA round-trip.
- **A capability the ledger says shipped but the manifest does not carry is `NOT_DEPLOYED`**, never `FAIL` — precedence in `.claude/templates/agent-dispatch.md` §Build Verification.
- **These are not `$cfg.*` flags.** Those are baked into the theme bundle and live in `.claude/knowledge/automation/storefront-config-flags.md`. A UI element can be gated by either; check both before calling it a bug.


---

## SPA Architecture — Test Implications

- `isSpa: true` → Vue.js SPA with HTML5 History API; server returns HTTP 200 for all requests (including missing pages)
- **Soft 404 problem:** The server returns 200 even for non-existent URLs. The Vue app shows a custom 404 page visually, but search engines see HTTP 200. Google workarounds: client-side redirect to a dedicated error URL returning real 404, or `<meta name="robots" content="noindex">` on the error page. Virto is working on server-side HTTP 404 responses based on route handling rules.
- Direct URL navigation and page refresh must work without breaking app state
- Deep links must render correct content (no blank page)
- Back/forward browser buttons must navigate correctly
- `seoLinkType` controls URL shape for products/categories — test that links match expected format

---

## Email Notifications

Configured at platform level via `appsettings.json` (not per-store). Gateways: `Smtp` or `SendGrid`.

**SMTP configuration:**
```json
{
  "Notifications": {
    "Gateway": "Smtp",
    "DefaultSender": "noreply@gmail.com",
    "Smtp": {
      "SmtpServer": "smtp.gmail.com",
      "Port": 587,
      "Login": "",
      "Password": "",
      "ForceSslTls": false,
      "CustomHeaders": {
        "X-Custom-Header": "value"
      }
    },
    "DiscoveryPath": "Templates",
    "FallbackDiscoveryPath": ""
  }
}
```

**SendGrid configuration:**
```json
{
  "Notifications": {
    "Gateway": "SendGrid",
    "DefaultSender": "noreply@gmail.com",
    "SendGrid": { "ApiKey": "your API key" }
  }
}
```

**Test sending:**
```bash
POST ${BACK_URL}/api/notifications/send
{ "type": "RemindUserNameEmailNotification", "from": "no-reply@mail.com", "to": "user@example.com" }
```

Check failures in Admin SPA: **Notifications → Notification activity feed**.

**QA notes:**
- `ForceSslTls` and `CustomHeaders` are SMTP-only options — verify they are not exposed for SendGrid
- `DiscoveryPath` / `FallbackDiscoveryPath` control notification template resolution — test custom template overrides
- Payment methods are registered per-module via `IPaymentMethodsRegistrar` and appear in every store's Payment methods widget after module installation

---

## BOPIS (Buy Online Pickup in Store)

BOPIS is a shipping method configured per-store in Admin SPA: **Store → Shipping methods → Buy Online Pickup in Store**.

**Admin configuration:**
- Enable/disable the BOPIS shipping method
- Set tax type, logo URL, description
- **Pickup locations** widget — add/edit pickup points with address details

**How it works:**
- Each pickup location is an address linked to a fulfillment center
- The storefront displays only **active** pickup addresses at checkout
- Customer selects a pickup location instead of entering a shipping address
- Fulfillment center linkage determines inventory availability for BOPIS orders

**QA test points:**
- Verify BOPIS option appears at checkout only when enabled for the store
- Test adding/editing/removing pickup locations in Admin and confirm storefront reflects changes
- Verify inactive pickup locations are hidden from the storefront
- Test BOPIS combined with different payment methods (see `order-creation-matrix.md`)
- Confirm order shows pickup address (not shipping address) in order details
- Test fulfillment center inventory check — BOPIS should only be available for in-stock items at the selected location

---

## Quotes (RFQ)

Controlled by the `quotesEnabled` store setting flag. When enabled, the quote/RFQ workflow is available to storefront users.

**Store setting:** `quotesEnabled: true` exposes quote functionality in the storefront.

**Quote workflow:**
1. Customer submits a quote request from the cart
2. Admin reviews and can adjust pricing, add comments
3. Admin approves or declines the quote
4. Customer confirms the approved quote → converts to a regular order
5. Organization maintainers can manage quotes created by their org members (B2B)

**Admin configuration:**
- Default quote status is configurable
- Organization-level quote management for B2B scenarios

**GraphQL mutations:** `declineQuoteRequest(quoteId)`, plus create/update/approve mutations.

**QA test points:**
- Verify quote buttons are visible only when `quotesEnabled: true`
- Test full lifecycle: request → admin review → approve/decline → convert to order
- Test B2B scenario: org maintainer manages member quotes
- Verify quote is hidden when `quotesEnabled: false` (no RFQ buttons, no quote pages)
- Test quote-to-order conversion preserves negotiated prices
- Verify declined quotes cannot be converted to orders

---

## Push Messages (Firebase Cloud Messaging)

Push notifications are configured at platform level via `appsettings.json` using Firebase Cloud Messaging (FCM). Admin UI: **Settings → Push Message module** (search "Push message" in settings blade).

**Configuration structure (`appsettings.json`):**
```json
{
  "PushMessages": {
    "UseFirebaseCloudMessaging": true,
    "FcmSenderOptions": {
      "Type": "service_account",
      "ProjectId": "vc-push-86046",
      "PrivateKeyId": "...",
      "PrivateKey": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n",
      "ClientEmail": "firebase-adminsdk-...@vc-push-86046.iam.gserviceaccount.com",
      "ClientId": "...",
      "AuthUri": "https://accounts.google.com/o/oauth2/auth",
      "TokenUri": "https://oauth2.googleapis.com/token"
    },
    "FcmReceiverOptions": {
      "ApiKey": "...",
      "AuthDomain": "vc-push-86046.firebaseapp.com",
      "ProjectId": "vc-push-86046",
      "StorageBucket": "vc-push-86046.appspot.com",
      "MessagingSenderId": "...",
      "AppId": "...",
      "VapidKey": "..."
    }
  }
}
```

**Two-part configuration:**
- **FcmSenderOptions** — Firebase service account credentials (server-side, sends notifications)
- **FcmReceiverOptions** — Firebase web SDK credentials + VAPID key (client-side, receives notifications). Generated by registering a web app in Firebase Console and creating a VAPID key pair in Cloud Messaging settings.

**Admin UI settings** (3 categories):
- **General** — core push message functionality
- **Background jobs** — async task management for push delivery
- **FCM receiver options** — Firebase integration parameters

**GraphQL query:** `fcmSettings` returns client-side FCM config (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `vapidKey`).

**QA test points:**
- Verify `fcmSettings` GraphQL query returns all receiver options when FCM is enabled
- Test push notification delivery end-to-end (requires browser notification permission)
- Verify `UseFirebaseCloudMessaging: false` disables all push functionality
- Test Admin Settings UI reflects correct FCM configuration
- Verify `PrivateKey` (sender) is never exposed in storefront/xAPI responses — only receiver options are public
- Test background job execution for push message delivery

---

## Related Modules / Interactions

- **White Labeling** — theme preset, logos, link lists layer on top of store settings (see `white-labeling.md`)
- **Content > Store > Link Lists** — source for footer/main menu navigation
- **Google Analytics** — configured via `settings.modules[VirtoCommerce.GoogleEcommerceAnalytics]` (public store settings)
- **Vue.js Storefront** — reads `isSpa`, `anonymousUsersAllowed`, `seoLinkType` at runtime via xAPI `store` query
- **vc-shell Admin SPA** — reads `graphQLSettings` for endpoint configuration
- **SEO** — `SeoInfo` filtration uses `GetBestMatchingSeoInfo(storeId, storeDefaultLanguage, languageCode)` with fallback to `GetFallbackSeoInfo(id, name, languageCode)`. Only active SEO infos (`IsActive`) are considered.
- **Payment methods** — registered via `IPaymentMethodsRegistrar` in module `PostInitialize`; settings linked via `ISettingsRegistrar.RegisterSettingsForType`. Each store can enable/disable, set priority, and configure independently.
- **BOPIS** — shipping method with pickup locations linked to fulfillment centers; configured per-store
- **Quotes** — RFQ workflow controlled by `quotesEnabled` flag; supports quote-to-order conversion and B2B org-level management
- **Push Messages** — Firebase Cloud Messaging integration; platform-level config in `appsettings.json`, client config exposed via `fcmSettings` GraphQL query
- **Settings Overrides** — `appsettings.json` supports `Force` (overrides DB/UI values) and `Default` (provides reset-to-default baseline) at Global and per-Tenant (Store) levels

---

## Regression Suites

- **Suites 036-038** — Frontend BOPIS: `regression/suites/Frontend/bopis/`
- **Suites 034-035** — Backend Store: `regression/suites/Backend/store/`
- **Suite 068** — Backend Push Messages: `regression/suites/Backend/push-messages/068-push-messages.csv`
- Quotes covered in suite 015 (`Frontend/orders/015-quotes.csv`) and suite 050 (GraphQL xAPI)
- Covered by suite 049 (Platform API) for REST `/api/stores` endpoints

## Sources

- [Store module overview](https://github.com/virtocommerce/vc-docs/blob/main/platform/user-guide/docs/store/overview.md)
- [StoreSettingsType](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/Store/objects/StoreSettingsType.md)
- [StoreResponseType](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/Store/objects/StoreResponseType.md)
- [store query](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/Store/queries/store.md)
- [Feature flags / Public Store Settings](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/Tutorials-and-How-tos/How-tos/feature-flags.md)
- [SPA architecture & 404 handling](https://github.com/virtocommerce/vc-docs/blob/main/storefront/developer-guide/docs/spa-architecture-for-seo-and-404-handling.md)
- [Email notifications setup](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/Getting-Started/Post-Installation-Steps/02-configuring-email-notifications.md)
- [appsettings.json reference](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/Configuration-Reference/appsettingsjson.md)
- [Payment method registration](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/Fundamentals/Payments/new-payment-method-registration.md)
- [SEO module integration](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/Fundamentals/SEO/add-seo-to-module.md)
- [BOPIS shipping method](https://github.com/virtocommerce/vc-docs/blob/main/platform/user-guide/docs/shipping/managing-shipping-methods.md)
- [Quote module overview](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/Quote/overview.md)
- [Firebase Cloud Messaging setup](https://github.com/virtocommerce/vc-docs/blob/main/platform/user-guide/docs/push-messages/firebase-cloud-messaging.md)
- [Push Message settings](https://github.com/virtocommerce/vc-docs/blob/main/platform/user-guide/docs/push-messages/settings.md)
- [FCM settings GraphQL query](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/Push-messages/Queries/FcmSettings.md)
- [Settings overrides (Force/Default)](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/Configuration-Reference/appsettingsjson.md)
