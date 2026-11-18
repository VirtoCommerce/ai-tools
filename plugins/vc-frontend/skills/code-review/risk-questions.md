# Risk questions

For every non-R0 file below R3, answer each question yes or no from that file's diff. A yes raises the
file to at least the floor; a `lens:` floor raises nothing and adds that lens to the proposal. Record
every raise in the risk summary: the question id and the diff line that answered it. Raise only, never
lower. Areas and questions run from most to least evidence in this codebase's review and fix history;
"Broke before" lists PRs where it happened.

## State and async

**ASYNC-1 (R2).** Does it start async work (search, refetch, load more, autosave, SDK init, a
`postMessage` handler) whose result writes shared state while its input (route param, id, period,
filter, open form) can change or a second click can land, with no request token, cancel or locked
controls?
Broke before: #2348 load-more rows appended after a filter refetch; #2624 year figures under Q2
labels; #2488 two autosaves in flight, last response wins.

**ASYNC-2 (R2).** Does it change a `watch` source or its `immediate`/`flush` option, or an
`initialize()`/`onMounted` sequence, that assumes async data is already there (cart, shipment, route,
`router.isReady`, a `useQuery` result that settles from cache during setup)?
Broke before: #1932 `lineItemId` watcher ran before the cart loaded; #2405/#2425 watcher without
`immediate` never fired on a cache hit; fix #1348 mobile menu broke after `shallowRef` → `ref`.

**ASYNC-3 (lens: correctness).** Does script code use a ref or computed without `.value` (truthiness,
an object field, `t()` params, an SDK payload), unwrap a ref or prop into a plain value at setup, write
to a computed or mutate a prop?
Broke before: #1995 Pay enabled before card validation; #2028 GA init tested the `hasModuleSettings`
ref; #822 quantity schema never updated.

**ASYNC-4 (R2).** Does it add or change state shared beyond one component instance
(`createGlobalState`, `createSharedComposable`, a ref declared outside the composable function, an
`initialized` flag), and must that state reset on sign-out, an organization or language switch, or
between pages?
Broke before: #2350 product page overwrote the category's sort list; #2399 pending invites survived
logout; #2427 a throw inside `createSharedComposable` pinned `undefined`.

**ASYNC-5 (R2).** Does a routed page, or a child keyed by a non-unique id, keep local state, a
`keepPreviousResult` result or setup done only in `onMounted`/`onBeforeMount`, while vue-router reuses
the instance across a param or route change?
Broke before: #2488 attachments leaked into another return draft and autosaved; #2441 previous page
document stayed on screen; #2501 second barcode scan reused page 3.

## Cart and quantity

