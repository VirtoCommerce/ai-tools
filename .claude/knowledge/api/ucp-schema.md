# UCP contract surface — GENERATED, do not edit by hand

> Written by `npm run ucp:schema:refresh`; `ucp:schema:check` fails on drift, `ucp:schema:probe`
> additionally CALLS every declared endpoint and tool. This file is the SOURCE OF TRUTH for the
> UCP tool and endpoint contract — a test case cites it and never transcribes it
> (`.claude/rules/test-data.md` GOLDEN RULE).

## Server

- protocol: `2025-06-18`
- serverInfo: `Virto Commerce UCP` v`1.0`
- capabilities: `logging`, `prompts`, `tools`

### Tool-count agreement across the three surfaces that publish one

| surface | count |
|---|---|
| `tools/list` | 25 |
| `get_store_capabilities.mcp_tools` | 25 |
| `initialize.instructions` prose | 25 |

- in `tools/list` but NOT advertised: (none)
- in `tools/list` but NOT in the prose list: (none)

### Discovery manifest endpoint, per host

- `front`: https://vcst-qa-storefront.govirto.com/ucp/mcp
- `back`: https://vcst-qa-storefront.govirto.com/ucp/mcp

## Tools

### `cancel_cart`

required: (none)

```
  id: string
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
  store_id: string
  buyer_id: string
```

### `cancel_checkout`

required: (none)

```
  id: string
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
```

### `checkout_and_handoff`

required: `cart_id`

```
* cart_id: string
  store_id: string
  currency: string
  language: string
  buyer_id: string
  buyer: object
      id: string|null
      email: string|null
      name: string|null
      phone: string|null
  buyer_email: string
  buyer_name: string
  buyer_phone: string
  shipping_address: object
      id: string|null
      name: string|null
      organization: string|null
      first_name: string|null
      last_name: string|null
      line1: string|null
      line2: string|null
      city: string|null
      region: string|null
      region_id: string|null
      postal_code: string|null
      country_code: string|null
      country_name: string|null
      phone: string|null
      email: string|null
  billing_address: object
      id: string|null
      name: string|null
      organization: string|null
      first_name: string|null
      last_name: string|null
      line1: string|null
      line2: string|null
      city: string|null
      region: string|null
      region_id: string|null
      postal_code: string|null
      country_code: string|null
      country_name: string|null
      phone: string|null
      email: string|null
  payment_handler: string
  notes: string
```

### `complete_checkout`

required: (none)

```
  id: string
  checkout: object
      cart_id: string|null
      line_items: array|null
      buyer: object|null
      context: object|null
      fulfillment: object|null
      payment: object|null
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
  store_id: string
  buyer_id: string
```

### `create_cart`

required: (none)

```
  line_items: array
    [item]
        id: string|null
        product_id: string|null
        quantity: integer
  store_id: string
  currency: string
  language: string
  buyer_id: string
  cart_name: string
  cart_type: string
  coupons: array
  cart: object
      line_items: array|null
      context: object|null
      buyer: object|null
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
```

### `create_checkout`

required: (none)

```
  cart_id: string
  store_id: string
  currency: string
  language: string
  buyer_id: string
  buyer: object
      id: string|null
      email: string|null
      name: string|null
      phone: string|null
  buyer_email: string
  buyer_name: string
  buyer_phone: string
  shipping_address: object
      id: string|null
      name: string|null
      organization: string|null
      first_name: string|null
      last_name: string|null
      line1: string|null
      line2: string|null
      city: string|null
      region: string|null
      region_id: string|null
      postal_code: string|null
      country_code: string|null
      country_name: string|null
      phone: string|null
      email: string|null
  billing_address: object
      id: string|null
      name: string|null
      organization: string|null
      first_name: string|null
      last_name: string|null
      line1: string|null
      line2: string|null
      city: string|null
      region: string|null
      region_id: string|null
      postal_code: string|null
      country_code: string|null
      country_name: string|null
      phone: string|null
      email: string|null
  payment_handler: string
  notes: string
  checkout: object
      cart_id: string|null
      line_items: array|null
      buyer: object|null
      context: object|null
      fulfillment: object|null
      payment: object|null
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
```

### `get_cart`

required: (none)

```
  cart_id: string
  store_id: string
  currency: string
  language: string
  buyer_id: string
  id: string
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
```

### `get_checkout`

required: (none)

```
  id: string
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
  store_id: string
  buyer_id: string
```

### `get_order`

required: (none)

```
  id: string
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
  store_id: string
  buyer_id: string
  language: string
```

### `get_payment_handlers`

required: `checkout_id`

```
* checkout_id: string
```

### `get_product`

required: (none)

```
  id: string
  product_id: string
  store_id: string
  currency: string
  language: string
  catalog: object
      id: string|null
      filters: object|null
      context: object|null
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
```

### `get_store_capabilities`

required: (none)

```
(no arguments)
```

### `handoff_checkout`

required: `checkout_id`

```
* checkout_id: string
  cart_id: string
  store_id: string
  currency: string
  language: string
  buyer_id: string
  buyer: object
      id: string|null
      email: string|null
      name: string|null
      phone: string|null
  buyer_email: string
  buyer_name: string
  buyer_phone: string
  shipping_address: object
      id: string|null
      name: string|null
      organization: string|null
      first_name: string|null
      last_name: string|null
      line1: string|null
      line2: string|null
      city: string|null
      region: string|null
      region_id: string|null
      postal_code: string|null
      country_code: string|null
      country_name: string|null
      phone: string|null
      email: string|null
  billing_address: object
      id: string|null
      name: string|null
      organization: string|null
      first_name: string|null
      last_name: string|null
      line1: string|null
      line2: string|null
      city: string|null
      region: string|null
      region_id: string|null
      postal_code: string|null
      country_code: string|null
      country_name: string|null
      phone: string|null
      email: string|null
  payment_handler: string
  notes: string
```

