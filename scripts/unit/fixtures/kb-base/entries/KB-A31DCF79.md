---
id: KB-A31DCF79
subject: storefront cart page shows stale totals until the page is reloaded
plane: experiential
question: Why do cart totals lag a quantity change on the cart page?
status: retired
appliesTo:
  - axis: surface
    value: storefront-ui
anchors:
  - coordinate: /cart
evidence:
  - method: observation
    deployment: vcst_qa
    at: 2026-05-02T10:00:00Z
    by: session:0badf00d
---
Fixed upstream; kept only so that a base holding a retired entry can be exercised. Retrieval
must not return this, and `kb show` must still display it.
