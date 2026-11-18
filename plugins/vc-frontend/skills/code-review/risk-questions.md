# Risk questions

`classify.mjs` matches each question's `Signals` (a regex over the file's path and changed lines;
`removed` = over removed lines only; `rewrite` = the file both loses and gains many lines; `new-code` =
a sizeable new file or addition) and lists the matched ids per file in `questions`. Answer those, yes or
no, from the file's diff, and any other question the diff plainly calls for. For a file below R3 a
yes raises it to at least the floor; a `lens:` floor raises nothing and adds that lens. For any file a
yes is also a focus for the lenses. Record every raise: the question id and the diff line that
answered it. Raise only, never lower. A signal is a cheap pre-filter, not the answer: most matches
end in "no". Areas and questions run from most to least evidence in this codebase's review and fix history;
"Broke before" says how it broke here before. The question is the rule; the examples show its shape
in this codebase. A change that fits the question without resembling any example is still a yes.

## State and async

**ASYNC-1 (R2).** Does it start async work (search, refetch, load more, autosave, SDK init, a
`postMessage` handler) whose result writes shared state while its input (route param, id, period,
filter, open form) can change or a second click can land, with no request token, cancel or locked
controls?
Broke before:
- In the BOPIS pickup-location picker, a Load more response landing after a filter refetch appended the old query's rows and cursor to the new list — a reset fetch must invalidate in-flight load-more (generation token).
- Switching the sales report from Year to Q2 paired the new period plan with the still-loaded Year response, so year figures showed under Q2 labels — pair each response with the plan it was fetched for.
- Two return-draft autosaves could run at once and the last to reach the server won, losing the newer edit while the status said 'Saved automatically' — queue `UpdateReturn` per draft (`queuedMutationsLink`) and flush before submit.
Signals: `\.then\(|useLazyQuery|refetch|fetchMore|loadMore|load-more|debounce|throttle|setTimeout|postMessage|[Aa]utosave|AbortController`

**ASYNC-2 (R2).** Does it change a `watch` source or its `immediate`/`flush` option, or an
`initialize()`/`onMounted` sequence, that assumes async data is already there (cart, shipment, route,
`router.isReady`, a `useQuery` result that settles from cache during setup)?
Broke before:
- The product page's watcher that strips an unknown `?lineItemId=` checked the cart before it loaded, which would drop a valid id from cart-item edit links — skip the check while the cart is still `loading`.
- Sales-rep watchers without `immediate` (the customer-picker over-cap check, pruning order-status tabs on a widget restored mid-edit) never ran when `useQuery` settled from cache during setup — add `{ immediate: true }` when the source may already hold data.
- The header-links extension point turned `useNavigations`' `menuSchema` from `shallowRef` into a deep `ref`, which broke the mobile menu — keep it a `shallowRef` and call `triggerRef` after the in-place `mergeWith`.
Signals: `watch\(|watchEffect|immediate:|flush:|onMounted|initialize\(|isReady`

**ASYNC-3 (lens: correctness).** Does script code use a ref or computed without `.value` (truthiness,
an object field, `t()` params, an SDK payload), unwrap a ref or prop into a plain value at setup, write
to a computed or mutate a prop?
Broke before:
- The Datatrans card form enabled Pay before any card validation because `isValidBankCard` tested the `validationResult` ref object, which is always truthy — read `.value` and also require the form's `meta.valid`.
- The Google Analytics `init` guard tested `!hasModuleSettings`, a ref and therefore always truthy, so the 'no module settings' exit never fired — read `hasModuleSettings.value` in conditions.
- `VcAddToCart` built its quantity validation schema from `minQty.value` / `maxQty.value` at setup, so the min/max rules kept the first values when the product's limits changed — pass the refs so the schema recomputes.
Signals: `computed\(|\b(shallow)?[Rr]ef\(|toRef|toValue|unref\(|defineModel|\bif \(!?(is|has|can|show)[A-Z]\w*\)`

**ASYNC-4 (R2).** Does it add or change state shared beyond one component instance
(`createGlobalState`, `createSharedComposable`, a ref declared outside the composable function, an
`initialized` flag), and must that state reset on sign-out, an organization or language switch, or
between pages?
Broke before:
- The product page wrote the module-level `productSortings` singleton on every faceted fetch, overwriting the category page's 'Sort by' list — keep per-page search state inside each `useProducts` instance.
- Pending organization invites, held in `createGlobalState` with an `initialized` flag that never reset, stayed visible after logout or signing in as another user — reset user-scoped global state on auth change.
- When a `createSharedComposable` body throws once, every later caller gets `undefined` for the rest of the session (here the mobile-menu customer-count badge) — catch inside the shared body and return a usable fallback state.
Signals: `createGlobalState|createSharedComposable|initialized|^(const|let) \w+ = (ref|shallowRef|reactive)\(`

**ASYNC-5 (R2).** Does a routed page, or a child keyed by a non-unique id, keep local state, a
`keepPreviousResult` result or setup done only in `onMounted`/`onBeforeMount`, while vue-router reuses
the instance across a param or route change?
Broke before:
- Opening another return draft reused line widgets keyed only by `orderLineItemId`, so the previous draft's attachments stayed in the uploader and autosaved onto the new return — key per-line children by draft and line.
- `vp-page-builder.vue` parsed its `content` prop only in `onBeforeMount` and the router reused the instance, so navigating between Page Builder pages kept rendering the previous page's blocks — watch `props.content` and re-parse it.
- After loading search results up to page 3, scanning a second barcode reused the component with `currentPage` still 3, so the new lookup requested page 3 — reset paging whenever the search query changes.
Signals: `keepPreviousResult|onMounted|onBeforeMount|route\.params|useRoute\(|:key=`

## Cart and quantity

**CART-1 (R3).** Does it change how a quantity is bounded, parsed or defaulted before it reaches a
cart, list or return mutation, or whether a product can be added at all: min/max/available/pack size,
what 0 or empty means (`allowZero`, `max=0`), `LINE_ITEM_QUANTITY_LIMIT`,
`QUANTITY_VALIDATION_ERROR_CODES`, `isAvailable`/`isBuyable`/in-stock, in `useQuantityValidationSchema`,
`VcQuantityStepper`, `quantity-control.vue` or `add-to-cart*.vue`?
Broke before:
- Making `VcQuantityStepper` `max=0` a real ceiling would disable `+` for unlimited products wherever a caller passed 0 for 'no limit' (`maxQuantity || availableQuantity`) — map 'no limit' to `undefined` in every caller, pinned by a test.
- After the `VcQuantityStepper` rollout, fast clicks on a product not yet in the cart added a different quantity than shown — the amount sent must be the amount displayed, with the stepper locked until the add returns.
- The quantity stepper published its stepping floor `min` as the input's `min`/`aria-valuemin`, so an untouched 0 (allowed by `allowZero`) was reported invalid and screen readers announced `min` — publish the range the control accepts.
Signals: `[Qq]uantity|QUANTITY|inStock|isAvailable|isBuyable|packSize|allowZero|[Ss]tepper|add-to-cart`