### `link_buyer_identity`

required: (none)

```
(no arguments)
```

### `list_carts`

required: (none)

```
  store_id: string
  currency: string
  language: string
  buyer_id: string
  cart_name: string
  cart_type: string
  cursor: string
  limit: integer
  sort: string
```

### `list_countries`

required: (none)

```
  query: string
  limit: integer
```

### `list_regions`

required: `country_id`

```
* country_id: string
```

### `logout_buyer`

required: (none)

```
(no arguments)
```

### `lookup_catalog`

required: (none)

```
  catalog: object
      ids: array|null
      filters: object|null
      context: object|null
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
  store_id: string
```

### `resolve_country`

required: `query`

```
* query: string
```

### `search_catalog`

required: (none)

```
  catalog: object
      query: string|null
      context: object|null
      filters: object|null
      pagination: object|null
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
  store_id: string
```

### `search_products`

required: `query`

```
* query: string
  store_id: string
  currency: string
  language: string
  price_min: integer|null
  price_max: integer|null
  limit: integer
```

### `track_order`

required: (none)

```
  order_id: string
  order_number: string
  cart_id: string
  placed_after: string|null
  store_id: string
  currency: string
  language: string
  buyer_id: string
```

### `update_cart`

required: (none)

```
  cart_id: string
  line_items: array
    [item]
        id: string|null
        product_id: string|null
        quantity: integer
  store_id: string
  currency: string
  language: string
  buyer_id: string
  cart_name: string
  cart_type: string
  coupons: array
  id: string
  cart: object
      line_items: array|null
      context: object|null
      buyer: object|null
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
```

### `update_checkout`

required: (none)

```
  checkout_id: string
  cart_id: string
  store_id: string
  currency: string
  language: string
  buyer_id: string
  buyer: object
      id: string|null
      email: string|null
      name: string|null
      phone: string|null
  buyer_email: string
  buyer_name: string
  buyer_phone: string
  shipping_address: object
      id: string|null
      name: string|null
      organization: string|null
      first_name: string|null
      last_name: string|null
      line1: string|null
      line2: string|null
      city: string|null
      region: string|null
      region_id: string|null
      postal_code: string|null
      country_code: string|null
      country_name: string|null
      phone: string|null
      email: string|null
  billing_address: object
      id: string|null
      name: string|null
      organization: string|null
      first_name: string|null
      last_name: string|null
      line1: string|null
      line2: string|null
      city: string|null
      region: string|null
      region_id: string|null
      postal_code: string|null
      country_code: string|null
      country_name: string|null
      phone: string|null
      email: string|null
  payment_handler: string
  notes: string
  id: string
  checkout: object
      cart_id: string|null
      line_items: array|null
      buyer: object|null
      context: object|null
      fulfillment: object|null
      payment: object|null
  meta: object
      ucp-agent: object|null
      idempotency-key: string|null
```

## Declared operations (`get_store_capabilities.endpoints.operations`)

| method | path | name | capability | status |
|---|---|---|---|---|
| `GET` | `/.well-known/ucp` | `get_store_capabilities` | profile | available |
| `MCP` | `/ucp/mcp` | `checkout_and_handoff` | checkout | available |
| `MCP` | `/ucp/mcp` | `link_buyer_identity` | identity_linking | available |
| `MCP` | `/ucp/mcp` | `logout_buyer` | identity_linking | available |
| `GET` | `/ucp/v1/carts/{cartId}` | `get_cart` | cart | available |
| `PUT` | `/ucp/v1/carts/{cartId}` | `update_cart` | cart | available |
| `POST` | `/ucp/v1/carts` | `create_cart` | cart | available |
| `GET` | `/ucp/v1/carts` | `list_carts` | cart | available |
| `GET` | `/ucp/v1/catalog/products/{id}` | `get_product` | catalog | available |
| `POST` | `/ucp/v1/catalog/search` | `search_products` | catalog | available |
| `POST` | `/ucp/v1/checkouts/{checkoutId}/handoff` | `handoff_checkout` | checkout | available |
| `GET` | `/ucp/v1/checkouts/{checkoutId}/payment-handlers` | `get_payment_handlers` | checkout | available |
| `PATCH` | `/ucp/v1/checkouts/{checkoutId}` | `update_checkout` | checkout | available |
| `POST` | `/ucp/v1/checkouts` | `create_checkout` | checkout | available |
| `GET` | `/ucp/v1/geography/countries/{countryId}/regions` | `list_regions` | geography | available |
| `GET` | `/ucp/v1/geography/countries/resolve` | `resolve_country` | geography | available |
| `GET` | `/ucp/v1/geography/countries` | `list_countries` | geography | available |
| `POST` | `/ucp/v1/internal/handoff/restore` | `storefront_restore` | checkout | available_storefront |
| `GET` | `/ucp/v1/orders?cart_id={cartId}` | `track_order` | order | available |
| `GET` | `/ucp/v1/orders/{orderId}` | `track_order` | order | available |

## Error codes

`invalid_request` · `identity_required` · `buyer_context_mismatch` · `handoff_in_progress` · `missing_store_id` · `product_not_found` · `cart_not_found` · `out_of_stock` · `insufficient_stock` · `inventory_unavailable` · `order_not_found` · `xapi_invalid_response`

## Advertised headers

- `correlation_id`: "X-Correlation-Id"
- `trace_id`: "X-Trace-Id"
- `idempotency_key`: "Idempotency-Key"
- `agent_api_key`: "X-Agent-Api-Key"
- `buyer_context`: []

