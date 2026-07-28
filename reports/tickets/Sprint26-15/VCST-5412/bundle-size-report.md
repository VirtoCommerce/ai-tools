# VCST-5412 — Bundle-size axis (BS-01…BS-10)

**Method:** published-package contract diff (`registry.npmjs.org`, 2.1.0 → 2.2.0 → 2.3.0) + marker greps
and byte measurement of the **real deployed build** at `https://vcmp-dev.govirto.com/apps/vendor-portal/`
+ Resource-Timing first-load measurement. Scripts: `results/vcst-5412/measure-firstload.mjs`,
`measure-wire.mjs`.
**No local dual app build was performed** — see BS-01 for what that costs.

## Package contract: 2.1.0 (baseline) → 2.2.0 (this PR) → 2.3.0 (deployed)

| | 2.1.0 | 2.2.0 | 2.3.0 |
|---|---|---|---|
| unpacked size | 25.44 MB | 25.84 MB | 25.91 MB |
| file count | 1711 | 1828 | 1842 |
| `dependencies` | 52 | 52 | 52 |
| `peerDependencies` | 2 | **3** | 3 |
| `whatwg-fetch` | **dependency** | **removed** | removed |
| `vee-validate` | `dependencies ^4.12.4` | **`peerDependencies >=4.12.0`** | peer |
| `js-beautify` | absent | **dependency** | dependency |
| `prettier` (runtime dep) | absent | absent | absent |
| `exports` incl. `./charts` `./dashboard` | **no** | **yes** | yes |

## Verdicts

| ID | Verdict | Evidence |
|---|---|---|
| BS-01 | **NOT SATISFIED (not executed as specified)** | requires two app `dist` builds (2.1.0 vs 2.2.0). Not done. Package unpacked size *grew* 25.44→25.84 MB (+419 KB, +1.6%; +117 files) — but a package tarball includes types/maps/docs/locales and **is not** what ships to a browser, so this is **not** a BS-01 verdict, only context. The plan's exit criterion "bundle size is measured with concrete numbers for baseline and current" is **unmet**. |
| BS-02 | **PASS** | `prettier` absent from the deployed bundle; `js-beautify` present in `vc-shell-vendor-js49842.js` (100.2 KB decoded / 24.9 KB gz). Formatter swap landed. No baseline chunk list to diff, so "editor vendor chunk is smaller" is unverified. |
| BS-03 | **PASS** | `unovis` → `vc-shell-vendor-charts` only; `gridstack` → `vc-shell-vendor-gridstack` only. The vendor portal genuinely ships a widget/chart dashboard, so their presence is correct. See the caveat below. |
| BS-04 | **PASS** | vee-validate **core runtime appears exactly once** (`app-vendor-vee-validate`, 40.7 KB, contains `useField`/`useForm`/`FormContextKey`/`defineRule`). The second similarly-named chunk `vc-shell-vendor-vee` (11.0 KB) is the **separate `@vee-validate/rules` package** (per-locale alpha regex tables) — not a duplicate. Both v4.15.1, no version mismatch. |
| BS-05 | **PASS** | `whatwg-fetch` absent from all 79 deployed chunks, and removed from `dependencies` in 2.2.0. |
| BS-06 | **MEASURED (no baseline)** | first load, empty cache: **JS 1.55 MB wire / 5.27 MB decoded across 157 files**; all resources 1.75 MB wire / 6.03 MB decoded; compression 3.40×; zero 4xx/5xx. "Current must not be higher" is unverifiable without the 2.1.0 baseline. |
| BS-07 | **NOT EXECUTED** | Lighthouse FCP/LCP baseline-vs-current needs both builds deployed. |
| BS-08 | **NOT EXECUTED** | `yarn build:analyze` needs the local checkout. |
| BS-09 | **PASS** | `vc-shell-framework49842.js` fetched **exactly once** (112.2 KB decoded). Module Federation subpath sharing works — no per-remote duplication. |
| BS-10 | **PASS (with the predicted migration)** | The deployed app typechecks/builds and runs against 2.3.0. 2.1.0 had **no** `./charts` or `./dashboard` export, so those symbols previously came from the main barrel — an app importing them **must** now switch to the subpath. That is the plan's "Required migration", not a defect. |

## Deployed build inventory (2.3.0)

79 static chunks, **4.53 MB raw / 1.28 MB gzip**. Largest:

| chunk | raw | gzip |
|---|---|---|
| `vc-shell-vendor-lucide` | 870.2 KB | 152.5 KB |
| `vc-shell-vendors` | 760.0 KB | 192.6 KB |
| `vc-shell-vendor-tiptap` | 567.7 KB | 171.0 KB |
| `index` | 234.6 KB | 62.0 KB |
| `vc-shell-vendor-microsoft` | 221.7 KB | 82.1 KB |
| `vc-shell-vendor-charts` | 187.4 KB | 56.9 KB |
| `vc-shell-framework` | 112.2 KB | 36.3 KB |