**CART-2 (R3).** Does it change how cart, wishlist or saved-for-later mutations are ordered, merged,
debounced, cancelled or applied optimistically (`queuedMutationsLink`/`createQueueTarget`,
`useMutationBatcher`, `optimisticResponse`, cart links), or what rapid repeated clicks send?
Broke before:
- Moving the cart onto the Apollo cache duplicated shipments and payments (array `merge: true`) and let line items share property values (`Property` keyed by `name`) — never merge arrays or key cache objects lacking a unique id.
- Add to cart went through `useMutationBatcher`, which merges calls and aborts in-flight requests the server still completes, so rapid stepper clicks added a wrong quantity — send `addItem` unbatched and block the stepper while it runs.
- Batching cart-line removals with `useMutationBatcher` aborted the in-flight `RemoveCartItems` on each click while the server kept running it, then re-sent `[A]`, `[A,B]`, `[A,B,C]` — queue removals: one request in flight, merge the rest.
Signals: `queuedMutations|createQueueTarget|useMutationBatcher|optimisticResponse|addToCart|addItemsToCart|removeItems|changeItemQuantity|updateItemQuantity`

**CART-3 (R3).** Does it change what happens to the cart, the ship-to address or user-scoped state
when the currency, language, organization or signed-in user changes (`useSignMeIn` merge,
`changeCartCurrency`, `clearCurrencyCart`, the `updateUser` payload, watchers that refetch on auth
change)?
Broke before:
- Changing currency or signing in with another one lost cart items (sign-in cleared or skipped merging the anonymous cart; the selector sent stale cart fields) — every currency-switch path must carry all lines to the new-currency cart.
- Saving the profile after a currency change reset the selected ship-to address, because `updateUser` rebuilt the contact payload without `selectedAddressId` — a partial update must pass through the fields it does not edit.
- On logout the ship-to selector's `watchEffect` refetched organization addresses as the now-anonymous user, got a 403 and showed the No Access page — fetch permission-scoped data once on mount and skip refetching it on auth change.
Signals: `useSignMeIn|clearCurrencyCart|updateUser|[Oo]rganization(Id)?\.value|contact\??\.organizations|switchOrganization|selectOrganization|[Cc]urrency(Code)?\.value|setCurrency|useLanguages|isAuthenticated|signOut|logout|ship-to|ShipTo|currency-selector|language-selector`

**CART-4 (R3).** Does it change which SKU or configuration goes into the cart: how a variation is
matched or auto-selected (`useProductVariationProperties`, `VcVariantPicker`, `options.vue`), or which
configurable sections, options and files are sent (`useConfigurableProduct`, `configuration/*`)?
Broke before:
- On configurable products a 0-byte file satisfied a required File section, enabling Add to cart while the server rejected the line without a message — validate the content (non-zero size), as the Text section already checks trimmed text.
- Multi-colour variations made auto-selection skip every colour property, so a colour left as the only option was no longer selected automatically — auto-selection must count a multi-colour value as one option and handle colours like other properties.
- `useConfigurableProduct` received `productId.value` once, so navigating between configurable products kept the first product's id and showed its configuration sections — pass the ref (`MaybeRef`) and `unref` it at request time.
Signals: `[Vv]ariation|[Cc]onfigurable|[Cc]onfiguration|VariantPicker|\bsku\b`

**CART-5 (R3).** Does it act on "the cart" through `useShortCart`/`useCart` or a query without
`cartId` while the page may show `/cart/:cartId`, keep cart- or order-bound state (consent, intent,
flags) not keyed by cart or order id, or count lines that are not `selectedForCheckout`?
Broke before:
- In punchout mode, 'Create requisition' sent only store, culture and currency, so the backend built the requisition from the default cart while the page showed `/cart/:cartId` — send the id of the cart on screen.
- Subscription consent stored for one cart held only `acceptedAt`, so for two hours any other order's payment forced card saving with that `consentId` — key stored consent by `cartId` and clear it when no subscription lines remain.
- The checkout subscription-terms block counted every subscribed cart line, so lines unselected for checkout, which are not in the order, still blocked Place order until consent was given — count only `selectedForCheckout` lines.
Signals: `useShortCart|useCart\(|useFullCart|cartId|selectedForCheckout|[Cc]onsent`

## Public contract for forks and plugins

**CONTRACT-1 (R2).** Does it change the output, default or fallback of a helper or component that
callers outside the diff use (`core/utilities/**`, `shared/common/**`, a `withDefaults` value, `||` vs
`??`, a shared token or style rule), including a change made for one page?
Broke before:
- Making `VcLineItem`'s narrow price slot honour `showPlacedPrice` (default `false`) showed list prices in quotes and wishlists on narrow layouts, as neither passed the flag — when a shared component starts reading a prop, check callers that omit it.
- Dropping the alphabetical sort in the shared `termFacetToCommonFacet` for catalog facets also unsorted the country, region and city filters of the pickup-location picker — keep the shared default and opt out at the catalog call site (`sortValues: false`).
- Making `getLinkAttr` return `{}` for unsafe URLs looked like a route to callers testing `"externalLink" in getLinkAttr(...)`, so `VcLink` and footer links rendered `href="/catalog/javascript:void(0)"` — check how every caller reads a shared helper's result before changing it.
Signals: `client-app/(core/utilities|shared/common)/` removed `withDefaults|default:`

**CONTRACT-2 (R2).** Does it remove, rename or change the meaning of something forks, plugins or e2e
rely on: a prop, emit, slot or model shape; a BEM class, `--vc-*` token or preset palette key; a
`data-test-id`; a locale key; an export of a `shared/*/index.ts` barrel; a registered component or
section name?
Broke before:
- `ProductCardRelated`, `ProductCardRecommended` and `ProductCardRecentlyBrowsed`, exported from `@/shared/catalog`, lost their `linkClick` emit without notice to forks listening to it — list removed emits of exported components under Breaking changes.
- Rebuilding `VcSelect`'s list stopped reading `--vc-dropdown-menu-*` tokens and rendering `vc-select__button`/`__input`/`__arrow` classes, so fork overrides silently stopped applying — fall back to the old tokens and list removed classes with an old→new map.
- `VcLayoutWithRightSidebar` was removed outright when `VcLayout` arrived, breaking Theme CI and every fork page that used it — deprecate first and keep the old component working for a release.
Signals: removed `defineProps|defineEmits|defineSlots|defineModel|<slot|--vc-|data-test-id|^\s*export |\bemit\(` `locales/`