**CART-1 (R3).** Does it change how a quantity is bounded, parsed or defaulted before it reaches a
cart, list or return mutation, or whether a product can be added at all: min/max/available/pack size,
what 0 or empty means (`allowZero`, `max=0`), `LINE_ITEM_QUANTITY_LIMIT`,
`QUANTITY_VALIDATION_ERROR_CODES`, `isAvailable`/`isBuyable`/in-stock, in `useQuantityValidationSchema`,
`VcQuantityStepper`, `quantity-control.vue` or `add-to-cart*.vue`?
Broke before: #2542 `max=0` became a ceiling, `+` disabled for unlimited products; #1745 stepper
rewrite needed 7 fixes (#1878 wrong amount added); #2484 untouched 0 reported invalid.

**CART-2 (R3).** Does it change how cart, wishlist or saved-for-later mutations are ordered, merged,
debounced, cancelled or applied optimistically (`queuedMutationsLink`/`createQueueTarget`,
`useMutationBatcher`, `optimisticResponse`, cart links), or what rapid repeated clicks send?
Broke before: #868 cart concurrency needed 9 later fixes; #1878 batched add-to-cart added wrong
amounts; #2442 batcher cancelled removals the server still ran.

**CART-3 (R3).** Does it change what happens to the cart, the ship-to address or user-scoped state
when the currency, language, organization or signed-in user changes (`useSignMeIn` merge,
`changeCartCurrency`, `clearCurrencyCart`, the `updateUser` payload, watchers that refetch on auth
change)?
Broke before: #1505 → #1523/#1578/#1708 cart items lost on currency change; #1756 ship-to reset after
a currency change; #1700 403 page on logout.

**CART-4 (R3).** Does it change which SKU or configuration goes into the cart: how a variation is
matched or auto-selected (`useProductVariationProperties`, `VcVariantPicker`, `options.vue`), or which
configurable sections, options and files are sent (`useConfigurableProduct`, `configuration/*`)?
Broke before: #2510 Add to cart enabled with a 0-byte file; #2096 → #2118 colour auto-selection; #1923
wrong configuration section shown.

**CART-5 (R3).** Does it act on "the cart" through `useShortCart`/`useCart` or a query without
`cartId` while the page may show `/cart/:cartId`, keep cart- or order-bound state (consent, intent,
flags) not keyed by cart or order id, or count lines that are not `selectedForCheckout`?
Broke before: #2564 requisition sent the default cart, not the one on screen; #2602 consent flag
applied to any order for 2 hours; #2602 unselected lines still required consent.

## Public contract for forks and plugins

**CONTRACT-1 (R2).** Does it change the output, default or fallback of a helper or component that
callers outside the diff use (`core/utilities/**`, `shared/common/**`, a `withDefaults` value, `||` vs
`??`, a shared token or style rule), including a change made for one page?
Broke before: #2588 quotes and wishlists lost the real price on narrow layouts; #2238 a facets sort
change altered pickup-location filters; #2626 `getLinkAttr` rendered `javascript:void(0)` hrefs.

**CONTRACT-2 (R2).** Does it remove, rename or change the meaning of something forks, plugins or e2e
rely on: a prop, emit, slot or model shape; a BEM class, `--vc-*` token or preset palette key; a
`data-test-id`; a locale key; an export of a `shared/*/index.ts` barrel; a registered component or
section name?
Broke before: #2543 exported product cards lost `linkClick`; #2482 VcSelect dropped
`--vc-dropdown-menu-*` tokens and classes; #1460 component removed without deprecation, Theme CI broke.

**CONTRACT-3 (R3).** Does it change anything `client-app/core-api/index.ts` re-exports, directly or
through its imports (props, emits, slots, return values, enums), or the `core-api` version?
Broke before: #2596 three PRs took 0.2.5, `core-v0.2.5` shipped without `CouponItem`; #2551 runtime
enums exported with `export type`, `undefined` at runtime; #2649 `closeAllModals` became plugin API
without a contract entry.

**CONTRACT-4 (lens: conventions).** Does code outside `ui-kit/` style, query or click a kit component
through `.vc-*` classes, kit DOM, private CSS variables (`--px`) or attributes the kit sets itself?
Broke before: #2215 a consumer's `:deep(.vc-popover__content)` broke on a rename; #2527 section
expanded through VcWidget private markup; #2514 `.vc-calendar` styled from module code.

**CONTRACT-5 (R2).** Does it change the designer preview protocol (`client-app/plugins/builder-preview`), the
section or block registry, section HTML sanitizing, or how `pages/matcher` renders page content?
Broke before: #2410 Add-block preview dropped by the new guard; #2626 fork-registered sections stopped
rendering; #2630 designer could no longer select the header section.

## Errors and empty states

**ERR-1 (R2).** Does it add or rewire a request whose failure could render as empty, zero, "not found"
or success, or leave a loading or busy flag set (a `catch` that only logs, `useFetch` from
`@/core/api/common` which resolves on failure, `Promise.all` without an error state, a reset outside
`finally`)?
Broke before: #2432 sales-rep failures showed the empty view; #2477 failed OTP resend reported
success; #2436 a failed fetch hid the search scope chip for good.

**ERR-2 (R2).** Does it show its own error, map server codes to text, or change which errors become
toasts or redirects: `SUPPRESS_ERROR_NOTIFICATIONS_CONTEXT`, `notifications.error({ single: true })`,
raw `message`/`errorDescription`, `te()` with an `UNHANDLED` fallback, abort detection (`AbortReason`,
Safari `AbortError`), `useFetch` 403 → `forbiddenEvent`?
Broke before: #2564 two error toasts, `single` cleared the rest; #1485 → #2058 Safari aborts toasted
as errors; #2485 a 403 on download navigated the user away.

**ERR-3 (lens: correctness).** Does it add `!`, `[0]` or a cast on data that can be null: an optional
schema field, an empty list, the organization after session expiry, a GA mapper input?
Broke before: #2647 `organization.value!.name!` threw after session expiry; #918 shipment price read
before a shipment existed; #1112 → #1140 GA crash broke add-all from wishlist.

## Data layer: GraphQL, Apollo, backend

**DATA-1 (R2).** Does it change a generated `api/graphql/types.ts` beyond what the PR's `.graphql`
files need, or type a result by hand (raw `.graphql` import, own interface, `as X`,
`Required<Pick<…>>`, `!`) instead of the generated `*Document`/`*Query` types?
Broke before: #2445 a fast-forward silently reverted dev's codegen; #2464 regenerated against an
environment missing modules, did not compile; #1652 "generate types" reverted.

**DATA-2 (R2).** Does it add or rename a GraphQL field, argument, input field or enum value, a REST
`/api/` path, or a value the backend compares as a string, that needs a backend newer than
`backend-packages.json` pins; or drop a variable the server requires (`storeId`, `cultureName`)?
Broke before: #2627 Dashboard query rejected by the released backend; #2235 rolled back by hotfix
#2268 on `support/2.47`; #2648 older MFA module rejected `organizationId`.

**DATA-3 (R2).** Does it change `typePolicies` (`keyFields`, `merge`), cache persistence or a
`fetchPolicy`, or add an operation selecting an id-less type that another operation also selects?
Broke before: #975 → #1010 `Property` keyed by name shared values across lines; #976/#988 shipments
and payments duplicated; #2458 search terms overwrote browsed products.

**DATA-4 (R2).** Does the UI read a field the operation does not select, take `[0]` of a list the
query neither sorts nor limits, or read fields after a mutation whose result does not return them?
Broke before: #1534 `extendedPrice` without currency showed N/A; #1153/#1592 fragment without min/max
disabled add to cart; #2181 region names silently missing.

**DATA-5 (R2).** Does it base a decision, count, label or existence check on a list that is paged,
capped (`first: N`, `MAX_*`, the 100-item select, the default page size of 16) or keyword-filtered, as
if it were complete?
Broke before: #2399 the 51st organization invisible; #2452 only 16 compared products fetched; #2424
corporate-limited user could create a local address.

**DATA-6 (R2).** Does it change a `useQuery`'s reactive variables or `enabled` flag, or how it
refetches after a mutation (`refetchQueries` without `awaitRefetchQueries`, `filterActiveQueryNames`
on `graphqlClient` instead of `apolloClient`)?
Broke before: #2424 no address list refreshed after address mutations; #2437 edit-mode toggle blanked
the KPI row; #2640 mutation resolved over the old list.

## Checkout and payment

**PAY-1 (R3).** Does it change when a payment form registers or clears its processor
(`registerPaymentProcessor`, `setCardDataValid`/`Invalid`), when `initializePayment`,
`initializeCartPayment` or `authorizePayment` run, what shows while the gateway SDK loads, which
`payment-processing-*` component renders for a method, or how 3-D Secure return params are read?
Broke before: #2309 an unmounted form's processor could still charge the card; #2308 stale card
validity kept Place order enabled; #2212 saved-card pay sent an empty `skyflow_id`.

**PAY-2 (R3).** Does a watcher or initializer pick a default delivery method, address or payment, or
call `updateShipment`, `updatePayment` or another cart mutation without a user action?
Broke before: #1637 → #1759 → #1762 → #1949 → #2013 chain ending in an extra shipment; #2074 method
change dropped the delivery address; #976 → #1796 duplicated shipping address.

**PAY-3 (R3).** Does it change what enables Place order or Pay, or a submit's busy flag? The gate must
stay closed while loading and after a failed load, hold in `createOrderFromCart`, be registered in
`init()` rather than an async chunk, and cover every instance (`cart.vue` renders `PlaceOrder` twice).
Broke before: #2602 order placed without subscription consent; #2564 the second button stayed
clickable; #1590 missing `isPaymentAvailable` check.

## Modules, settings and boot

**MOD-1 (R2).** Does it call or show something from an optional module (query, route, locale, menu,
UI) without `useModuleSettings(ID).isEnabled`/`hasModuleSettings`, remove such a gate, use `hasModule()`
(filled by a skippable query), read a flag that turns on when missing (`!== false`, `?? true`), or
change behaviour when its own new flag is off?
Broke before: #1881 reverted by #1931, white-labeling requested with the module off; #2440 Skyflow
could vanish from checkout via `hasModule()`; #2481 remote-code switch failed open.

**MOD-2 (R2).** Does it add, reorder or await work before `app.mount` (`app-runner.ts`, module
`init()`, plugin and router registration order, locale load vs `globals`), start a service as an import
side effect, or pull a library into the entry chunk (eager `import.meta.glob`, a static import from a
globally registered kit component)?
Broke before: #2382 icon glob cost +1.16 s FCP; #2194 router registered before the guard plugins;
#1642 locales set after globals gave a wrong culture.

**MOD-3 (R2).** Does code in `core/`, `shared/` or `pages/` import from `@/modules/*`, name a module's
operation, route or extension, or reach past a module's `index.ts` instead of an extension point?
Broke before: #2440 core `payment.vue` imported Skyflow, module could not be deleted; #2622 deleting
`modules/mfa` broke two core pages; #1127 `useAuth` imported web-push.

## Analytics

**GA-1 (R2).** Does it add, move or re-trigger an analytics event (call site, DOM observer, list
watcher, paging, page load) so that it can fire before the action succeeds, read its payload after an
awaited mutation changed it, fire more or fewer times, or throw on a null field; or so that
`item_list_id`, `index` or currency no longer match the list the user saw?
Broke before: #2088 `removeItemsFromCart` sent no items; #2594 infinite scroll resent every loaded
page; #2598 cart `index` pointed into another list.

**GA-2 (R2).** Does it add a new path to an action that is already tracked (another sign-in method,
add to cart from a new page, a new payment completion such as `finalizePayment`)?
Broke before: #2477 OTP sign-in sent no `login`; #2250 no `purchase` when `finalizePayment` completed;
#2405 shared list dropped add-to-cart tracking.

## Catalog search and filters

**CAT-1 (R2).** Does it change how product search state is built, kept or reset: the filter expression
(`getFilterExpression*`, in-stock, branches, purchased-before, catalog subtree), facets, sort, page or
infinite scroll, keyword, `preserveUserQuery`, or its sync with the URL query (repeated params arrive as
arrays) and storage, in `useProducts`, `category.vue`, the search bar or the product page?
Broke before: #1213/#1236 facets work led to 13 later fixes; #2072 → #2084 search dropdown lost the
in-stock filter; #2501 repeated `?barcode` crashed the search page.

## Routing, URLs and locale

**URL-1 (R2).** Does it change locale-prefix handling or culture choice (`useLanguages` `initLocale`/
`updateLocalizedUrl`, pinned or contact locale, `language-selector`), or carry culture-specific values
(facet terms, `returnUrl`, page context) across a language switch?
Broke before: #1976 multilingual URLs needed 4 follow-up fixes; #2306 unanchored regex stripped `/de`
from `/destinations`; #2371 stale facets after a language switch.

**URL-2 (R2).** Does it add or change a route guard (`beforeEnter`, `beforeEach`, `next()`),
`addRoute`, the router base, slug resolution or 404 handling (`pages/matcher`, `priorityManager`,
`useSlugInfo`)?
Broke before: #1883 reverted by #1896 (404 for a missing category); #1198 → #1200 → #1233 loader shown
instead of 404; #2445 `addRoute(record, undefined)` bypassed the guard.

**URL-3 (R2).** Does it build an internal URL by hand (concatenation, `router.resolve().fullPath`
instead of `.href`, `<a href>` to an app route) or write the URL outside vue-router
(`history.pushState`/`replaceState`, `location.href`, `window.open`)?
Broke before: #2012 orders and quotes URLs lost the language code; #2211 `pushState` duplicated
history entries; #1873 a header link caused a full page reload.

## Refactors and copies

**COPY-1 (R2).** Is it a refactor, move, split, rewrite or lint/Sonar cleanup meant to keep behaviour
(Tailwind → BEM, a wrapper removed, a component swapped for a kit one, a table moved to
`VcTableColumn`, logic extracted)? The lenses then check that every removed `v-if`, guard, filter,
handler, class and default has a counterpart.
Broke before: #2072 search rewrite dropped the in-stock filter; #2142 empty view and table rendered
together; #1252 Sonar cleanup changed behaviour and was reverted.

**COPY-2 (R2).** Does it copy or mirror an existing page, composable or rule (list details, sign-in,
quantity rules, filters, escaping) instead of reusing it, or fix logic that also lives in sibling
copies?
Broke before: #2452 compare re-implemented quantity rules that already disagreed; #2418 saved-for-later
copy dropped `await` and the pagination step-back; #2460 filter escaping copied three times, one wrong.

## Identity, permissions and sessions

**AUTH-1 (R3).** Does it gate an action, link, menu item, route or query on a permission, role,
membership or contact status, or organization? Every render path must agree (desktop and mobile menu
`canShowItem`, header and cells, nav link and `beforeEnter`), loading flags join with `&&`, there is no
privileged fallback branch or role match by display name, and the action is hidden while impersonating
(`useUser().operator`).
Broke before: #1557 → #1573 `can… || !loading` showed the logo editor to everyone; #2627 mobile menu
showed Reporting without the permission; #2622 impersonating operator landed on /403.

**AUTH-2 (R3).** Does it change how tokens are stored, refreshed or attached (`useAuth`, `onRequest`
interceptors and their order against `authPlugin`, WebSocket params), impersonation or login on behalf
(`useImpersonate`), grant, punchout or single-use tokens, or what sign-out clears (the stored
`user-id`, the cross-tab reload broadcast)?
Broke before: #2279 impersonation went ahead after a failed authorize; #2467 anonymous buyer id
overwrote the signed-in identity; #2506 punchout tokens kept after a failed grant.

## i18n

**I18N-1 (lens: ui).** Does it add or change a count message or plural forms (`pluralRules` in
`i18n.ts`), put a number outside its translated sentence, key logic on a locale code (`ru` vs
`ru-RU`), reference or remove a locale key, add keys to `en` only, or show text outside `$t` (including
`emit` payloads)?
Broke before: #2417 `pluralRules` keyed `ru` never fired for `ru-RU`; #2452 count outside the
sentence, wrong for 21; #1995 removed key still referenced.

**I18N-2 (R2).** Does it call `t()` once in setup (into a ref, a string or a `usePageHead` argument)
for keys a module locale loads lazily, translate a shared object in place, or pass backend or user text
to `t()` as a message or fallback?
Broke before: #2593 quote pages showed raw keys after a hard load; #2496 menu translated in place,
raw keys stuck; #2426 role fallback compiled as a message crashed the render.

## Untrusted input and security

**SEC-1 (R3).** Does it put input from the URL, a message, CMS or Page Builder content, the backend or
the user into a sink: navigation (`returnUrl`, `location`, `window.open`) without
`useReturnUrl().getReturnUrl()`/`toSameOriginPath`, HTML or links without the sanitizer, a filter-syntax
string without `escapeFilterSyntaxValue`, a `RegExp`, or a blob URL opened with the server's content
type?
Broke before: #1509 → #2460 open redirect fixed twice; #2439 server-typed blob could run script
same-origin; #2616 pasted text took over a second in a regex.

**SEC-2 (R3).** Does it accept data across a trust boundary (builder-preview `postMessage`, a
federated plugin descriptor or registration such as `addRoute` or type-policy priority, a flag that
enables remote code), and does its guard fail closed without rejecting valid input?
Broke before: #2445 a non-string permission switched the gate off; #2427 plugin priority could re-key
a host type; #2410 guard rejected valid preview payloads.

**SEC-3 (R3).** Does it add a literal key or token, turn off TLS checks (`rejectUnauthorized: false`,
`NODE_TLS_REJECT_UNAUTHORIZED`), put `github.head_ref` or event fields into a `run:` script, or send
user-entered text or personal data to analytics, logs or URLs?
Broke before: #1927 Gemini key committed in the translation script; #2071 `head_ref` injected into
PowerShell; #2458 organization name sent to Google.

## Money

**MONEY-1 (R3).** Does it choose which money field is shown (actual, list, sale, extended or placed
price, `minVariationPrice`, `selectedTierPrice`, `showPlacedPrice`, `*WithTax`) or which money subfields
a fragment selects?
Broke before: #627 VAT prices reverted whole by #633; #2176 option showed `extendedPrice` instead of
`salePrice`; #2588 narrow layout ignored `showPlacedPrice`.

**MONEY-2 (R3).** Does it format, sum or multiply money itself (`Intl.NumberFormat`, `formatMoney`,
`toFixed`, price × quantity), or label it with a currency read separately from the money object?
Broke before: #2602 subscription prices in USD on other stores; #2524 mission total ignored tier
prices and promotions; #2552 money formatted by hand in a facade export.

## Dates

**DATE-1 (R2).** Does it compute a date window or day boundary (presets, month or period, end of day,
"today"), parse a date-only string with `new Date()`, send a local date through `toISOString()`, add
elapsed milliseconds across DST, or freeze "today" at setup?
Broke before: #2540 "Last week" selected a future week; #2395 previous period overlapped the current
one; #2488 date-only string shown as the previous day.

## Browser storage

**STORE-1 (R2).** Does it read or write `localStorage`/`sessionStorage` (`useLocalStorage`,
`useSessionStorage`, `local-storage-keys.ts`)? Check: key scoped to user and store, key or stored shape
changed without a migration, per-tab vs shared storage matches the meaning, raw values parsed safely,
not shared with the designer iframe.
Broke before: #1674 ship-to addresses leaked between users; #2452 renamed key dropped every shopper's
compare list; #2630 designer theme toggle overwrote the saved theme.

## Forms and input

**FORM-1 (R2).** Does it validate one value and send another (untrimmed vs trimmed, raw
`update:model-value` vs the valid-only event, an unknown query value), or add or change a length, trim
or format rule on a value the backend also validates?
Broke before: #2235 `maxLength` rule rolled back by hotfix #2268; #2392 all-space message passed
`required()`; #1243/#1266 `v-model.trim` ate spaces while typing.

## Lens only: UI, tests, performance

**LENS-1 (lens: ui).** Does it move focus, unmount the focused element (a `v-if` swap on load, clear or
refetch), handle Escape, Tab or arrow keys, announce through `aria-live`, or teleport popover content
(`enable-teleport`, `#popover-host`) that is then styled or queried through ancestors?
Broke before: #2325 → #2608 popover focus scrolled the page; #2123 teleport broke VcSelect arrow keys;
#2452 loading branch destroyed the table and its focus.

**LENS-2 (lens: design).** Does it add a colour pair, variant, token or state (text on background,
hover, disabled) without its dark counterpart, mix with literal `white`/`black`, or change a rule every
dark preset shares?
Broke before: #2202 four button variants had no dark styles; #2524 brought back the contrast bug #2479
fixed; #2606 a shared dark rule lowered contrast in three presets.

**LENS-3 (lens: correctness).** Can the component render twice on one page while it uses hardcoded
ids, radio `name`s or `data-test-id`s, `document` listeners or `querySelector`, or per-instance busy or
"already reported" state?
Broke before: #2624 all report panels shared one radio group; #2007 hardcoded gallery ids; #2598
impression resent when the `v-if` branch flipped.

**LENS-4 (lens: tests).** Do new tests stub the unit they cover, use doubles or fixtures unlike the real
contract (a stub emits what the component never does, a fixture lacks selected fields, `useFetch`
mocked as rejecting), or pass with the fix reverted?
Broke before: #2362 stub emitted `change` on every click; #2493 source broken three ways, tests stayed
green; #2410 no protocol test with a `model` payload.

**LENS-5 (lens: performance).** Does it send a request per rendered row or period slot, or add a
request to a page every visitor opens?
Broke before: #2602 one offers request per cart line; #2488 extra round trip on every order page;
#2625 about 24 aggregates in one request.
