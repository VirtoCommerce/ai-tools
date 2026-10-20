# Evidence index — V8: unnamed option radios on configurable PDP (VCST-6398)

**Verdict: REPRODUCED** · env `vcst` / deployment `vcst_qa` · build footer `Ver. 3.1.0-pr-11-d67b-d67b0e0a` (matches; cache-busted `?cb=`) · guest · Chrome DevTools MCP, 1920x1080 · axe-core 4.10.2 (tags wcag2a/2aa/21a/21aa/22aa)
FRONT_URL = vcst storefront; BACK_URL not involved. ENV_RISK n/a (read-only, no state written). No server-side layer: no trace ID / App Insights needed (Part A rows 5, 10 = N/A, storefront-only DOM defect).

| # | Artifact | Where | Result |
|---|---|---|---|
| 1 | failure screenshots | screenshots/V8-cake-top-radiogroup.png, V8-cake-pdp-1920.png, V8-bed-pdp-1920.png | radios render fine visually; name is absent only to AT |
| 2 | AX tree (replaces DOM snapshot) | a11y/V8-cake-ax-snapshot.txt, V8-cake-ax-snapshot-expanded.txt, V8-bed-ax-snapshot.txt | `radiogroup "Top"` > `radio checked` / `radio` with NO name; sibling `link "<product name>"` is a separate node |
| 3 | axe results | a11y/V8-cake-axe-4.10.2.json (hand-written summary of the in-session result), a11y/V8-bed-axe-4.10.2.json (raw), a11y/V8-bed-axe-summary.md | rule `label`, impact critical, wcag412: cake 3 nodes default state, **18 nodes with all 4 optional sections expanded by real clicks**; bed 2 nodes (8 radios in DOM, all unnamed) |
| 4 | DOM facts per radio | inside the JSON above | every radio: `aria-label` null, `aria-labelledby` null, `label[for]` = its own id, label text `""`; 4 of 18 are the "None" row; the radiogroup itself IS named (aria-label = section name) |
| 5 | console | none relevant (production build: the kit's DEV-only warning cannot fire, see root-cause) | — |
| 6 | HAR / network | not applicable (no request involved) | — |
| 7 | versions | footer `3.1.0-pr-11-d67b-d67b0e0a` read on each page | PR #11 head d67b0e0a87b1da3eb0499afeeaf2b8fc91d064ef |
| 8 | source | source/option-product.vue@d67b0e0a.vue, option-product-none.vue@…, vc-radio-button.vue@…, pr11-changed-files.txt | see root-cause.md |

Products reproduced on: (1) Vintage Wedding cake `/product/c94d730a-a1e3-41d3-bba6-8e9eb9fe45e8` (Top, Buttercreme style, Filing, Flowers, Message Tag); (2) Bed with Additional Options `/product/c7205a92-94c2-49f9-9049-ed3cfcb3a70b` (Mattrass, Pillow, Mattress cover, Blanket). The phone-case fixture was not opened; two products suffice.
Incidental, not triaged: axe `image-alt` critical x4 on the cake PDP with sections expanded; `aria-prohibited-attr` under `incomplete` x3 (needs-review, not a violation).
Reproduction rate: 3/3 loads of the cake PDP, 1/1 bed (deterministic, markup-level).