**CONTRACT-3 (R3).** Does it change anything `client-app/core-api/index.ts` re-exports, directly or
through its imports (props, emits, slots, return values, enums), or the `core-api` version?
Broke before:
- Three open PRs each bumped the `@vc-frontend/core` facade to 0.2.5; another merged first, so `core-v0.2.5` shipped without `CouponItem`, which the plugin expected there — re-check the facade version against `dev` right before merging.
- The facade re-exported the runtime enums `PlatformPermissions` and `XApiPermissions` with `export type`, so plugins got `undefined` at runtime while the contract declared them — export runtime enums as values (`build-types` now fails on the mismatch).
- `useModal()` started returning `closeAllModals`, and because the facade re-exports `useModal`, plugins received a function the contract did not declare — keep host-only helpers out of facade return values or add them to the contract.
Signals: `core-api|@vc-frontend/core`

**CONTRACT-4 (lens: conventions).** Does code outside `ui-kit/` style, query or click a kit component
through `.vc-*` classes, kit DOM, private CSS variables (`--px`) or attributes the kit sets itself?
Broke before:
- Renaming `VcPopover`'s floating element from `vc-popover__content` to `vc-popover__body` and reusing `__content` for an inner wrapper made `products-filters.vue`'s `:deep(.vc-popover__content)` positioning hit the wrong node — a public class must stay on its element.
- The configuration checklist expanded a section by finding `.vc-widget__header-container`, reading `.vc-widget--collapsed` and clicking the header — drive `VcWidget` through its `collapsed` prop and `toggleCollapse` emit.
- A Sales Rep Hub tasks component stripped `VcCalendar`'s border and padding with `&.vc-calendar` from module code, overriding the kit's own styles — style kit components only through props, slots and `--vc-*` variables.
Signals: `\.vc-|:deep\(|--px`

**CONTRACT-5 (R2).** Does it change the designer preview protocol (`client-app/plugins/builder-preview`), the
section or block registry, section HTML sanitizing, or how `pages/matcher` renders page content?
Broke before:
- The new preview-protocol guard required a non-empty `model.id`, but the Designer's Add-block preview payload has none, so the live block preview was dropped — check guards against the real Designer payloads, including id-less previews.
- Page Builder sections began rendering only when their type is in `templateBlocks`/`ProductBlocks`, so sections a fork had registered with `app.component` vanished — announce such changes to forks and point them to `templateBlocks` registration.
- In the Page Builder preview the header section could not be selected on narrow viewports, because only the desktop `bottom-header.vue` carried the `getPreviewSectionAttrs` marker — every layout variant that renders a section must carry its preview marker.
Signals: `builder-preview|pages/matcher|static-content|[Ss]ection[A-Z]\w*|SECTION_|registerSection|sanitiz`

## Errors and empty states

**ERR-1 (R2).** Does it add or rewire a request whose failure could render as empty, zero, "not found"
or success, or leave a loading or busy flag set (a `catch` that only logs, `useFetch` from
`@/core/api/common` which resolves on failure, `Promise.all` without an error state, a reset outside
`finally`)?
Broke before:
- With its toast suppressed, a failed Sales Rep list request (`useSalesReps`) only logged and rendered the same empty view as 'no sales reps' — wherever a toast is suppressed, keep a failed state distinct from empty data.
- The OTP sign-in form announced 'New code sent' after a failed resend, since `requestCode` (`useFetch`) resolves `undefined` on HTTP errors and the handler checked only `Disabled` — treat any non-success response as a failure.
- A failed category fetch left `preparingScope` stuck `true` (reset after the `await`, outside `finally`), so the search-bar scope chip and its clear button stayed hidden — reset busy flags in `finally`.
Signals: `\bcatch\b|useFetch|Promise\.all|\bfinally\b|[Ll]oading(\.value)?\s*=[^=]|[Bb]usy|error-handler|onError\(`

**ERR-2 (R2).** Does it show its own error, map server codes to text, or change which errors become
toasts or redirects: `SUPPRESS_ERROR_NOTIFICATIONS_CONTEXT`, `notifications.error({ single: true })`,
raw `message`/`errorDescription`, `te()` with an `UNHANDLED` fallback, abort detection (`AbortReason`,
Safari `AbortError`), `useFetch` 403 → `forbiddenEvent`?
Broke before:
- A failed 'Create requisition' showed the global error toast plus its own, and its `single: true` notification cleared every other toast — pass `SUPPRESS_ERROR_NOTIFICATIONS_CONTEXT` when reporting the error locally, and use `group` + `singleInGroup`.
- Safari reports a cancelled request as `AbortError` without the app's abort reason, so `toServerError` toasted aborted mutations as server errors, and the first fix matched message text only — also check `networkError.name === "AbortError"`.
- Downloading a configuration attachment from Order details that answered 403 sent the user to the `/403` page, because `downloadFile` → `useFetch` raises `forbiddenEvent` — a failed download should show a notification and keep the user on the page.
Signals: `SUPPRESS_ERROR_NOTIFICATIONS_CONTEXT|notifications\.|single:|errorDescription|\bte\(|AbortReason|AbortError|forbidden`

**ERR-3 (lens: correctness).** Does it add `!`, `[0]` or a cast on data that can be null: an optional
schema field, an empty list, the organization after session expiry, a GA mapper input?
Broke before:
- `/company/info` threw on `organization.value!.name!` when the session expired and `organization` became `null` before the sign-in redirect — read it with `?.` and skip the field reset when the name is missing.
- The order summary read the first shipment's price before the cart had any shipment, which throws on an empty `shipments` list — guard with `shipments[0]?` and show zero shipping until a shipment exists.
- 'Add all to cart' on a wishlist crashed because `ga.addItemsToCart` received wishlist items where its mapper expected cart line items (`discountTotal` missing) — pass the shape the GA mapper takes and null-guard its inputs.
Signals: `\w!\.|\w!\)|\w!;|\w!,|\[0\]|\bas [A-Z]\w*(Type|Query|Fragment)\b`

## Data layer: GraphQL, Apollo, backend

**DATA-1 (R2).** Does it change a generated `api/graphql/types.ts` beyond what the PR's `.graphql`
files need, or type a result by hand (raw `.graphql` import, own interface, `as X`,
`Required<Pick<…>>`, `!`) instead of the generated `*Document`/`*Query` types?
Broke before:
- A branch's regenerated `types.ts` re-added `lastCartDate`, which `dev` had removed; with `dev` as its ancestor the merge would fast-forward with no conflict and green `vue-tsc` — regenerate `types.ts` after rebasing, against the environment `dev` used.
- Regenerating the sales-rep `types.ts` against a backend missing some modules deleted 17 types the file still referenced, so the build failed — regenerate against a full backend and keep only the hunks the new `.graphql` files need.
- A standalone "generate types" commit added `selectedAddressId` fields to core `types.ts` that no operation selected, and was reverted the same day — `types.ts` hunks ship together with the `.graphql` change that uses them.
Signals: `api/graphql/types\.ts|\.graphql|Required<Pick|\bas \w+(Type|Query)\b`