## Finding — 35% of first-load JS is feature code the login screen cannot use

Every one of these is fetched **on the login page, before any sign-in**:

| chunk | wire | decoded | needed to log in? |
|---|---|---|---|
| `lucide` (icon set) | 152.8 KB | 870.2 KB | partially |
| `tiptap` (rich-text editor) | 171.3 KB | 567.7 KB | **no** |
| `microsoft` (App Insights) | 82.4 KB | 221.7 KB | no |
| `charts` (unovis) | 57.2 KB | 187.4 KB | **no** |
| `vuepic` (date picker) | 42.0 KB | 137.8 KB | **no** |
| `swiper` (carousel) | 30.7 KB | 101.9 KB | **no** |
| `gridstack` (dashboard grid) | 23.1 KB | 82.5 KB | **no** |
| **subtotal** | **559.3 KB** | **2.17 MB** | **35% of wire, 40% of decoded first-load JS** |

They are `modulepreload`-ed from `index.html`, i.e. eagerly in the critical path — not lazily loaded on
first dashboard/editor use.

**This qualifies the PR's headline achievement.** Making `./charts` and `./dashboard` opt-in *subpath
exports* removes them from apps that never import them — a real win at the **package** level. But for an
app that does import them (this one), they remain eager on first paint, so the **end-user first-load**
benefit is not realized. Route-level lazy loading of the editor, charts, date picker, carousel and
dashboard grid would cut ~500 KB wire from the login path — a larger real-world gain than the export
change itself, and squarely in this ticket's stated scope.

Not a defect; recorded as an improvement opportunity.

## BS-01 — ATTEMPTED, and it is **not executable as specified**

The plan's §4.1 procedure (build `app-vendor-portal` against published 2.1.0 and 2.2.0, diff `dist`) was
executed against a fresh clone of `VirtoCommerce/vendor-portal@dev` (HEAD `463d0af`, app v2.1.0,
declaring `@vc-shell/framework: ^2.3.0`), Node 22.23.1 / Yarn 4.9.1.

| framework | install | bundle | result |
|---|---|---|---|
| **2.1.0** | ok | **FAILS** | 39 type errors, then a hard Rollup error |
| **2.2.0** | ok | **FAILS** | identical failures |
| **2.3.0** | ok | **OK** | measured below |

Both older builds fail on the same root cause — the current app HEAD uses framework APIs that **do not
exist before 2.3.0**:

- `hotkey` — `TS2614: Module "@vc-shell/framework" has no exported member 'hotkey'` (≈16 files)
- `shortcut` on `IBladeToolbar` — `TS2353` (≈23 sites)

These are **not merely type errors.** Re-running with the `vite-plugin-checker` type gate stubbed out
still fails at bundle time:

```
error during build:
"hotkey" is not exported by "node_modules/@vc-shell/framework/dist/framework.js",
  imported by "src/modules/products/components/ProductsListBase.vue"
```

Confirmed against the published packages: `framework.js` contains `hotkey` in **2.3.0 only**
(2.1.0 = 0 refs, 2.2.0 = 0 refs, 2.3.0 = 1 ref).

**Therefore BS-01 cannot be answered as written.** Today's `vendor-portal` cannot be bundled against
2.1.0 or 2.2.0 at all. Pinning the app to a contemporaneous older commit would produce a diff that
conflates app changes with framework changes — destroying the very isolation BS-01 exists to provide.
**Recommendation:** replace BS-01 with a framework-package-level metric (below), which *is* measurable
and attributable, and drop the app-`dist` A/B from the exit criteria.

### Verified local 2.3.0 build — cross-validates the deployed measurements

| metric | local build | deployed |
|---|---|---|
| JS bytes (raw) | 4,748,752 (80 files) | ~4.53 MB (79 chunks) |
| CSS bytes | 688,912 | — |
| total `dist` | 8,831,994 (147 files) | — |
| gzip (js+css) | 1,476,978 | 1.28 MB (js only) |
| `whatwg-fetch` / `prettier` | **0 files** / **0 files** | absent / absent |
| `js-beautify` | 1 file | present |
| `gridstack` / `unovis` | 6 / 1 files | present |

The local build reproduces the deployed artifact closely, so the deployed figures quoted earlier in this
report are sound.

### The measurable substitute — and it is a genuine win

Comparing the framework's own barrel entry (`dist/framework.js`, i.e. `exports["."]`), which *is*
version-attributable:

| | 2.1.0 | 2.2.0 |
|---|---|---|
| `framework.js` size | 176 K | **156 K** (−20 K, **−11%**) |
| `gridstack` references | 9 | **1** |
| `unovis` references | 1 | **0** |

The opt-in subpath split **demonstrably shrank the barrel and severed its chart/dashboard coupling.**
This is the concrete, attributable evidence the ticket's bundle-size claim needed. It also means the
earlier package-level "+1.6% unpacked" figure is **not** a size regression in shipped code — it reflects
added `dist/charts` + `dist/dashboard` entry points, types and locale keys, not a heavier runtime.
