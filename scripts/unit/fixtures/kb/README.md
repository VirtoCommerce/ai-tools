# kb fixture mini-corpus

A deliberately tiny two-brain corpus the `kb-*.test.mjs` suites run against: a
**platform** root (read-only, the pinned cache shape), a **client** root (writable,
holds only the delta), and one **citing suite CSV** so `citedBy` counts and dangling
citations have something real to scan.

Every relation the resolver has to rank is represented exactly once, and each of the
three drift outcomes has its own override:

| Client entry | Relation | Exercises |
|---|---|---|
| `CL-AUTH-001` | `override BL-AUTH-004` | override wins; drift `ok` (quote still matches) |
| `CL-CHK-001`  | `suppress FLOW-CHECKOUT-001` | suppress hides the platform rule, with its reason |
| `CL-PDP-001`  | `extend LOC-PDP-002` | platform body + client addition |
| `CL-CART-020` | `override BL-CART-010` | drift `changed` — the quote no longer appears upstream |
| `CL-GONE-001` | `override BL-GONE-999` | drift `retired` — the platform id is gone |
| `CL-NEW-001`  | `new` | client-only knowledge, and the containment refusal case |

`BL-CART-011` is `status: superseded` (by `BL-CART-012`) so tests can prove a
superseded entry stays readable — supersede never deletes.

The roots carry NO `knowledge-index.json`: the index is generated, never committed
here, so `kb-index.test.mjs` regenerates it into a temp copy and a stale fixture index
can never make the drift gate look green.