**DATA-2 (R2).** Does it add or rename a GraphQL field, argument, input field or enum value, a REST
`/api/` path, or a value the backend compares as a string, that needs a backend newer than
`backend-packages.json` pins; or drop a variable the server requires (`storeId`, `cultureName`)?
Broke before:
- Adding `organizationScope`/`memberId` arguments to the `orderStatistics` query shared with the account Dashboard made the pinned backend reject every Dashboard request — release the backend and bump `backend-packages.json` in the same PR.
- Sending the new optional `organizationId` in `requestMfaChangeCode` made an older MFA module reject the request, so the organization MFA widget could not get a code — pin the module version that knows the field in `backend-packages.json`.
Signals: `\.graphql|/api/|storeId|cultureName|backend-packages`

**DATA-3 (R2).** Does it change `typePolicies` (`keyFields`, `merge`), cache persistence or a
`fetchPolicy`, or add an operation selecting an id-less type that another operation also selects?
Broke before:
- `Property` cached with `keyFields: ["name"]` made every cart line show the same value for a same-named property — a type without a per-instance id must be `keyFields: false` so it stays inside its parent.
- The cart gained duplicate shipments and payments when `setCheckoutDefaults` re-ran while the cart loaded and sent id-less `addOrUpdateCartShipment`/`Payment` again — create defaults once and send later updates with the cached `id`.
- The customer profile's Searches and Product views queries both selected id-less `salesRepCustomerInsights` with the same arguments, so each response replaced the other's rows — give such a type a `merge` policy or read it `no-cache`.
Signals: `typePolicies|keyFields|merge:|fetchPolicy|persistCache|cache\.`

**DATA-4 (R2).** Does the UI read a field the operation does not select, take `[0]` of a list the
query neither sorts nor limits, or read fields after a mutation whose result does not return them?
Broke before:
- Cart line `extendedPrice` selected only `amount`, so the price formatter had no currency and showed N/A — select the full `...money` fragment wherever a price is rendered.
- The related-products query did not select `availabilityData.isBuyable` and later `isActive`, so `VcAddToCart` read `undefined` and disabled Add to cart — every field the add-to-cart gate reads must be in the query.
- The product pickup-locations query selected `regionId` but not `regionName`, so `getAddressName` silently left the region out of every address — select every field the formatting helper destructures.
Signals: `\.graphql|fragment|\[0\]|\.items\b`

**DATA-5 (R2).** Does it base a decision, count, label or existence check on a list that is paged,
capped (`first: N`, `MAX_*`, the 100-item select, the default page size of 16) or keyword-filtered, as
if it were complete?
Broke before:
- The pending organization invites widget fetched `first: 50` and discarded `hasNextPage`/`endCursor`, so a user's 51st invite never appeared — page through the connection or show that more exist.
- The compare page called `searchProducts` without `itemsPerPage`, so the default page size of 16 cut off every compared product past the 16th — request as many items as ids passed.
- After server-side paging, a corporate-limited user's empty address search made `organizationsAddresses.length` zero, switching to local addresses and offering "add new address" — choose the address source from permissions, independent of the current page or keyword.
Signals: `first:|MAX_|PAGE_SIZE|pageSize|totalCount|take:|\.length\s*[<>]=?\s*\w`

**DATA-6 (R2).** Does it change a `useQuery`'s reactive variables or `enabled` flag, or how it
refetches after a mutation (`refetchQueries` without `awaitRefetchQueries`, `filterActiveQueryNames`
on `graphqlClient` instead of `apolloClient`)?
Broke before:
- Address mutations ran on `graphqlClient`, where `filterActiveQueryNames` found no watched queries, so no address list refreshed after add, edit, delete or favorite — filter and refetch on `apolloClient`, where the lists live.
- Entering edit mode widened the stat queries' `@include` flags, Apollo restarted with `loading = true`, and every KPI card showed "—" for a round trip — mark a card pending only when its own data is missing.
- Deleting a passkey resolved before the `GetSignInMethods` refetch, so focus moved while the deleted row was still rendered — set `awaitRefetchQueries` or await `refetch()` before acting on the new list.
Signals: `useQuery|useLazyQuery|\benabled\s*[:=,]|refetchQueries|awaitRefetchQueries|refetch\(|filterActiveQueryNames`

## Checkout and payment

**PAY-1 (R3).** Does it change when a payment form registers or clears its processor
(`registerPaymentProcessor`, `setCardDataValid`/`Invalid`), when `initializePayment`,
`initializeCartPayment` or `authorizePayment` run, what shows while the gateway SDK loads, which
`payment-processing-*` component renders for a method, or how 3-D Secure return params are read?
Broke before:
- Authorize.Net registered its cart payment processor after `await loadAcceptJS()` with no mounted check, so a switched-away or unmounted form's processor could run on `finalizePayment` — register only while mounted, finalize only `allowCartPayment` methods.
- Switching from CyberSource to Skyflow left the shared `isValidCardData` true because Skyflow's validity watcher did not run on mount, so Place order stayed enabled — each payment form sets its own validity when it mounts.
- With "Add new card" selected but the Skyflow form still loading, the saved-card Pay now button showed and sent an empty `skyflow_id` — guard the saved-card branch with `!addNewCardSelected` so it never depends on form load state.
Signals: `[Pp]ayment|authorize|3ds|ThreeDs`

**PAY-2 (R3).** Does a watcher or initializer pick a default delivery method, address or payment, or
call `updateShipment`, `updatePayment` or another cart mutation without a user action?
Broke before:
- A run of checkout-default fixes (BOPIS, only-BOPIS, header ship-to) ended with an extra shipment: the delivery-mode watcher and the header ship-to selector both called `updateShipment` before checkout `initialize` finished — mutate shipments only after initialization.
- Changing the delivery method called `updateShipment` without the current `deliveryAddress`, so the shipping address was cleared — a shipment update must carry the fields it does not mean to change.
Signals: `updateShipment|updatePayment|shipmentMethod|paymentMethod|deliveryAddress|[Ss]hipment`

**PAY-3 (R3).** Does it change what enables Place order or Pay, or a submit's busy flag? The gate must
stay closed while loading and after a failed load, hold in `createOrderFromCart`, be registered in
`init()` rather than an async chunk, and cover every instance (`cart.vue` renders `PlaceOrder` twice).
Broke before:
- The subscription consent guard registered only after the subscription items loaded, so Place order was enabled while they loaded and for good if the request failed — the gate stays closed while loading and after a failed load.
- `cart.vue` renders Place order twice and each punchout "Create requisition" button kept its own `submitting`, so the other stayed clickable during a request — share one busy flag across every instance.
- The order payment page rendered the stored method's payment form and Pay button even when that method was no longer in `availablePaymentMethods` — render the form only for an available method, else show an error.
Signals: `[Pp]laceOrder|createOrderFromCart|isPaymentAvailable|\b[Pp]ay\b`

## Modules, settings and boot

