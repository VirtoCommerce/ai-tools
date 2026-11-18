// What a fork edits to tune the classification: path zones, content signals, every pattern and
// threshold. The other files in lib/ hold the mechanics and read everything from here.

import { globMatch } from "./globs.mjs";

export const TIERS = ["R0", "R1", "R2", "R3"];
export const BIG_DIFF_LINES = 400;
export const BIG_DIFF_FILES = 20;
export const MAX_CONTAINED_CONSUMERS = 2;

// Past either limit no single review reads the change file by file: the report switches to a summary
// with clusters, and one representative stands for each group of mechanical files.
export const HUGE_DIFF_FILES = 100;
export const HUGE_DIFF_LINES = 3000;
// The same hunk in this many files is a mechanical edit (an import path, a renamed prop), not logic.
export const REPEATED_HUNK_FILES = 5;
export const HUGE_TOP_FILES = 30;
// Review modes by the non-trivial part (not R0, not mechanical): S and M are read whole by each lens;
// only L and XL pay for the change graph, flows and per-lens units. XL is huge mode.
export const MODE_S_FILES = 3;
export const MODE_S_LINES = 150;
export const MODE_M_FILES = 20;
export const MODE_M_LINES = 1000;
// Size alone misjudges this codebase: a two-file change that spans checkout and the facade needs the
// flow picture as much as a big one. Each signal below is known before the graph work runs.
export const MODE_CRITICAL_ZONES = ["commerce", "add-to-cart", "auth", "company", "context-switch", "federation", "ui-kit"];
export const MODE_L_CRITICAL_ZONES = 2;
export const MODE_L_LAYERS = 3;
export const MODE_L_EXPOSED_FILES = 3;
export const HUGE_LARGEST_FILES = 10;

