#!/usr/bin/env node
/**
 * Author the runner-native layout suite (048c) from a structured spec.
 *
 * Written as a generator, not by hand-editing CSV: appending rows to these suites by
 * hand corrupts quote-escaping (see feedback_csv_append_newline_corruption, and the
 * six suites still sitting in sync-test-suites.ts's CSV_LINT_BASELINE). The spec below
 * is the source; the CSV is the artifact.
 *
 *   node scripts/layout/author-reference-suite.mjs          # write the CSV
 *   node scripts/layout/author-reference-suite.mjs --check   # verify it is in sync
 *
 * Cases are re-authored from the removed 048b, converted from agent prose to the
 * layout-runner tag grammar. Each carries the 048b ID it replaces so the
 * critical-ui-scope matrix can be re-pointed cell by cell.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "regression/suites/Frontend/cross-cutting/048c-layout-stability.csv";

const COLUMNS = [
  "ID", "Title", "Section", "Priority", "Business_Rule", "Edge_Case_Refs",
  "Preconditions", "Test_Data", "Steps", "Assertions", "Cross_Layer_Checks",
  "Failure_Signals", "Cleanup", "References", "Automation_Status",
];

/** Every case is Automated — that is the entire point of the runner. */
const AUTO = "Automated";

const cases = [
  // ---------------------------------------------------------------- BL-UI-001 CLS
  {
    ID: "LAYOUT-CLS-001",
    Title: "CLS on home page (observer installed pre-paint)",
    Section: "CLS > Initial render",
    Priority: "P2",
    Business_Rule: "BL-UI-001",
    Edge_Case_Refs: "ECL-1.2",
    Preconditions:
      "Storefront reachable. The runner installs the CLS observer via addInitScript, so unlike the MCP-driven predecessor this DOES capture pre-paint shifts.",
    Test_Data: "{{FRONT_URL}}",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[THROTTLE] fast3g",
      "[NAV] {{FRONT_URL}}/",
      "[WAIT] networkidle",
      "[REFLOW]",
      "[PROBE:CLS]",
    ],
    Assertions: ["[CLS] <= 0.1"],
    Cross_Layer_Checks: "console errors and 4xx/5xx are captured automatically into the FAIL trace",
    Failure_Signals:
      "Hero .slider-block images without width/height or aspect-ratio; webfont swap reflowing .vc-typography; product grid resolving late",
    Cleanup: "none (context is destroyed after the case)",
    References: "business-logic.md#bl-ui-001; replaces 048b LAYOUT-CLS-001",
  },
  {
    ID: "LAYOUT-CLS-002",
    Title: "CLS on catalog listing",
    Section: "CLS > Initial render",
    Priority: "P2",
    Business_Rule: "BL-UI-001",
    Edge_Case_Refs: "ECL-1.2",
    Preconditions: "Catalog has at least one indexed product.",
    Test_Data: "{{FRONT_URL}}/catalog",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[THROTTLE] fast3g",
      "[NAV] {{FRONT_URL}}/catalog",
      "[WAIT] .vc-product-card >= 4",
      "[WAIT] networkidle",
      "[REFLOW]",
      "[PROBE:CLS]",
    ],
    Assertions: ["[CLS] <= 0.1"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Product-card images resolving after grid layout; facet rail widening on load",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-001; replaces 048b LAYOUT-CLS-002",
  },
  {
    ID: "LAYOUT-IMG-001",
    Title: "Home images reserve space before load (CLS root cause)",
    Section: "CLS > Reserved space",
    Priority: "P1",
    Business_Rule: "BL-UI-001",
    Edge_Case_Refs: "ECL-1.2",
    Preconditions:
      "Root-causes the CLS number: every image must carry width+height attrs, a CSS aspect-ratio, or an explicitly sized box.",
    Test_Data: "{{FRONT_URL}}",
    Steps: ["[VIEWPORT] 1280x900", "[NAV] {{FRONT_URL}}/", "[WAIT] networkidle", "[PROBE:IMGDIMS] img"],
    Assertions: ["[IMGDIMS] missingDims == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Hero slides and content-block images with aspect-ratio:auto and no width/height attributes",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-001; root cause behind 048b LAYOUT-CLS-001/002/003 + VCCAROUSEL-001",
  },
  {
    ID: "LAYOUT-IMG-002",
    Title: "Catalog product-card images reserve space",
    Section: "CLS > Reserved space",
    Priority: "P1",
    Business_Rule: "BL-UI-001",
    Edge_Case_Refs: "ECL-1.2",
    Preconditions: "Catalog renders product cards.",
    Test_Data: "{{FRONT_URL}}/catalog",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/catalog",
      "[WAIT] .vc-product-card >= 4",
      "[PROBE:IMGDIMS] .vc-product-card img",
    ],
    Assertions: ["[IMGDIMS] missingDims == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Card images collapse to zero height until bytes arrive, shifting the grid",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-001",
  },

  // ------------------------------------------------------------ BL-UI-002 spacing
  {
    ID: "LAYOUT-SPC-001",
    Title: "Spacing grid — catalog product cards",
    Section: "Spacing > Grid compliance",
    Priority: "P2",
    Business_Rule: "BL-UI-002",
    Edge_Case_Refs: "ECL-1.5",
    Preconditions:
      "Grid is the DERIVED design-system scale (npm run tokens:sync), not a 4px multiple. 10px/6px/14px are valid Tailwind steps and must PASS.",
    Test_Data: "{{FRONT_URL}}/catalog",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/catalog",
      "[WAIT] .vc-product-card >= 4",
      "[PROBE:SPACING] .vc-product-card, .vc-product-card .vc-product-title, .vc-product-card .vc-product-price",
    ],
    Assertions: ["[SPACING] offGrid == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Values on no scale step at all (13px, 27px, 41px) — NOT 10px/6px/18px, which are legitimate",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-002; replaces 048b LAYOUT-SPC-001",
  },
  {
    ID: "LAYOUT-COMP-VCBUTTON-001",
    Title: "Spacing grid — VcButton across header and main",
    Section: "Components > VcButton",
    Priority: "P2",
    Business_Rule: "BL-UI-002",
    Edge_Case_Refs: "ECL-1.5",
    Preconditions:
      "Regression guard for the false-positive that removed 048b: vc-button uses padding[2.5]=10px and padding[3.5]=14px BY DESIGN. This case must PASS on an unchanged build.",
    Test_Data: "{{FRONT_URL}}",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/",
      "[WAIT] header",
      "[PROBE:SPACING] header button, main button",
    ],
    Assertions: ["[SPACING] offGrid == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "A genuinely off-scale value; if this fails with 10px/6px the token sync has drifted — run npm run tokens:check",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-002; critical-ui-scope.md VcButton; replaces 048b LAYOUT-COMP-VCBUTTON-001",
  },

  // ---------------------------------------------------------- BL-UI-004 overflow
  {
    ID: "LAYOUT-OVF-001",
    Title: "No horizontal scroll on home at 375px",
    Section: "Overflow > Mobile",
    Priority: "P1",
    Business_Rule: "BL-UI-004",
    Edge_Case_Refs: "ECL-1.6",
    Preconditions: "Viewport is a declared step, so this can never be measured at the wrong width.",
    Test_Data: "{{FRONT_URL}}",
    Steps: ["[VIEWPORT] 375x812", "[NAV] {{FRONT_URL}}/", "[WAIT] networkidle", "[PROBE:OVERFLOW]"],
    Assertions: ["[OVERFLOW] documentScrolls == false"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Header chrome or a content block wider than the viewport at 375px",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-004; replaces 048b LAYOUT-OVF-001",
  },
  {
    ID: "LAYOUT-VPS-001",
    Title: "No horizontal scroll in the lg-to-xl fluid band (1024-1280)",
    Section: "Overflow > Viewport sweep",
    Priority: "P1",
    Business_Rule: "BL-UI-004",
    Edge_Case_Refs: "ECL-1.6",
    Preconditions:
      "048b reported documentScrolls=true at 1023/1024/1050/1100 on a Builder.io content block, recovering by 1150. Sampled at 1050 — inside the reported band, which the old fixed 375/768/1024/1280/1920 viewport set never touched.",
    Test_Data: "{{FRONT_URL}}",
    Steps: [
      "[VIEWPORT] 1050x900",
      "[NAV] {{FRONT_URL}}/",
      "[WAIT] networkidle",
      "[PROBE:OVERFLOW]",
    ],
    Assertions: ["[OVERFLOW] documentScrolls == false"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "A fixed-width block (Builder.io content) exceeding the fluid container between lg and xl",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-004; replaces 048b LAYOUT-VPS-001",
  },

  // -------------------------------------------------------- BL-UI-005 alignment
  {
    ID: "LAYOUT-ALN-001",
    Title: "Product-card row height parity",
    Section: "Alignment > Grid row",
    Priority: "P2",
    Business_Rule: "BL-UI-005",
    Edge_Case_Refs: "ECL-1.7",
    Preconditions: "Cards in one row must share height within 1px.",
    Test_Data: "{{FRONT_URL}}/catalog",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/catalog",
      "[WAIT] .vc-product-card >= 4",
      "[PROBE:ALIGN] .vc-product-card:nth-child(-n+4)",
    ],
    Assertions: ["[ALIGN] heightDrift <= 1"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "One card taller than its row neighbours, breaking the grid",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-005; replaces 048b LAYOUT-ALN-001",
  },

  // ------------------------------------------------------- BL-UI-006 touch targets
  {
    ID: "LAYOUT-TGT-001",
    Title: "Touch targets on catalog meet the WCAG AA floor at 375px",
    Section: "Touch targets > Mobile",
    Priority: "P1",
    Business_Rule: "BL-UI-006",
    Edge_Case_Refs: "ECL-1.8",
    Preconditions:
      "Two tiers: below 24x24 (AA, SC 2.5.8) FAILs. Between 24 and 44 (AAA, SC 2.5.5) WARNs, because the UI kit ships 26/32/38px controls by design.",
    Test_Data: "{{FRONT_URL}}/catalog",
    Steps: [
      "[VIEWPORT] 375x812",
      "[NAV] {{FRONT_URL}}/catalog",
      "[WAIT] .vc-product-card >= 2",
      "[PROBE:TOUCH] main",
    ],
    Assertions: ["[TOUCH] belowAA == 0", "[TOUCH] belowAAA == 0", "[TOUCH] tooClose == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "A control under 24x24 is a real defect; 26-38px controls are the design-system tier and only WARN",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-006; replaces 048b LAYOUT-TGT-001",
  },
  {
    ID: "LAYOUT-TGT-002",
    Title: "Sign-in form touch targets at 375px",
    Section: "Touch targets > Forms",
    Priority: "P1",
    Business_Rule: "BL-UI-006",
    Edge_Case_Refs: "ECL-1.8",
    Preconditions:
      "Anonymous context. A fresh context per case means /sign-in never redirects to /catalog the way it did for an already-authenticated agent session.",
    Test_Data: "{{FRONT_URL}}/sign-in",
    Steps: ["[VIEWPORT] 375x812", "[NAV] {{FRONT_URL}}/sign-in", "[WAIT] form", "[PROBE:TOUCH] form"],
    Assertions: ["[TOUCH] belowAA == 0", "[TOUCH] belowAAA == 0", "[TOUCH] tooClose == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Password-visibility toggle or submit button under the AA floor",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-006; replaces 048b LAYOUT-PAGE-TGT-SIGNIN-001",
  },

  // ------------------------------------------------------- BL-UI-003 state shift
  {
    ID: "LAYOUT-SHIFT-001",
    Title: "Product-card hover does not displace its neighbour",
    Section: "State shift > Hover",
    Priority: "P2",
    Business_Rule: "BL-UI-003",
    Edge_Case_Refs: "ECL-1.4",
    Preconditions: "Hover must use outline or a reserved transparent border, never a layout-affecting border.",
    Test_Data: "{{FRONT_URL}}/catalog",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/catalog",
      "[WAIT] .vc-product-card >= 2",
      "[SNAP] before = .vc-product-card:nth-child(2)",
      "[HOVER] .vc-product-card:nth-child(1)",
      "[SNAP] after = .vc-product-card:nth-child(2)",
    ],
    Assertions: ["[SHIFT] before vs after topDelta == 0", "[SHIFT] before vs after leftDelta == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Neighbour card moves when the sibling is hovered",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-003; replaces 048b LAYOUT-SHIFT-001",
  },

  // ========================================================================
  // Expansion — page-level overflow at 375px (BL-UI-004 Pages matrix column)
  // ========================================================================
  ...[
    { id: "LAYOUT-OVF-002", page: "catalog", path: "/catalog", wait: ".vc-product-card >= 2", cell: "/catalog" },
    { id: "LAYOUT-OVF-004", page: "sign-in", path: "/sign-in", wait: "form", cell: "/sign-in" },
    { id: "LAYOUT-OVF-005", page: "sign-up", path: "/sign-up", wait: "form", cell: "/sign-up" },
    { id: "LAYOUT-OVF-006", page: "search results", path: "/search?q=a", wait: "networkidle", cell: "/search?q=" },
  ].map((p) => ({
    ID: p.id,
    Title: `No horizontal scroll on ${p.page} at 375px`,
    Section: "Overflow > Mobile",
    Priority: "P1",
    Business_Rule: "BL-UI-004",
    Edge_Case_Refs: "ECL-1.6",
    Preconditions: "Anonymous. Fresh context per case, so /sign-in and /sign-up do not redirect the way they do in a warm authenticated session.",
    Test_Data: `{{FRONT_URL}}${p.path}`,
    Steps: ["[VIEWPORT] 375x812", `[NAV] {{FRONT_URL}}${p.path}`, `[WAIT] ${p.wait}`, "[PROBE:OVERFLOW]"],
    Assertions: ["[OVERFLOW] documentScrolls == false"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "An element wider than the viewport forces the document to scroll sideways",
    Cleanup: "none",
    References: `business-logic.md#bl-ui-004; critical-ui-scope.md Pages matrix ${p.cell} x BL-UI-004`,
  })),

  // PDP is resolved at runtime — no stale slug fixture (048b's @td(STRESS.longTitleSlug) 404'd).
  {
    ID: "LAYOUT-OVF-003",
    Title: "No horizontal scroll on PDP at 375px (longest-title product)",
    Section: "Overflow > Mobile",
    Priority: "P1",
    Business_Rule: "BL-UI-004",
    Edge_Case_Refs: "ECL-1.6",
    Preconditions: "Product resolved live via [DISCOVER] longestTitleSlug — the long title is the overflow stressor, and discovering it removes the fixture-drift blocker that stopped 048b.",
    Test_Data: "resolved at runtime",
    Steps: [
      "[VIEWPORT] 375x812",
      "[DISCOVER] SLUG = longestTitleSlug",
      "[NAV] {{FRONT_URL}}{{SLUG}}",
      "[WAIT] networkidle",
      "[PROBE:OVERFLOW]",
    ],
    Assertions: ["[OVERFLOW] documentScrolls == false"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Long product title or gallery pushes the document wider than 375px",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-004; critical-ui-scope.md Pages matrix PDP x BL-UI-004",
  },

  // ========================================================================
  // Expansion — components reachable anonymously
  // ========================================================================
  {
    ID: "LAYOUT-COMP-HEADER-001",
    Title: "Header chrome spacing grid",
    Section: "Components > Header",
    Priority: "P2",
    Business_Rule: "BL-UI-002",
    Edge_Case_Refs: "ECL-1.5",
    Preconditions: "048b failed this on 'paddingLeft/Right=44px off-grid'. 44px is padding.11 — a valid step. This must PASS.",
    Test_Data: "{{FRONT_URL}}",
    Steps: ["[VIEWPORT] 1280x900", "[NAV] {{FRONT_URL}}/", "[WAIT] header", "[PROBE:SPACING] header, header nav, header button"],
    Assertions: ["[SPACING] offGrid == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "A value on no scale step; 44px is NOT a violation",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-002; critical-ui-scope.md Header x BL-UI-002",
  },
  {
    ID: "LAYOUT-COMP-HEADER-003",
    Title: "Header controls touch targets at 375px",
    Section: "Components > Header",
    Priority: "P1",
    Business_Rule: "BL-UI-006",
    Edge_Case_Refs: "ECL-1.8",
    Preconditions: "AA floor fails; the 26-38px UI-kit tier warns.",
    Test_Data: "{{FRONT_URL}}",
    Steps: ["[VIEWPORT] 375x812", "[NAV] {{FRONT_URL}}/", "[WAIT] header", "[PROBE:TOUCH] header"],
    Assertions: ["[TOUCH] belowAA == 0", "[TOUCH] belowAAA == 0", "[TOUCH] tooClose == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Hamburger, cart or account control below 24x24",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-006; critical-ui-scope.md Header x BL-UI-006",
  },
  {
    ID: "LAYOUT-COMP-VCINPUT-001",
    Title: "Sign-in form spacing grid",
    Section: "Components > VcInput",
    Priority: "P2",
    Business_Rule: "BL-UI-002",
    Edge_Case_Refs: "ECL-1.5",
    Preconditions: "Anonymous context.",
    Test_Data: "{{FRONT_URL}}/sign-in",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/sign-in",
      "[WAIT] form",
      "[PROBE:SPACING] form .vc-input, form .vc-input__container, form .vc-input__input",
    ],
    Assertions: ["[SPACING] offGrid == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Off-scale field padding",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-002; critical-ui-scope.md VcInput x BL-UI-002",
  },
  {
    ID: "LAYOUT-COMP-VCINPUT-002",
    Title: "Validation error insertion must not move the submit button",
    Section: "Components > VcInput",
    Priority: "P1",
    Business_Rule: "BL-UI-003",
    Edge_Case_Refs: "ECL-1.4",
    Preconditions:
      "The error message must occupy reserved space. 048b measured a 16px push here and called it 'a small, controlled shift' — BL-UI-003 says the delta must be 0, so this case states the invariant and lets the result speak.",
    Test_Data: "{{FRONT_URL}}/sign-in",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/sign-in",
      "[WAIT] form",
      "[SNAP] before = [data-test-id=\"login-button\"]",
      "[FILL] [data-test-id=\"email-input\"] = not-an-email",
      "[CLICK] [data-test-id=\"login-button\"]",
      "[WAIT] 800ms",
      "[SNAP] after = [data-test-id=\"login-button\"]",
    ],
    Assertions: ["[SHIFT] before vs after topDelta == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Submit button pushed down when the inline error renders",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-003; critical-ui-scope.md VcInput x BL-UI-003; replaces 048b LAYOUT-SHIFT-003",
  },
  {
    ID: "LAYOUT-COMP-VCEXPANSION-001",
    Title: "Catalog facet panels spacing grid",
    Section: "Components > VcExpansionPanels",
    Priority: "P2",
    Business_Rule: "BL-UI-002",
    Edge_Case_Refs: "ECL-1.5",
    Preconditions: "Catalog renders facet groups.",
    Test_Data: "{{FRONT_URL}}/catalog",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/catalog",
      "[WAIT] .vc-product-card >= 2",
      "[PROBE:SPACING] .vc-expansion-panels, .vc-expansion-panel",
    ],
    Assertions: ["[SPACING] offGrid == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Off-scale panel padding",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-002; critical-ui-scope.md VcExpansionPanels x BL-UI-002",
  },
  {
    ID: "LAYOUT-COMP-VCEXPANSION-004",
    Title: "Facet panel headers touch targets at 375px",
    Section: "Components > VcExpansionPanels",
    Priority: "P1",
    Business_Rule: "BL-UI-006",
    Edge_Case_Refs: "ECL-1.8",
    Preconditions: "048b failed all 15 facet headers against the flat 44px bar; only a sub-24px header is a real defect.",
    Test_Data: "{{FRONT_URL}}/catalog",
    Steps: [
      "[VIEWPORT] 375x812",
      "[NAV] {{FRONT_URL}}/catalog",
      "[WAIT] .vc-product-card >= 2",
      "[PROBE:TOUCH] .vc-expansion-panels",
    ],
    Assertions: ["[TOUCH] belowAA == 0", "[TOUCH] belowAAA == 0", "[TOUCH] tooClose == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "A facet header below the 24x24 AA floor",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-006; critical-ui-scope.md VcExpansionPanels x BL-UI-006",
  },
  {
    ID: "LAYOUT-COMP-VCTABSWITCH-001",
    Title: "Catalog view-switcher tab alignment",
    Section: "Components > VcTabSwitch",
    Priority: "P2",
    Business_Rule: "BL-UI-005",
    Edge_Case_Refs: "ECL-1.7",
    Preconditions: "Grid/list tabs sit in one row and must share a baseline.",
    Test_Data: "{{FRONT_URL}}/catalog",
    Steps: [
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/catalog",
      "[WAIT] [data-test-id=\"view-switcher\"]",
      "[PROBE:ALIGN] [data-test-id=\"view-switcher\"] > *",
    ],
    Assertions: ["[ALIGN] centerDrift <= 1", "[ALIGN] heightDrift <= 1"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Grid and list tabs vertically offset from each other",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-005; critical-ui-scope.md VcTabSwitch x BL-UI-005",
  },
  {
    ID: "LAYOUT-COMP-VCBREADCRUMBS-002",
    Title: "PDP breadcrumbs do not overflow at 375px",
    Section: "Components > VcBreadcrumbs",
    Priority: "P2",
    Business_Rule: "BL-UI-004",
    Edge_Case_Refs: "ECL-1.6",
    Preconditions: "Deep category paths are the chronic mobile overflow source. PDP resolved live.",
    Test_Data: "resolved at runtime",
    Steps: [
      "[VIEWPORT] 375x812",
      "[DISCOVER] SLUG = longestTitleSlug",
      "[NAV] {{FRONT_URL}}{{SLUG}}",
      "[WAIT] networkidle",
      "[PROBE:OVERFLOW]",
    ],
    Assertions: ["[OVERFLOW] documentScrolls == false"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Breadcrumb row pushes a horizontal scrollbar instead of wrapping or truncating",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-004; critical-ui-scope.md VcBreadcrumbs x BL-UI-004",
  },

  // ========================================================================
  // Expansion — authenticated surfaces (exercises the [AUTH] storageState path)
  // ========================================================================
  {
    ID: "LAYOUT-COMP-VCTABLE-001",
    Title: "Order-table spacing and row-height parity",
    Section: "Components > VcTable",
    Priority: "P2",
    Business_Rule: "BL-UI-002",
    Edge_Case_Refs: "ECL-1.5",
    Preconditions:
      "USER signs in through the real form once; the storageState is reused per case, so each case still gets a clean context. Requires order history — no rows means BLOCKED (no signal), never PASS.",
    Test_Data: "{{FRONT_URL}}/account/orders",
    Steps: [
      "[AUTH] USER",
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/account/orders",
      "[WAIT] .vc-table tbody tr >= 1",
      "[PROBE:SPACING] .vc-table, .vc-table th, .vc-table td",
    ],
    Assertions: ["[SPACING] offGrid == 0"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Off-scale cell padding",
    Cleanup: "none (context destroyed)",
    References: "business-logic.md#bl-ui-002; critical-ui-scope.md VcTable x BL-UI-002",
  },
  {
    ID: "LAYOUT-COMP-VCTABLE-002",
    Title: "Order-table row heights match",
    Section: "Components > VcTable",
    Priority: "P2",
    Business_Rule: "BL-UI-005",
    Edge_Case_Refs: "ECL-1.7",
    Preconditions: "Row-height drift is the canonical 'looks broken' signal. Needs >= 3 orders.",
    Test_Data: "{{FRONT_URL}}/account/orders",
    Steps: [
      "[AUTH] USER",
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/account/orders",
      "[WAIT] .vc-table tbody tr >= 3",
      "[PROBE:ALIGN] .vc-table tbody tr:nth-child(-n+3)",
    ],
    Assertions: ["[ALIGN] heightDrift <= 1"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Row heights drift as content length varies",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-005; critical-ui-scope.md VcTable x BL-UI-005",
  },
  {
    ID: "LAYOUT-COMP-VCSIDEBAR-001",
    Title: "Account sidebar nav item alignment",
    Section: "Components > VcSidebar",
    Priority: "P2",
    Business_Rule: "BL-UI-005",
    Edge_Case_Refs: "ECL-1.7",
    Preconditions: "The VcLayout sidebar slot is the /account/* layout backbone. 048b failed this on a 10px/6px phantom — must PASS now.",
    Test_Data: "{{FRONT_URL}}/account/dashboard",
    Steps: [
      "[AUTH] USER",
      "[VIEWPORT] 1280x900",
      "[NAV] {{FRONT_URL}}/account/dashboard",
      "[WAIT] aside",
      "[PROBE:ALIGN] aside nav a",
    ],
    Assertions: ["[ALIGN] heightDrift <= 1"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Sidebar item heights drift, signalling a broken token chain",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-005; critical-ui-scope.md VcSidebar x BL-UI-005",
  },
  {
    ID: "LAYOUT-PAGE-CLS-DASHBOARD-001",
    Title: "CLS on account dashboard",
    Section: "CLS > Initial render",
    Priority: "P2",
    Business_Rule: "BL-UI-001",
    Edge_Case_Refs: "ECL-1.2",
    Preconditions: "Dashboard carries latest-orders and a monthly-spend chart — charts are CLS-prone.",
    Test_Data: "{{FRONT_URL}}/account/dashboard",
    Steps: [
      "[AUTH] USER",
      "[VIEWPORT] 1280x900",
      "[THROTTLE] fast3g",
      "[NAV] {{FRONT_URL}}/account/dashboard",
      "[WAIT] networkidle",
      "[REFLOW]",
      "[PROBE:CLS]",
    ],
    Assertions: ["[CLS] <= 0.1"],
    Cross_Layer_Checks: "auto-captured",
    Failure_Signals: "Chart or order list resolving late and pushing content",
    Cleanup: "none",
    References: "business-logic.md#bl-ui-001; critical-ui-scope.md Pages matrix /account/dashboard x BL-UI-001",
  },
].flat();

// ---------------------------------------------------------------------------
// Render — RFC4180 quoting, every field quoted, "" escaping, CRLF line breaks.
// ---------------------------------------------------------------------------

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const cell = (v) => q(Array.isArray(v) ? v.join("\r\n") : v);

function render() {
  const out = [COLUMNS.map(q).join(",")];
  for (const c of cases) {
    out.push(COLUMNS.map((col) => cell(col === "Automation_Status" ? AUTO : c[col])).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

const next = render();
const check = process.argv.includes("--check");
const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;

if (check) {
  if (prev !== next) {
    console.error(`[048c] FAIL — ${OUT} is out of sync with the spec. Run: node scripts/layout/author-reference-suite.mjs`);
    process.exit(1);
  }
  console.log(`[048c] OK — ${cases.length} case(s) in sync.`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, next, "utf8");
const byBl = {};
for (const c of cases) byBl[c.Business_Rule] = (byBl[c.Business_Rule] ?? 0) + 1;
console.log(`[048c] wrote ${cases.length} case(s) → ${OUT}`);
console.log(`[048c] ${Object.entries(byBl).map(([k, v]) => `${k}:${v}`).join("  ")}`);