**MOD-1 (R2).** Does it call or show something from an optional module (query, route, locale, menu,
UI) without `useModuleSettings(ID).isEnabled`/`hasModuleSettings`, remove such a gate, use `hasModule()`
(filled by a skippable query), read a flag that turns on when missing (`!== false`, `?? true`), or
change behaviour when its own new flag is off?
Broke before:
- Moving the white-labeling request into the boot `Promise.all` sent it before store settings were known, so it ran with the module disabled, and was reverted — request a module's data only after `useModuleSettings(...).isEnabled` confirms it.
- Gating Skyflow on `hasModule()`, filled by a version-check query allowed to fail, meant one timeout removed Skyflow from checkout and order payment with no error — gate on `useModuleSettings` from `getPageContext`.
- The Module Federation switch checked `!== false`, so a missing key or `"false"` string turned remote code loading on — an opt-in switch enables only on a literal `true`.
Signals: `useModuleSettings|hasModuleSettings|hasModule\(|isEnabled|MODULE_ID|!== false|\?\? true`

**MOD-2 (R2).** Does it add, reorder or await work before `app.mount` (`app-runner.ts`, module
`init()`, plugin and router registration order, locale load vs `globals`), start a service as an import
side effect, or pull a library into the entry chunk (eager `import.meta.glob`, a static import from a
globally registered kit component)?
Broke before:
- The outline-icons `import.meta.glob` over thousands of SVGs put a registry of every import wrapper into the main `index.js`, adding about a second to FCP — serve icons as hashed static assets fetched on demand.
- `app.use(router)` ran before the plugins that add `router.beforeEach`, so the first navigation skipped route protection — register the router after every plugin that installs guards.
- `setGlobals` ran before `initLocale` resolved, so `globals.cultureName` held the wrong culture for requests — await `initLocale` before setting globals, and start `globals` readers such as `fetchMenus` after.
Signals: `app-runner|main\.ts|\binit\(|import\.meta\.glob|app\.use|router\.(addRoute|beforeEach)`

**MOD-3 (R2).** Does code in `core/`, `shared/` or `pages/` import from `@/modules/*`, name a module's
operation, route or extension, or reach past a module's `index.ts` instead of an extension point?
Broke before:
- Core `shared/payment/components/payment.vue` and two payment pages imported Skyflow's component directly, so deleting the Skyflow module broke core — core renders an `ExtensionPointList` category the module registers into from `init()`.
- `security.vue` and `company/info.vue` imported `MfaSettingsWidget` and `MFA_PERMISSIONS` from `@/modules/mfa`, so deleting the module broke both pages — host pages expose an extension point and `mfa/init()` fills it.
- Core `useAuth` called the optional web-push service to delete the FCM token on sign-out — core emits a broadcast event (`userBeforeUnauthorizeEvent`) and the optional service subscribes to it.
Signals: `@/modules/`

## Analytics

**GA-1 (R2).** Does it add, move or re-trigger an analytics event (call site, DOM observer, list
watcher, paging, page load) so that it can fire before the action succeeds, read its payload after an
awaited mutation changed it, fire more or fewer times, or throw on a null field; or so that
`item_list_id`, `index` or currency no longer match the list the user saw?
Broke before:
- `removeItemsFromCart` read the removed lines from the cart after `removeItems` had already dropped them, so the event had no items — capture the event payload before awaiting the mutation.
- On infinite scroll, each `view_item_list` reported every product loaded so far, resending page 1 with every later page — report only the page `fetchMoreProducts()` just returned.
- The Saved for later widget sent `select_item` under the `recently_browsed_products` list id with its own position, so `index` pointed at another product in that list — give each list its own id and `view_item_list`.
Signals: `useAnalytics|[Aa]nalytics|gtag|view_item|select_item|purchase|add_to_cart`

**GA-2 (R2).** Does it add a new path to an action that is already tracked (another sign-in method,
add to cart from a new page, a new payment completion such as `finalizePayment`)?
Broke before:
- The new OTP email sign-in never sent `login`, so those sign-ins vanished from analytics — every sign-in path reports success and failure the way `sign-in-form.vue` and `pages/auth/callback.vue` do.
- Orders paid through `finalizePayment` in `createOrderFromCart` sent no `purchase` — fire it after `finalizePayment` succeeds, and skip it in the gateway component on that path to avoid a duplicate.
- The shared-list page's add to cart, copied from `list-details.vue`, dropped `trackAddItemToCart` and `pushHistoricalEvent` while still sending `viewItemList` and `selectItem` — a new add-to-cart path fires the same tracking as existing ones.
Signals: `signIn|[Ll]ogin|addToCart|addItemsToCart|finalizePayment|placeOrder|purchase`

## Catalog search and filters

**CAT-1 (R2).** Does it change how product search state is built, kept or reset: the filter expression
(`getFilterExpression*`, in-stock, branches, purchased-before, catalog subtree), facets, sort, page or
infinite scroll, keyword, `preserveUserQuery`, or its sync with the URL query (repeated params arrive as
arrays) and storage, in `useProducts`, `category.vue`, the search bar or the product page?
Broke before:
- After variation filters and catalog facets moved filter state into `useProducts`, applying a filter, sort or in-stock kept the old page, facet order stopped updating, and branches applied the wrong selection — every filter change resets the page.
- The header search dropdown built its product filter without the shopper's in-stock preference (`getFilterExpressionForInStockVariations`), so it listed products the results page hid — every product search builds its filter from the same helpers.
- `?barcode=a&barcode=b` reached `escapeFilterSyntaxValue` as an array from vue-router and threw `replaceAll is not a function`, crashing the search page — normalize each query param to one string where it is read.
Signals: `useProducts|[Ff]acet|[Ff]ilterExpression|preserveUserQuery|searchPhrase|keyword|category\.vue|search-bar`

## Routing, URLs and locale

**URL-1 (R2).** Does it change locale-prefix handling or culture choice (`useLanguages` `initLocale`/
`updateLocalizedUrl`, pinned or contact locale, `language-selector`), or carry culture-specific values
(facet terms, `returnUrl`, page context) across a language switch?
Broke before:
- After multilingual SEO URLs, hand-built links lost the language prefix, the prefix regex ate path characters, facets kept the old language, and the language switch mishandled the other culture's slug — a locale change must rebuild every URL part.
- An unanchored locale-prefix regex in `useLanguages` stripped `/de` from `/destinations` — match the prefix only as a whole first path segment (`^/de(?=/|$)`).
- After a language switch the `facets` param still held terms in the old language, so the catalog filtered on values that no longer matched — drop `facets` from the URL and from `returnUrl` on every locale-change path.
Signals: `useLanguages|initLocale|updateLocalizedUrl|[Cc]ulture(Name)?|returnUrl|language-selector|[Pp]innedLocale|locale\.value\s*[=!]==`