// First match wins. A rule's tier is the floor for the file; fan-out can only raise it.
export const ZONES = [
  // Agent instructions change how every later change is written and reviewed.
  { id: "agent-instructions", tier: 1, globs: [".claude/**", "**/CLAUDE.md", "**/AGENTS.md", "**/REVIEW.md"], reason: "agent instructions: they steer every later change" },
  { id: "tests", tier: 0, globs: ["**/*.test.ts", "**/*.test-d.ts", "**/*.spec.ts", "**/__snapshots__/**", "**/__mocks__/**"], reason: "tests only" },
  { id: "stories", tier: 0, globs: ["**/*.stories.ts", "**/*.stories.vue", ".storybook/**"], reason: "Storybook only" },
  { id: "docs", tier: 0, globs: ["**/*.md", "docs/**"], reason: "documentation" },
  { id: "locales", tier: 0, globs: ["**/locales/*.json"], reason: "translations" },
  { id: "assets", tier: 0, globs: ["**/*.{png,jpg,jpeg,webp,gif,ico,woff,woff2}"], reason: "binary asset" },
  { id: "generated", tier: 1, globs: ["**/api/graphql/types.ts"], reason: "generated from the GraphQL schema: review the operation or schema change, not this file" },

  { id: "ui-kit", tier: 3, globs: ["client-app/ui-kit/**"], reason: "ui-kit is public API: forks restyle it, plugins import it through core-api" },
  { id: "federation", tier: 3, globs: ["client-app/core-api/**", "client-app/core/federation/**", "vite.federation.*", "**/federation.mjs"], reason: "Module Federation facade or contract: every plugin depends on it" },
  { id: "commerce", tier: 3, globs: ["client-app/shared/{cart,checkout,payment}/**", "client-app/pages/checkout/**", "client-app/pages/cart.vue", "client-app/pages/account/order-payment.vue", "client-app/core/api/graphql/{cart,payment}/**", "client-app/modules/*/components/payment-processing-*"], reason: "cart, checkout or payment: money and orders" },
  { id: "add-to-cart", tier: 3, globs: ["**/quantity-control.vue", "**/add-to-cart*", "client-app/shared/catalog/components/configuration/**", "**/useConfigurableProduct*", "**/useProductVariationProperties*", "**/useQuantityValidationSchema*"], reason: "quantity, variation or configuration that decides what goes into the cart" },
  { id: "company", tier: 3, globs: ["client-app/shared/company/**", "client-app/core/api/graphql/organization/**"], reason: "B2B organization, members and roles" },
  { id: "auth", tier: 3, globs: ["client-app/core/plugins/{auth,permissions}.plugin.ts", "client-app/core/composables/useAuth*", "client-app/pages/auth/**", "client-app/shared/sign-in/**", "client-app/shared/account/composables/{useSignMeIn,useImpersonate}*", "client-app/pages/{sign-in,sign-up,reset-password,forgot-password,change-password,confirm-email,confirm-invitation}.vue"], reason: "authentication, impersonation and permissions" },
  { id: "context-switch", tier: 3, globs: ["client-app/shared/layout/components/{currency-selector,language-selector}/**", "client-app/shared/ship-to-location/**"], reason: "currency, language or ship-to switch: the cart and user state are rebuilt" },
  { id: "build", tier: 3, globs: ["package.json", "yarn.lock", ".yarnrc.yml", ".npmrc", "vite.config.*", "**/tsconfig*.json"], reason: "build or dependencies: every page ships through it" },
  { id: "ci", tier: 3, globs: [".github/**"], reason: "CI and repository automation" },

  { id: "core", tier: 2, globs: ["client-app/core/**"], reason: "core: every layer above uses it" },
  { id: "app-shell", tier: 2, globs: ["client-app/{main.ts,app-runner.ts,App.vue,i18n.ts,broadcast.ts,chunk-load-recovery.ts}", "client-app/router/**", "client-app/modules/*/index.ts", "client-app/modules/*/routes.ts"], reason: "bootstrap, routing or module registration" },
  { id: "catalog-search", tier: 2, globs: ["**/useProducts.ts", "**/useProductsFilters*", "client-app/shared/catalog/components/category.vue", "client-app/shared/layout/components/header/_internal/search-bar/**"], reason: "catalog search state: filters, facets, sort, paging, URL sync" },
  { id: "content", tier: 2, globs: ["client-app/pages/matcher/**", "client-app/plugins/**", "client-app/shared/static-content/**"], reason: "page content, slug resolution, Page Builder preview protocol" },
  { id: "styles", tier: 2, globs: ["client-app/assets/**/*.{scss,css}", "client-app/designs/**", "client-app/assets/presets/**", "tailwind.config.*", "postcss.config.*"], reason: "global styles, designs or presets" },
  { id: "config", tier: 2, globs: ["client-app/config/**"], reason: "store configuration defaults" },
];

export function zoneOf(p) {
  return ZONES.find((z) => z.globs.some((g) => globMatch(g, p)));
}

// package.json whose only changed lines are its version: a release bump.
export const VERSION_ONLY_ZONE = { id: "build-version", tier: 0, reason: "package.json: version field only" };
export const VERSION_LINE = /^\s*"version"\s*:/;

// Flows whose files are critical on their own; a file they render or call inherits their attention.
export const CRITICAL_ZONES = ["commerce", "add-to-cart", "company", "auth", "context-switch"];
// Zones that are wider than any single flow (core is read by checkout and by everything else) say
// nothing more by reaching checkout; the walk is for page, shared and module code.
export const WIDE_ZONES = ["core", "app-shell", "styles", "config", "ui-kit", "federation"];
// The app shell imports everything; walking through it would make every file "critical".
export const HUB = /^client-app\/(router\/|main\.ts$|app-runner\.ts$|App\.vue$|modules\/[^/]+\/index\.ts$|core-api\/)/;
// Barrels that forks and modules import from: a file exported through one is visible outside its folder.
export const PUBLIC_BARREL = /^client-app\/(shared|modules|core)\/[^/]+\/index\.ts$/;
export const BARREL = /(^|\/)index\.(ts|js|mjs)$/;
export const FACADE_ENTRY = /^client-app\/core-api\/[^/]+\.ts$/;