**URL-2 (R2).** Does it add or change a route guard (`beforeEnter`, `beforeEach`, `next()`),
`addRoute`, the router base, slug resolution or 404 handling (`pages/matcher`, `priorityManager`,
`useSlugInfo`)?
Broke before:
- Showing `Error404` whenever `fetchCategory` returned no `category` also hit the root catalog, where `category` is null by design, and was reverted — a not-found check must exclude the `isRoot` case.
- For an unknown URL the slug matcher kept the loader on screen because the internal page previewer never reported `empty` — every previewer reports its state on mount and on each route change (`onBeforeRouteUpdate`).
- The federated-plugin `addRoute` guard chose the overload by argument count while vue-router checks the first argument's type, so `addRoute(record, undefined)` skipped the guard and replaced a host route — detect overloads the way vue-router does.
Signals: `beforeEnter|beforeEach|next\(|addRoute|slug|[Ss]lug|404|NotFound|matcher|priorityManager`

**URL-3 (R2).** Does it build an internal URL by hand (concatenation, `router.resolve().fullPath`
instead of `.href`, `<a href>` to an app route) or write the URL outside vue-router
(`history.pushState`/`replaceState`, `location.href`, `window.open`)?
Broke before:
- Orders and quotes opened via `window.open`/`location.href` with `router.resolve().fullPath`, which has no locale base, so the URL lost the language code — use `.href` for any URL leaving vue-router.
- `updateLocalizedUrl` rewrote the localized permalink with `history.pushState`, adding a duplicate history entry on each category visit so Back did nothing — rewrite the current URL with `replaceState`.
- A header `router-link` with `custom` bound `@click="link.route ? navigate : undefined"`, which never calls `navigate`, so the `<a href>` did a full page reload — the slot's click handler must call `navigate(e)`.
Signals: `:href=|\bhref:|fullPath|pushState|replaceState|location\.(href|assign|replace)|window\.open|router\.resolve|\{[^}]*\bhref\b[^}]*navigate`

## Refactors and copies

**COPY-1 (R2).** Is it a refactor, move, split, rewrite or lint/Sonar cleanup meant to keep behaviour
(Tailwind → BEM, a wrapper removed, a component swapped for a kit one, a table moved to
`VcTableColumn`, logic extracted)? The lenses then check that every removed `v-if`, guard, filter,
handler, class and default has a counterpart.
Broke before:
- Moving `orders.vue` to `VcTable`'s `bordered` prop removed the wrapper `div` along with its `v-else`, so `VcEmptyView` and an empty table rendered together — a removed wrapper's `v-if`/`v-else` moves to its replacement.
- A Sonar cleanup turned fire-and-forget `void` calls into `await`, including inside `watchEffect` where it changes what is tracked, and had to be reverted — a lint fix must keep timing and reactive reads identical.
Signals: rewrite

**COPY-2 (R2).** Does it copy or mirror an existing page, composable or rule (list details, sign-in,
quantity rules, filters, escaping) instead of reusing it, or fix logic that also lives in sibling
copies?
Broke before:
- The compare page's add-to-cart re-implemented pack-size, min/max and availability rules by hand, already disagreeing with `useQuantityValidationSchema` (`availableQuantity === 0`, no `LINE_ITEM_QUANTITY_LIMIT`) — quantity validity must come from `useQuantityValidationSchema` / `QuantityControl`.
- The saved-for-later page, forked from `list-details.vue`, dropped the `await` in its `watchEffect` (list changes wiped unsaved edits, reset to page 1) and the step back when a delete empties a page — a fork keeps every original guard.
- Organization search escaped `"` but not `\`, so a trailing backslash broke out of the quoted filter, and `facets.ts` quoted other filters by hand — every filter value goes through one shared `escapeFilterSyntaxValue()`.
Signals: new-code

## Identity, permissions and sessions

**AUTH-1 (R3).** Does it gate an action, link, menu item, route or query on a permission, role,
membership or contact status, or organization? Every render path must agree (desktop and mobile menu
`canShowItem`, header and cells, nav link and `beforeEnter`), loading flags join with `&&`, there is no
privileged fallback branch or role match by display name, and the action is hidden while impersonating
(`useUser().operator`).
Broke before:
- The company info page showed the logo editor on `canEditOrganization || !loadingOrganization || !loadingUser`, so every member saw it once loading ended — permission and loading flags join with `&&` (`canEditOrganization && !(loadingOrganization || loadingUser)`).
- On a Company page the mobile menu opened the unfiltered corporate section, whose `canShowItem` ignored the link's new `permission`, so users without `xapi:my_organization:order:view` saw Reporting — every menu render path must apply the same permission filter.
- An impersonating operator saw the MFA Turn on/off switch, and clicking it opened /403 because the backend refuses MFA changes from operator tokens — hide change actions while `useUser().operator` is set.
Signals: `[Pp]ermission|canShow|\$can\b|\bcan[A-Z]\w*\b|\broles?\b|roleId|isOrganization|\b[Oo]perator\b|beforeEnter`

**AUTH-2 (R3).** Does it change how tokens are stored, refreshed or attached (`useAuth`, `onRequest`
interceptors and their order against `authPlugin`, WebSocket params), impersonation or login on behalf
(`useImpersonate`), grant, punchout or single-use tokens, or what sign-out clears (the stored
`user-id`, the cross-tab reload broadcast)?
Broke before:
- Login on behalf went on to impersonate when `authorize` failed with a network error or 500, because only a 400 filled `authErrors` — any failed credential check must stop the flow before `doImpersonate`.
- The UCP handoff restore stored the `anonymous_buyer_id` from a probe sent without a bearer, overwriting a signed-in buyer's identity — never write an anonymous identity while the browser holds a Platform token.
- A failed `punchout` grant mid-session (Back to a used single-use token) ran `endSession()` but kept the punchout tokens, leaving the user signed in with no mode label or expiry sign-out — clear or keep tokens and session together.
Signals: `[Aa]ccess_?[Tt]oken|[Rr]efresh_?[Tt]oken|[Aa]uth[Tt]oken|\.token\b|\btoken\s*[:=,)]|useAuth|[Ii]mpersonat|signOut|logout|grant_type|interceptor|onRequest|Authorization`

## i18n

**I18N-1 (lens: ui).** Does it add or change a count message or plural forms (`pluralRules` in
`i18n.ts`), put a number outside its translated sentence, key logic on a locale code (`ru` vs
`ru-RU`), reference or remove a locale key, add keys to `en` only, or show text outside `$t` (including
`emit` payloads)?
Broke before:
- Russian rules registered as `pluralRules.ru` never ran, because vue-i18n matches keys exactly against the store culture `ru-RU`, and the test used `ru` — register language and culture names; test with the app's culture.
- The compare page put the count in a span outside the translated sentence, garbling ja/zh, and the ru `one` form hardcoded "1" ("1 товар" for 21) — put the count placeholder in every plural form; render with `<i18n-t>`.
- Moving `pay_now_button` from the provider sections into `bank_card_form` left `fr.json` without it, so French buyers would see the raw key on the pay button — check a moved or removed key in every locale file.
Signals: `plural|i18n\.ts|locales/|<i18n-t|\bte\(|locale(\.value)?\s*[=!]==|\{\s*count\b|\bcount:`

**I18N-2 (R2).** Does it call `t()` once in setup (into a ref, a string or a `usePageHead` argument)
for keys a module locale loads lazily, translate a shared object in place, or pass backend or user text
to `t()` as a message or fallback?
Broke before:
- After a hard load, quote list headers and quote tab titles showed raw keys: `t()` ran once in setup, into a plain `ref` and a `usePageHead` string, before the lazy quotes locale arrived — use `computed(() => t(...))`.
- The account sidebar kept raw keys (`Quotes.navigation.route_name`) because `getTranslatedMenuLink` translated the menu in place, so Vue skipped the re-render when module locales arrived — translate into new objects and keep the source keys.
- A custom role name passed as the `t("common.roles." + id, role.name)` fallback was compiled as a message, so `a@b` threw inside a computed and broke the members page — check `te(key)` and print backend text raw.
Signals: `^\s*(const|let) \w+ = (ref\()?t\(|^\s*\w+:\s*t\(|usePageHead|loadModuleLocale|\bt\((?![\"'])`

## Untrusted input and security

**SEC-1 (R3).** Does it put input from the URL, a message, CMS or Page Builder content, the backend or
the user into a sink: navigation (`returnUrl`, `location`, `window.open`) without
`useReturnUrl().getReturnUrl()`/`toSameOriginPath`, HTML or links without the sanitizer, a filter-syntax
string without `escapeFilterSyntaxValue`, a `RegExp`, or a blob URL opened with the server's content
type?
Broke before:
- The first return-URL fix compared only the hostname and then assigned the raw `returnUrl` to `location.href`, so scanners kept flagging the open redirect and it had to be redone — redirect only to the path returned by `toSameOriginPath()`.
- Sales Rep Hub documents opened as blobs typed with the server-sent content type, so an uploaded `.html` or `.svg` could run script on the storefront origin — render inline only pdf, images and plain text; download the rest.
- The bulk-order Copy & paste parser used backtracking regexes, so an 83-character pasted line took over a second to reject, growing with each extra chunk — parse pasted text with split and trim instead of nested-quantifier regexes.
Signals: `returnUrl|location\.|window\.open|v-html|innerHTML|sanitiz|escapeFilterSyntaxValue|RegExp|createObjectURL|Blob`

**SEC-2 (R3).** Does it accept data across a trust boundary (builder-preview `postMessage`, a
federated plugin descriptor or registration such as `addRoute` or type-policy priority, a flag that
enables remote code), and does its guard fail closed without rejecting valid input?
Broke before:
- A federated plugin descriptor with a non-string `permission` was read by `asString()` as "no permission required", so the plugin loaded for anonymous visitors — a declared but malformed field must skip the plugin.
- `registerCacheTypePolicies` put no ceiling on a plugin's `priority`, so a plugin above `HOST_PRIORITY` could take over a host Apollo type policy, against its own docblock — clamp plugin-supplied priority below the host's.
- The stricter preview `postMessage` guard required `model.id` and an `auth` `userId`, so the Designer's Add-block previews and auth messages without `userId` were silently dropped — validate against the payloads the Designer actually sends.
Signals: `postMessage|addEventListener\(.message|addRoute|federation|[Rr]emote`

**SEC-3 (R3).** Does it add a literal key or token, turn off TLS checks (`rejectUnauthorized: false`,
`NODE_TLS_REJECT_UNAUTHORIZED`), put `github.head_ref` or event fields into a `run:` script, or send
user-entered text or personal data to analytics, logs or URLs?
Broke before:
- A Google (Gemini) API key was committed in plain text in the translator script on a feature branch and flagged by Sonar — scripts must read keys from the environment (`APP_GEMINI_API_KEY`), and a pushed key must be revoked.
- A CI workflow put `${{ github.head_ref }}` straight into a PowerShell `run:` script, so a crafted branch name could inject commands (a quote already broke the step) — pass untrusted context through `env:` and read `$env:HEAD_REF`.
- GA4 user properties sent `organization_name`, free text typed at sign-up, so a sole trader's personal name reached Google Analytics — send only ids and enums (`organization_id`, `session_kind`) to third-party analytics.
Signals: `apiKey|API_KEY|[Ss]ecret|SECRET|rejectUnauthorized|NODE_TLS|github\.(head_ref|event)|\.github/|(gtag|[Aa]nalytics|console\.\w+|logger)\(.*(email|phone)|(email|phone).*(gtag|[Aa]nalytics|query:)`

## Money

**MONEY-1 (R3).** Does it choose which money field is shown (actual, list, sale, extended or placed
price, `minVariationPrice`, `selectedTierPrice`, `showPlacedPrice`, `*WithTax`) or which money subfields
a fragment selects?
Broke before:
- A configurable product's option card passed `extendedPrice` (price × option quantity) as its actual price, so it disagreed with the unit price shown elsewhere — a per-unit price slot must get `salePrice`.
- The narrow `VcLineItem` "Price per item" slot rendered `actualPrice || listPrice` and ignored `showPlacedPrice`, so narrow cart lines showed the discounted price and wide ones the list price — every layout slot must apply the same `showPlacedPrice` rule.
Signals: `[Pp]rice|WithTax|[Tt]otal|[Dd]iscount|\b[Tt]ax\b`

**MONEY-2 (R3).** Does it format, sum or multiply money itself (`Intl.NumberFormat`, `formatMoney`,
`toFixed`, price × quantity), or label it with a currency read separately from the money object?
Broke before:
- The Subscribe & Save one-time price went through `formatMoney` with a currency the product query never selected, so it showed US dollars on every store — render money with `VcPriceDisplay` and the backend `formattedAmount`.
- The SKU mission modal computed line totals and the cart subtotal as `price.actual.amount × quantity`, so a "10+ at $8" tier showed $100 where the cart charged $80 — show only backend-priced amounts (`formattedAmount`, cart `extendedPrice`).
- A dashboard stats helper exported through `@vc-frontend/core` built its own `Intl.NumberFormat`, so it ignored locale switches and invited plugins to copy it — use the app's registered `currency` format (`i18n.global.n(value, "currency")`).
Signals: `Intl\.NumberFormat|formatMoney|toFixed|[Cc]urrency|[Aa]mount`

## Dates

**DATE-1 (R2).** Does it compute a date window or day boundary (presets, month or period, end of day,
"today"), parse a date-only string with `new Date()`, send a local date through `toISOString()`, add
elapsed milliseconds across DST, or freeze "today" at setup?
Broke before:
- The Orders "Last week" preset kept today's month and took only the day number from the week start, so on Oct 2 it selected Oct 20–27 — build both bounds from full local dates.
- The Sales Rep Hub previous-period window was `prevStart + elapsed` unclamped, so on Mar 31 "last month" ran to Mar 3 and Mar 1–3 orders counted twice — clamp the previous window's end to the current period's start.
- Returns filter chips passed `YYYY-MM-DD` strings to `new Date()`, which reads them as UTC midnight, so west of UTC they showed the previous day — parse date-only values as local dates (`toStartDateFilterValue`).
Signals: `new Date\(|Date\.(now|parse)|toISOString|dayjs|timezone|getTime|DateTimeFormat|toLocaleDate|startOf|endOf|[Dd]ate(From|To|Range)|[Pp]eriod`

## Browser storage

**STORE-1 (R2).** Does it read or write `localStorage`/`sessionStorage` (`useLocalStorage`,
`useSessionStorage`, `local-storage-keys.ts`)? Check: key scoped to user and store, key or stored shape
changed without a migration, per-tab vs shared storage matches the meaning, raw values parsed safely,
not shared with the designer iframe.
Broke before:
- Ship-to addresses saved under fixed `localStorage` keys (`localShipToAddresses`) showed up for the next user signing in on the same browser — key per-user storage by user id, with a separate anonymous key.
- The compare redesign moved the list to a new `localStorage` key and deleted the old keys with no migration, so every shopper's compare list came up empty after deploy — migrate old keys once, then remove them.
- The Page Builder preview's light/dark toggle wrote `colorMode` (`localStorage` `vc-color-mode`) from the same-origin iframe, overwriting the merchant's saved storefront theme — preview-only state must use an in-memory override and leave persisted keys untouched.
Signals: `localStorage|sessionStorage|useLocalStorage|useSessionStorage|local-storage-keys`

## Forms and input

**FORM-1 (R2).** Does it validate one value and send another (untrimmed vs trimmed, raw
`update:model-value` vs the valid-only event, an unknown query value), or add or change a length, trim
or format rule on a value the backend also validates?
Broke before:
- The configurable-product text `maxLength` rule also checked `customText` when a preset option was picked, so a 7-character preset label failed a 5-character limit and disabled Add to cart — apply length rules to typed input only.
- The sales-rep message modal's `string().required()` accepted an all-space message, then submit trimmed it and sent an empty broadcast to every org member — validate the value that is sent (`string().trim().required()`).
- `v-model.trim` on search, name, comment and list inputs stripped the trailing space while the user typed, so multi-word values could not be entered — bind plain `v-model` and trim where the value is used or sent.
Signals: `trim|maxLength|maxlength|minLength|[Vv]alidation|yup|[Ss]chema|required\(`

## Lens only: UI, tests, performance

**LENS-1 (lens: ui).** Does it move focus, unmount the focused element (a `v-if` swap on load, clear or
refetch), handle Escape, Tab or arrow keys, announce through `aria-live`, or teleport popover content
(`enable-teleport`, `#popover-host`) that is then styled or queried through ancestors?
Broke before:
- Focusing a just-opened popover scrolled the page: first the date picker's calendar cell, later `VcPopover`'s dialog panel, which shifted the 375px Filters drawer sideways — focus a not-yet-positioned panel with `focus({ preventScroll: true })`.
- Teleporting the `VcSelect` dropdown to `#popover-host` broke arrow-key navigation, because `getItemsElements()` looked up options under the select's own root id — after a teleport, find items through the teleported panel and recheck descendant CSS.
- The compare page swapped `CompareTable` for a loader on every refetch, so removing a product destroyed row pins, the Differences toggle and focus — show the loader branch on first load only; overlay refetches with `VcLoaderOverlay`.
Signals: `[Ff]ocus|keydown|@key|Escape|aria-live|teleport|popover-host|tabindex`

**LENS-2 (lens: design).** Does it add a colour pair, variant, token or state (text on background,
hover, disabled) without its dark counterpart, mix with literal `white`/`black`, or change a rule every
dark preset shares?
Broke before:
- The dark `vc-button.scss` loops for outline, no-border, no-background and solid-light interpolated `#{$colors}`, the whole list, so those four variants got no dark styles — use the loop variable and check each variant in dark mode.
- The missions redesign overrode the deadline-badge dot back to `-500`, bringing back a contrast bug (`warning-500` on white 2.09:1) that an earlier fix had solved with `VcBadge`'s `-700` dots — keep the kit's contrast-safe shades.
- A shared dark `vc-button`/`vc-chip` hover rule mixed in white for Mercury's dark labels, which lowered hover contrast in red, coffee and black-gold dark (red ~5.2 → ~3.6:1) — mix toward a per-preset variable and check every dark preset.
Signals: `dark|--color-|--vc-|\bwhite\b|\bblack\b`

**LENS-3 (lens: correctness).** Can the component render twice on one page while it uses hardcoded
ids, radio `name`s or `data-test-id`s, `document` listeners or `querySelector`, or per-instance busy or
"already reported" state?
Broke before:
- Every `reporting-panel` used the fixed radio `name="reporting-period"`, so with two panels on a page clicking a tab in one unchecked the other's — build radio names from a per-instance `useComponentId()`.
- Image gallery keyboard navigation first used fixed element ids and global `document.querySelector` lookups, which hit the wrong gallery when two render on a page — derive ids per instance and scope lookups to the component root.
- `CartForLater`, rendered in both the `v-if` and `v-else` branches of `cart.vue`, kept its "already reported" flag locally, so emptying or filling the cart remounted it and resent the same `view_item_list` — keep dedupe state in the page.
Signals: `\bid=\"|type=\"radio\"|document\.|querySelector|getElementById|addEventListener\(`

**LENS-4 (lens: tests).** Do new tests stub the unit they cover, use doubles or fixtures unlike the real
contract (a stub emits what the component never does, a fixture lacks selected fields, `useFetch`
mocked as rejecting), or pass with the fix reverted?
Broke before:
- A `VcTable` test stub of `VcRadioButton` emitted `change` on every click, so single-mode "click to deselect" passed while the real native radio never fires `change` when already checked — test doubles must keep the real component's event contract.
- The variations plural-label tests stayed green with the source broken three ways, because they read one of two buttons with `inStock: false` and mocked a whole composables barrel — cover every changed call site and the default branch.
- The preview protocol tests never sent a message with a real `model` payload, so the guard's demand for a `model.id` that Designer Add-block previews lack went unnoticed — protocol tests must use payloads shaped like the Designer's.
Signals: `\.test\.ts|\.spec\.ts|[Ss]tub|[Mm]ock`

**LENS-5 (lens: performance).** Does it send a request per rendered row or period slot, or add a
request to a page every visitor opens?
Broke before:
- The cart's subscription choice sent one `GetSubscriptionOffers` request per cart line (30 lines, 30 requests, even with no plans) — load offers for all cart products in one call and let lines read from it.
- The returns module's request-return button queried `returnableItems` on every order page, unpaid or cancelled included, adding a round trip and a late layout shift — gate the query on order status before sending it.
- The account dashboard's monthly report asked for one aggregate per month range, about 24 concurrent `GROUP BY` queries from one GraphQL request on a cold cache — request one grouped-by-month field or bound the concurrency.
Signals: `useQuery|v-for|Promise\.all|fetch\(`