// Added lines that put untrusted HTML, code or navigation on the page.
export const HTML_INJECTION = /v-html|innerHTML|outerHTML|insertAdjacentHTML|DOMPurify|sanitiz|\beval\(|new Function\(|document\.write|returnUrl|postMessage|createObjectURL/;
// Mechanisms that broke repeatedly in this codebase's history, found in changed (added or removed) lines.
export const CONTENT_SIGNALS = [
  { tier: 3, zone: "commerce", re: /registerPaymentProcessor|createOrderFromCart|initializePayment|initializeCartPayment|authorizePayment|setCardData(Valid|Invalid)/, reason: "payment lifecycle call" },
  { tier: 3, zone: "commerce", re: /queuedMutations|createQueueTarget|useMutationBatcher|optimisticResponse/, reason: "cart mutation ordering or optimistic update" },
  { tier: 2, re: /keyFields|typePolicies|fetchPolicy|awaitRefetchQueries|refetchQueries/, reason: "Apollo cache identity or refetch" },
  { tier: 2, re: /SUPPRESS_ERROR_NOTIFICATIONS_CONTEXT|single:\s*true|AbortReason/, reason: "error notification plumbing" },
  { tier: 2, re: /useLocalStorage|useSessionStorage|localStorage\.|sessionStorage\./, reason: "browser storage key or shape" },
  { tier: 2, re: /createGlobalState|createSharedComposable/, reason: "state shared beyond one component" },
];
export const MODULE_IMPORT = /from\s+["']@\/modules\//;
export const HOST_LAYER = /^client-app\/(core|shared|pages)\//;
export const FIX_SUBJECT = /^(fix|hotfix|revert)\b|^Revert\b/i;
export const FIX_WINDOW_DAYS = 365;
export const MAX_BLAME_RUNS = 20;
export const EXTENSION_POINT = /useExtensionRegistry|extensionRegistry|registerBlock|EXTENSION_NAMES/;
export const CODE_FILE = /\.(vue|ts|tsx|js|mjs|cjs)$/;
export const TEST_LIKE = /\.(test|spec|stories)\.|\.test-d\.ts$|__mocks__\//;

// A changed line that is about presentation, outside a <style> block.
export const STYLE_LINE = /(^|\s)(:?class|v-bind:class)=|\bclass:\s|@apply\b|--(vc|color)-[\w-]+|\btheme\(|@media\b|:deep\(|!important/;
export const STYLE_FILE = /\.(scss|css)$/;
export const STYLE_CANDIDATE = /\.(vue|ts|tsx|js|mjs|cjs|scss|css)$/;
export const TOKEN_SOURCES = ["client-app/assets/**/*.{scss,css,json}", "client-app/designs/**", "client-app/ui-kit/**/*.{scss,css,vue}", "tailwind.config.*"];
export const MAX_TOKEN_DETAILS = 40;
export const TAILWIND_COLOR_UTILITIES = "bg|text|border|fill|stroke|ring|outline|from|via|to|divide|placeholder|accent|caret|decoration|shadow";

// Churn no reviewer reads line by line: regenerated output and lockfiles. `sources` are the changed
// files that explain a regeneration ({dir} is the generated file's folder); `facade` adds every file
// the core-api facade re-exports. A generated file with no changed source is suspicious.
export const GENERATED = [
  { what: "GraphQL types", globs: ["**/api/graphql/types.ts"], sources: ["{dir}/**/*.graphql", "scripts/graphql-codegen/**"] },
  { what: "core-api contract", globs: ["client-app/core-api/contract/**"], sources: ["client-app/core-api/**", "client-app/ui-kit/**", "tailwind.config.*"], facade: true },
  { what: "lockfile", globs: ["yarn.lock", "**/yarn.lock", "package-lock.json", "**/package-lock.json", "pnpm-lock.yaml", "**/pnpm-lock.yaml"], sources: ["{dir}/package.json", "{dir}/.yarnrc.yml"] },
];
// How much of a repeated edit the report quotes: lines per side, characters per line.
export const SAMPLE_LINES = 3;
export const SAMPLE_CHARS = 120;
// Hunks that differ only in names and literals (a codemod that renamed a different symbol in each
// file) group by shape. Short hunks are too alike to say anything, so a shape needs both a removed and
// an added side and at least this many characters.
export const SHAPE_MIN_CHARS = 40;
export const JS_KEYWORDS = new Set("as async await break case catch class const continue default delete do else enum export extends false finally for from function if import in instanceof interface let new null of return static super switch this throw true try type typeof undefined var void while with yield".split(" "));

// Clusters: a file outside any zone groups by its domain folder. A review unit holds at most
// CLUSTER_MAX_FILES files; a bigger cluster splits by the next folder, or into chunks.
export const DOMAIN_FOLDER = /^client-app\/((?:shared|pages|modules)\/[^/]+?(?=\.\w+$|\/|$)|ui-kit\/components\/[^/]+(?=\/))/;
export const CLUSTER_MAX_FILES = 20;
// Reading order: the layers others build on first.
export const LAYERS = [
  { id: "ui-kit", re: /^client-app\/ui-kit\// },
  { id: "core", re: /^client-app\/(core|core-api)\// },
  { id: "shared", re: /^client-app\/shared\// },
  { id: "modules", re: /^client-app\/modules\// },
  { id: "pages", re: /^client-app\/pages\// },
];
// What each kind of R0 file is called in the trivial lens.
export const TRIVIAL_KINDS = { tests: "tests", stories: "stories", docs: "docs", locales: "locales", assets: "assets", "build-version": "version bump" };

// Review units: how each lens cuts the change. A local lens reads one cluster at a time; consumers
// reads the public files with their consumer lists; a flow lens reads every changed file a flow joins,
// across clusters, because a payment or a permission check breaks between files, not inside one; a
// global lens reads a condensed view of the whole change, since layers and coupling are only visible
// from above and the full diff of a big change does not fit one agent.
export const LENS_KINDS = {
  correctness: "local",
  conventions: "local",
  styles: "local",
  ui: "local",
  tests: "local",
  trivial: "local",
  "clean-code": "local",
  performance: "local",
  "ui-kit": "local",
  consumers: "consumers",
  security: "flow",
  commerce: "flow",
  architecture: "global",
  design: "global",
};
// The files a flow lens is about; a flow with any of them goes to the lens whole.
export const FLOW_LENS_MATCH = {
  security: { zones: ["auth", "company", "html-injection", "federation", "content", "ci"], questions: /^SEC-/ },
  commerce: { zones: ["commerce", "add-to-cart", "context-switch"], reasons: CONTENT_SIGNALS.filter((s) => s.zone === "commerce").map((s) => s.reason) },
};
export const FLOW_UNIT_MAX_FILES = 25;
// Review agents per mode, not counting the map, seam and refutation agents. Local lenses on one
// cluster share an agent; past the budget, units are dropped in reverse priority and listed.
export const PLAN_BUDGET = { S: 1, M: 3, L: 15, XL: 25 };
export const PLAN_LOCAL_LENSES = ["correctness", "conventions", "styles", "ui", "tests", "clean-code", "performance"];
// An M change past its budget gets one agent per kind of question: the contract it exposes, the
// flows it touches, and the local reading.
export const PLAN_CONTRACT_LENSES = ["architecture", "design", "consumers", "ui-kit"];
export const PLAN_FLOW_LENSES = ["security", "commerce"];
export const CONSUMER_UNIT_MAX_FILES = 10;
// Soft links: a GraphQL name shared by more changed files than this joins everything and tells no
// flow apart; an identifier found in more files repo-wide than this is a common word, not a key.
export const SOFT_KEY_MAX_FILES = 10;
export const RARE_IDENTIFIER_MAX_FILES = 5;
// Past this share of changed code files with no link of any kind, the graph does not explain the change.
export const ORPHAN_WARN_SHARE = 0.4;
export const OVERVIEW_COMMITS = 50;
export const IMPACT_USED_BY_MAX = 15;
export const API_DELTA_LINES = 8;
