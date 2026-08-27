/**
 * ui-step-parser — the v1 storefront UI grammar, as a PURE parser.
 *
 * Why this exists, and why it is a parser rather than a runner
 * ------------------------------------------------------------
 * `case-classifier.ts` decides whether a case can run deterministically by delegating to the
 * executor's own parser — that is the one rule that keeps a static verdict from drifting away
 * from runtime behaviour. Today the only executor parser is the GraphQL one, so a storefront
 * case can never classify as `machine` no matter how well it is written: `[NAV]`, `[ACT]` and
 * `[DOM]` are not GraphQL. Measured on suite 042 (the corpus's most-run P0 suite): 34 cases →
 * **0 machine**, every automatable one blocked on EX-010 (a step line the parser cannot type).
 *
 * So the grammar has to exist as code BEFORE a suite can be authored into it. Otherwise
 * "authored correctly" is unverifiable, and the plan's own acceptance test for that step
 * ("the classifier says every case compiles") can never pass. Parser first, generator second,
 * runner third — each consuming the one before it.
 *
 * The grammar is DERIVED, not invented
 * ------------------------------------
 * The tag set below is the measured census of suite 042's 29 automatable cases, not a wish list:
 *
 *   Steps       NAV 40 · WAIT 97 · ACT 95 · ASSERT 42 · SETUP 6 · KEY 4 · NOTE 2 · PRE:* 1
 *   Assertions  DOM 105 · STATE 23 · MATH 8 · FORMAT 4 · NAV 3 · NETWORK 1
 *   Preconds    PRE:SIGNIN_AS 19 · PRE:RESET_CART 13 · PRE:CLEAR_SESSION 4
 *
 * Operand SHAPES are a design choice (the generator will emit them); the tag vocabulary is not.
 * Adding a tag here that no suite uses would be inventing a dialect; omitting one that 042 uses
 * would guarantee the suite can never compile.
 *
 * Scope: Steps + Assertions are the contract
 * ------------------------------------------
 * `classifyCase` reads `Automation_Status`, `Steps` and `Assertions` — NOT `Preconditions` or
 * `Cross_Layer_Checks`. This parser matches that scope deliberately:
 *
 *   - `Preconditions` carries `[PRE:*]` tags AND human prose in the same cell, by design. The
 *     prose is reviewer-facing state context (the 078 split rewrote case references INTO prose
 *     requirements on purpose). Demanding the prose disappear would delete review context for
 *     zero runtime gain. `parsePreconditions` therefore returns the primitives and IGNORES
 *     surrounding prose — but a `[PRE:*]` naming a primitive outside the closed vocabulary is
 *     still an error, because that is a claim about behaviour no runner implements.
 *   - `Cross_Layer_Checks` is a MONITOR channel, not a verdict channel. `[CONSOLE]`/`[NETWORK]`
 *     are page events a runner subscribes to wholesale; `[GQL]`/`[API]`/`[ADMIN]` are cross-layer
 *     confirmations. Making an `[ADMIN]` line a hard compile blocker would push 4 of 042's 29
 *     automatable cases out of the machine lane over a check that is not the case's verdict.
 *     `classifyCrossLayer` sorts them into scoreable/unscoreable so a runner can report the
 *     remainder as `unchecked[]` — visible, never silently dropped. A case with unchecked
 *     cross-layer items is not a clean PASS; that is the runner's call to make, and it can only
 *     make it if the parser hands it the list.
 *
 * Silence is never a pass
 * -----------------------
 * Every line either parses into a typed op or becomes `UNKNOWN` WITH A REASON. There is no
 * "skip the line I don't understand" branch, because a step quietly dropped is a case that
 * reports PASS having done less than it claims — the exact failure `layout-runner.ts` guards
 * against with the same phrase.
 *
 * Pure: no filesystem, no network, no browser, no clock. That is what lets both the classifier
 * and the eventual runner share it, and what lets the tests exercise it directly.
 */

import { PRE_PRIMITIVES } from "../test-cases/lint-test-cases.js";
import { isKnownSelector } from "./storefront-selectors.generated.js";

/**
 * Bumped whenever a parse verdict can change for input that previously parsed. The
 * executability ratchet compares it and refuses to interpret a baseline across versions —
 * same contract as `CLASSIFIER_VERSION`.
 */
export const UI_PARSER_VERSION = "1.0.0";

// ---------------------------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------------------------

/**
 * A locator the runner can hand to Playwright without guessing.
 *
 * Six keys, none of them privileged. An earlier revision of this comment argued for
 * role/name-first on the grounds that the sign-in and sign-up form controls "render no test id" —
 * that was WRONG, and the error came from this repo's own selector generator reading only the
 * `data-test-id` attribute and not the UI-kit `test-id-input` prop that those forms actually use.
 * All of them carry a test id. See `.claude/rules/regression.md` §Storefront Selectors.
 *
 * What survives the correction is narrower and still worth encoding: prefer `testid=` where one
 * exists, then `name=` (locale-independent), and reach for `label=`/`text=` last, because a label
 * is an i18n key (`common.labels.email`) and the language selector is itself under test — so a
 * label-based locator is one locale switch away from failing. `role=` stays for controls that are
 * genuinely best addressed by their accessible role and name.
 */
export type UiLocator =
  | { readonly kind: "role"; readonly role: string; readonly name?: string; readonly nth?: number }
  | { readonly kind: "label"; readonly text: string; readonly nth?: number }
  | { readonly kind: "placeholder"; readonly text: string; readonly nth?: number }
  | { readonly kind: "text"; readonly text: string; readonly nth?: number }
  | { readonly kind: "testid"; readonly name: string; readonly known: boolean; readonly nth?: number }
  /**
   * The form control's `name` attribute. Locale-INDEPENDENT, which is why it is a first-class key
   * rather than something an author has to spell as `css='[name="email"]'`: vc-frontend's inputs
   * carry `name="email"`, `name="firstName"`, `name="organizationName"` while their labels are
   * i18n keys, so a `name=` locator survives a language switch and a `label=` one does not.
   */
  | { readonly kind: "name"; readonly attr: string; readonly nth?: number }
  | { readonly kind: "css"; readonly selector: string; readonly nth?: number };

/** ARIA roles the grammar accepts. Closed: an unknown role is a typo, not a new capability. */
const ROLES = new Set([
  "button", "link", "textbox", "checkbox", "radio", "combobox", "listbox", "option",
  "heading", "img", "list", "listitem", "table", "row", "cell", "tab", "tabpanel",
  "dialog", "alert", "status", "navigation", "banner", "main", "form", "search",
  "spinbutton", "switch", "menu", "menuitem", "menubar", "region", "group", "separator",
]);

const LOCATOR_KEYS = ["role", "label", "placeholder", "text", "testid", "name", "css"] as const;

/** `key='quoted value'` — single or double quotes, no escape handling (none needed; see tests). */
const KV = /([a-z]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s]+))/g;

export interface LocatorParse {
  readonly locator?: UiLocator;
  readonly error?: string;
}

/**
 * Parse the locator half of a step or assertion.
 *
 * A locator is exactly ONE of the six keys, plus an optional `nth=`. Two keys is rejected rather
 * than silently prioritised: `role=button css='.x'` has no single obvious meaning, and picking
 * one would make the author's intent unrecoverable from the CSV.
 */
export function parseLocator(text: string): LocatorParse {
  const raw = text.trim();
  if (!raw) return { error: "empty locator" };

  const found = new Map<string, string>();
  let m: RegExpExecArray | null;
  KV.lastIndex = 0;
  while ((m = KV.exec(raw)) !== null) {
    const key = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (found.has(key)) return { error: `duplicate locator key '${key}'` };
    found.set(key, value);
  }
  if (found.size === 0) {
    return { error: `no locator key found — expected one of ${LOCATOR_KEYS.join("|")}=…` };
  }

  let nth: number | undefined;
  if (found.has("nth")) {
    const n = Number(found.get("nth"));
    if (!Number.isInteger(n) || n < 0) return { error: `nth must be a non-negative integer, got '${found.get("nth")}'` };
    nth = n;
    found.delete("nth");
  }

  // `name=` is overloaded on purpose: it is the accessible-name modifier when `role=` is present
  // (`role=button name='Sign up'`), and a locator in its own right when it is not
  // (`name='email'` → the form control's name attribute). Resolving the ambiguity by looking for
  // `role=` keeps both readings available without a second keyword, and the two never co-occur in
  // a way that could mean either: a role plus an accessible name is one control, and a bare name
  // is one control.
  const nameValue = found.get("name");
  const nameIsRoleModifier = found.has("role");
  const name = nameIsRoleModifier ? nameValue : undefined;
  if (nameIsRoleModifier) found.delete("name");

  const keys = [...found.keys()].filter((k) => (LOCATOR_KEYS as readonly string[]).includes(k));
  const unknown = [...found.keys()].filter((k) => !(LOCATOR_KEYS as readonly string[]).includes(k));
  if (unknown.length) return { error: `unknown locator key(s) ${unknown.join(",")}` };
  if (keys.length === 0) {
    return { error: `no locator key found — expected one of ${LOCATOR_KEYS.join("|")}=…` };
  }
  if (keys.length > 1) {
    return { error: `locator must name exactly one of ${LOCATOR_KEYS.join("|")}, got ${keys.join("+")}` };
  }

  const key = keys[0];
  const value = found.get(key) ?? "";
  if (!value) return { error: `${key}= is empty` };

  switch (key) {
    case "role": {
      if (!ROLES.has(value)) return { error: `unknown ARIA role '${value}'` };
      return { locator: { kind: "role", role: value, ...(name ? { name } : {}), ...(nth !== undefined ? { nth } : {}) } };
    }
    case "label":
      return { locator: { kind: "label", text: value, ...(nth !== undefined ? { nth } : {}) } };
    case "placeholder":
      return { locator: { kind: "placeholder", text: value, ...(nth !== undefined ? { nth } : {}) } };
    case "text":
      return { locator: { kind: "text", text: value, ...(nth !== undefined ? { nth } : {}) } };
    case "name":
      return { locator: { kind: "name", attr: value, ...(nth !== undefined ? { nth } : {}) } };
    case "testid":
      // `known: false` means UNVERIFIED, not invalid — 19 bindings in vc-frontend are bare
      // expressions whose runtime value cannot be read statically, and 10 UI-kit components take
      // an optional test-id prop. Rejecting an unknown id would fail correct implementations;
      // recording the flag lets a caller warn without blocking.
      return { locator: { kind: "testid", name: value, known: isKnownSelector(value), ...(nth !== undefined ? { nth } : {}) } };
    case "css":
      return { locator: { kind: "css", selector: value, ...(nth !== undefined ? { nth } : {}) } };
    default:
      return { error: `unhandled locator key '${key}'` };
  }
}

// ---------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------

export type UiWaitUntil =
  | { readonly kind: "networkidle" }
  | { readonly kind: "ms"; readonly ms: number }
  | { readonly kind: "state"; readonly locator: UiLocator; readonly state: "visible" | "hidden" }
  | { readonly kind: "count"; readonly locator: UiLocator; readonly op: CompareOp; readonly n: number };

export type UiAction = "click" | "fill" | "select" | "hover" | "check" | "uncheck";

/** The generators `[SETUP]` may call. Closed, and every one exists in `scripts/lib/random-data.ts`. */
const SETUP_GENERATORS = new Set([
  "uniqueEmail", "uniqueOrgName", "uniqueSku", "randomQty", "randomComment",
  "randomPersonName", "randomUsPhone", "randomUsZip", "randomAddressLine1",
]);

export type UiStep =
  | { readonly tag: "NAV"; readonly url: string; readonly raw: string }
  | { readonly tag: "WAIT"; readonly until: UiWaitUntil; readonly raw: string }
  | { readonly tag: "ACT"; readonly action: UiAction; readonly locator: UiLocator; readonly value?: string; readonly raw: string }
  | { readonly tag: "KEY"; readonly key: string; readonly raw: string }
  | { readonly tag: "SETUP"; readonly variable: string; readonly generator: string; readonly args: readonly string[]; readonly raw: string }
  | { readonly tag: "PRE"; readonly primitive: string; readonly arg?: string; readonly raw: string }
  | { readonly tag: "NOTE"; readonly text: string; readonly raw: string }
  | { readonly tag: "ASSERT"; readonly assertion: UiAssertion; readonly raw: string }
  /**
   * A GraphQL/REST step inside a UI case, DELEGATED to `graphql-case-parser.ts` rather than
   * re-implemented here.
   *
   * This is the load-bearing idea of the whole design, not a convenience: state setup and state
   * verification go through xAPI, not through the DOM. "Product is in the cart", "the order
   * exists", "the membership is there" are GraphQL queries the existing executor already runs,
   * and `[GQL-CAPTURE]` feeds `{{VAR}}` into the DOM assertions that follow. That is what makes a
   * UI case deterministic without inventing a DOM oracle for application state.
   *
   * The parser deliberately does NOT type the operand: a second implementation of the GraphQL
   * grammar is exactly the divergence this module's header argues against. It records the line
   * and the caller hands it to `parseSteps`/`validateStepBlocks`.
   */
  | { readonly tag: "GQL"; readonly raw: string }
  | { readonly tag: "UNKNOWN"; readonly raw: string; readonly reason: string };

/** Keys Playwright accepts by name. Closed — a typo here is a step that silently does nothing. */
const KEYS = new Set([
  "Enter", "Escape", "Tab", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft",
  "ArrowRight", "Home", "End", "PageUp", "PageDown", "Space",
]);

const TAG_RE = /^\[([A-Z][A-Z0-9_:-]*)\]\s*(.*)$/;

function unknown(raw: string, reason: string): Extract<UiStep, { tag: "UNKNOWN" }> {
  return { tag: "UNKNOWN", raw, reason };
}

/**
 * `[NAV]` operand. Accepts an interpolated env URL or an absolute path; rejects prose.
 *
 * Measured: 43 `[NAV]` lines in 042 carry no quoted operand, but most are already
 * `{{FRONT_URL}}/path`, which is exactly the compilable form — the "0% quoted" figure was
 * measuring the wrong thing. Three of them are prose that drifted into the Assertions column
 * ("hero CTA navigates to a category or catalog page (not 404)"); those are assertions, and
 * this rejects them here so the drift is visible instead of executed.
 */
function parseNav(operand: string, raw: string): UiStep {
  const url = operand.trim();
  if (!url) return unknown(raw, "[NAV] has no operand");
  if (/\s/.test(url)) return unknown(raw, `[NAV] operand looks like prose, not a URL: '${url}'`);
  if (!/^(\{\{[A-Z0-9_]+\}\}|https?:\/\/|\/)/.test(url)) {
    return unknown(raw, `[NAV] operand must start with {{VAR}}, http(s):// or / — got '${url}'`);
  }
  return { tag: "NAV", url, raw };
}

function parseWait(operand: string, raw: string): UiStep {
  const t = operand.trim();
  if (!t) return unknown(raw, "[WAIT] has no operand");

  if (t === "networkidle") return { tag: "WAIT", until: { kind: "networkidle" }, raw };

  const ms = /^(\d+)\s*ms$/.exec(t);
  if (ms) return { tag: "WAIT", until: { kind: "ms", ms: Number(ms[1]) }, raw };

  // `<locator> visible|hidden`
  const state = /^(.*?)\s+(visible|hidden)$/.exec(t);
  if (state) {
    const { locator, error } = parseLocator(state[1]);
    if (!locator) return unknown(raw, `[WAIT] ${error}`);
    return { tag: "WAIT", until: { kind: "state", locator, state: state[2] as "visible" | "hidden" }, raw };
  }

  // `<locator> count <op> <n>`
  const count = /^(.*?)\s+count\s+(==|!=|>=|<=|>|<)\s*(\d+)$/.exec(t);
  if (count) {
    const { locator, error } = parseLocator(count[1]);
    if (!locator) return unknown(raw, `[WAIT] ${error}`);
    return { tag: "WAIT", until: { kind: "count", locator, op: count[2] as CompareOp, n: Number(count[3]) }, raw };
  }

  return unknown(raw, `[WAIT] operand is not one of: networkidle | <n>ms | <locator> visible|hidden | <locator> count <op> <n> — got '${t}'`);
}

/**
 * `[ACT]` operand: `<verb> <locator>` and, for `fill`/`select`, `= <value>`.
 *
 * The verb comes first because the action decides whether a value is required at all — and a
 * `fill` with no value is a step that types nothing while looking like it typed something.
 */
function parseAct(operand: string, raw: string): UiStep {
  const t = operand.trim();
  const verbMatch = /^([a-z]+)\s+(.*)$/.exec(t);
  if (!verbMatch) return unknown(raw, `[ACT] expected '<verb> <locator>', got '${t}'`);
  const verb = verbMatch[1];
  if (!["click", "fill", "select", "hover", "check", "uncheck"].includes(verb)) {
    return unknown(raw, `[ACT] unknown verb '${verb}' — expected click|fill|select|hover|check|uncheck`);
  }
  const action = verb as UiAction;
  let rest = verbMatch[2];

  let value: string | undefined;
  // Split on the LAST top-level ` = `, so a locator containing '=' (every locator does) survives.
  const eq = rest.lastIndexOf(" = ");
  if (eq > 0) {
    value = rest.slice(eq + 3).trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
    rest = rest.slice(0, eq);
  }

  const needsValue = action === "fill" || action === "select";
  if (needsValue && value === undefined) return unknown(raw, `[ACT] '${action}' requires " = <value>"`);
  if (!needsValue && value !== undefined) return unknown(raw, `[ACT] '${action}' takes no value, but " = ${value}" was given`);

  const { locator, error } = parseLocator(rest);
  if (!locator) return unknown(raw, `[ACT] ${error}`);
  return { tag: "ACT", action, locator, ...(value !== undefined ? { value } : {}), raw };
}

function parseKey(operand: string, raw: string): UiStep {
  const k = operand.trim();
  if (!KEYS.has(k)) return unknown(raw, `[KEY] '${k}' is not in the accepted key set`);
  return { tag: "KEY", key: k, raw };
}

/**
 * `[SETUP] <var> = <generator>(<args>)`.
 *
 * Bound to `scripts/lib/random-data.ts` by name so a spec cannot ask for a generator that does
 * not exist. 042's current form is prose ("generate unique email: AGENT-TEST-smk002-{unix_ms}@…"),
 * which is exactly what has to be authored away — the prefix convention lives in the generator's
 * own default, not restated per case.
 */
function parseSetup(operand: string, raw: string): UiStep {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/.exec(operand.trim());
  if (!m) return unknown(raw, `[SETUP] expected '<var> = <generator>(<args>)', got '${operand.trim()}'`);
  const [, variable, generator, argsRaw] = m;
  if (!SETUP_GENERATORS.has(generator)) {
    return unknown(raw, `[SETUP] unknown generator '${generator}' — must be exported by scripts/lib/random-data.ts`);
  }
  const args = argsRaw.trim()
    ? argsRaw.split(",").map((a) => a.trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1"))
    : [];
  return { tag: "SETUP", variable, generator, args, raw };
}

/**
 * `[PRE:NAME]` or `[PRE:NAME:ARG]`.
 *
 * The vocabulary is imported from `lint-test-cases.ts`, never restated. A second copy of a
 * closed vocabulary is how a linter and a parser come to disagree about the same file — and
 * `PRE-001` already fires on suite 083b for exactly the primitives that do not exist.
 */
type PreStep = Extract<UiStep, { tag: "PRE" }>;
type UnknownStep = Extract<UiStep, { tag: "UNKNOWN" }>;

function parsePre(tag: string, raw: string): PreStep | UnknownStep {
  const parts = tag.split(":");
  if (parts.length < 2 || parts.length > 3) return unknown(raw, `[${tag}] malformed — expected PRE:NAME or PRE:NAME:ARG`);
  const name = parts[1];
  if (!PRE_PRIMITIVES.has(name)) {
    return unknown(raw, `[${tag}] '${name}' is not a declared preflight primitive (see test-execution-preflight.md)`);
  }
  return { tag: "PRE", primitive: name, ...(parts[2] ? { arg: parts[2] } : {}), raw };
}

/** Parse one Steps line. Exported so a caller can report per-line, not just per-cell. */
export function parseUiStepLine(line: string): UiStep {
  const raw = line.trim();
  const m = TAG_RE.exec(raw);
  if (!m) return unknown(raw, "line carries no [TAG]");
  const [, tag, operand] = m;

  if (tag.startsWith("PRE:") || tag === "PRE") return parsePre(tag, raw);

  switch (tag) {
    case "NAV": return parseNav(operand, raw);
    case "WAIT": return parseWait(operand, raw);
    case "ACT": return parseAct(operand, raw);
    case "KEY": return parseKey(operand, raw);
    case "SETUP": return parseSetup(operand, raw);
    // A comment. It carries authoring guidance for a human reviewer and NO expectation, so it
    // neither blocks compilation nor contributes anything to execute. It is deliberately not a
    // way to smuggle in an unexecuted requirement: a NOTE that states an expectation is a
    // review finding, which no parser can catch.
    case "NOTE": return { tag: "NOTE", text: operand.trim(), raw };
    case "ASSERT": {
      const a = parseUiAssertionLine(operand.trim().startsWith("[") ? operand.trim() : `[DOM] ${operand.trim()}`);
      if (a.tag === "UNKNOWN") return unknown(raw, `[ASSERT] ${a.reason}`);
      return { tag: "ASSERT", assertion: a, raw };
    }
    default:
      return unknown(raw, `unknown step tag [${tag}] — not in the v1 UI grammar`);
  }
}

/**
 * Start of a delegated GraphQL/REST block.
 *
 * Deliberately a SEPARATE pattern from `TAG_RE`, because the two grammars bracket differently:
 * the UI grammar puts its operand after the bracket (`[NAV] /cart`) while the GraphQL grammar puts
 * a label INSIDE it (`[GQL-OP cart]`). A single regex covering both would have to accept a space
 * inside every tag, which would make `[ACT click]` look like a valid tag.
 */
const GQL_BLOCK_RE = /^\[((?:GQL|REST)[A-Z-]*)(?:\s+[^\]]*)?\]/;

/** Does this line open some tagged construct — either grammar's? */
function isTaggedLine(line: string): boolean {
  return TAG_RE.test(line) || GQL_BLOCK_RE.test(line);
}

/**
 * Parse a whole `Steps` cell.
 *
 * This is block-aware rather than purely line-by-line, for one reason: the GraphQL grammar is
 * MULTI-LINE. `[GQL-OP cart]` is followed by the query body on continuation lines that carry no
 * tag of their own, and a line-based pass reads each of those as untagged prose. So a GQL block
 * absorbs the untagged lines that follow it, and the whole thing travels to the GraphQL parser as
 * one delegated step. Getting this wrong is not cosmetic — it would reject exactly the shape the
 * design depends on (state setup through xAPI, verification through the DOM).
 */
export function parseUiSteps(cell: string): UiStep[] {
  const lines = (cell ?? "").split(/\r?\n/);
  const steps: UiStep[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    if (GQL_BLOCK_RE.test(line)) {
      const block = [lines[i]];
      i++;
      while (i < lines.length && lines[i].trim() && !isTaggedLine(lines[i].trim())) {
        block.push(lines[i]);
        i++;
      }
      steps.push({ tag: "GQL", raw: block.join("\n") });
      continue;
    }
    steps.push(parseUiStepLine(line));
    i++;
  }
  return steps;
}

/** Tags that drive a browser. Family membership is decided by these, and only by these. */
const UI_DRIVER_TAGS = new Set(["NAV", "ACT", "KEY"]);

/**
 * A step that drives the browser, i.e. one whose operand ALSO parsed.
 *
 * A `[GQL]` step is deliberately not a driver: a case whose only actions are GraphQL belongs to
 * the GraphQL family and its existing runner, not to a browser.
 */
export function isUiDriver(step: UiStep): boolean {
  return UI_DRIVER_TAGS.has(step.tag);
}

/**
 * Does this cell CLAIM to drive a browser — judged by the tag alone, before any operand is parsed?
 *
 * This is the family question, and it must be answered from the tag, never from whether the
 * operand compiled. Using `isUiDriver` for it made family membership depend on AUTHORING QUALITY:
 * `[ACT] complete the card form per SMK-014` is prose, so it parses to UNKNOWN, so the case had no
 * driver, so it fell through to the GraphQL family and was reported with GraphQL blocker codes.
 * Measured on 042: SMK-013/014/015/034 were misfiled exactly that way — four of the suite's most
 * important cases (checkout, payment ×2, GA4), and the ones most in need of authoring were the
 * ones the backlog counted in the wrong column.
 *
 * The rule is therefore: the tag decides the family, the operand decides whether it compiles.
 */
export function hasUiDriverTag(cell: string): boolean {
  for (const line of (cell ?? "").split(/\r?\n/)) {
    const m = TAG_RE.exec(line.trim());
    if (m && UI_DRIVER_TAGS.has(m[1])) return true;
  }
  return false;
}

/**
 * Structural problems that make the step list unrunnable even though each line parsed.
 * Mirrors `validateStepBlocks`'s role for the GraphQL grammar.
 */
export function validateUiSteps(steps: readonly UiStep[]): string[] {
  const errors: string[] = [];
  for (const s of steps) if (s.tag === "UNKNOWN") errors.push(s.reason);

  const actionable = steps.filter(isUiDriver);
  if (actionable.length === 0) {
    // A case whose steps only wait and assert never drives the app; whatever it observes is
    // whatever the previous case left behind. That is the hidden-coupling class, so it is an
    // error rather than a warning.
    errors.push("no [NAV], [ACT] or [KEY] step — nothing drives the page");
  }

  const first = steps.find((s) => s.tag !== "PRE" && s.tag !== "NOTE" && s.tag !== "SETUP" && s.tag !== "GQL");
  if (first && first.tag !== "NAV") {
    errors.push(`first executable step is [${first.tag}], but a UI case must open a page with [NAV] first`);
  }

  const declared = new Set(steps.filter((s): s is Extract<UiStep, { tag: "SETUP" }> => s.tag === "SETUP").map((s) => s.variable));
  for (const s of steps) {
    for (const ref of s.raw.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)) {
      const name = ref[1];
      // {{UPPER_CASE}} is an env var resolved by config.js; a lower/mixed-case token is a
      // run-scoped variable, and referencing one no [SETUP] declared is a silent empty string.
      if (name !== name.toUpperCase() && !declared.has(name)) {
        errors.push(`{{${name}}} is used but no [SETUP] declares it`);
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------------------------

export type CompareOp = "==" | "!=" | ">=" | "<=" | ">" | "<";

export type DomPredicate =
  | { readonly kind: "visible" }
  | { readonly kind: "hidden" }
  | { readonly kind: "enabled" }
  | { readonly kind: "disabled" }
  | { readonly kind: "count"; readonly op: CompareOp; readonly n: number }
  | { readonly kind: "text-eq"; readonly value: string }
  | { readonly kind: "text-contains"; readonly value: string }
  | { readonly kind: "text-matches"; readonly pattern: string; readonly flags: string }
  | { readonly kind: "attr-eq"; readonly attr: string; readonly value: string };

export type UiAssertion =
  | { readonly tag: "DOM"; readonly locator: UiLocator; readonly predicate: DomPredicate; readonly raw: string }
  | { readonly tag: "NAV"; readonly predicate: { readonly kind: "url-eq"; readonly path: string } | { readonly kind: "url-matches"; readonly pattern: string; readonly flags: string }; readonly raw: string }
  // Delegated: `[STATE]` is a data claim, and the GraphQL predicate scorer already owns that
  // vocabulary. The runner hands `expr` to `parseAssertions`/`evaluateAssertion` rather than
  // this module growing a second predicate language.
  | { readonly tag: "STATE"; readonly expr: string; readonly raw: string }
  | { readonly tag: "MATH"; readonly left: NumExtract; readonly op: CompareOp; readonly right: readonly NumTerm[]; readonly raw: string }
  | { readonly tag: "FORMAT"; readonly source: NumExtract; readonly pattern: string; readonly flags: string; readonly raw: string }
  | { readonly tag: "UNKNOWN"; readonly raw: string; readonly reason: string };

/** `num(<locator>)` — read a number out of the rendered text of an element. */
export interface NumExtract {
  readonly kind: "num";
  readonly locator: UiLocator;
}

export type NumTerm =
  | { readonly kind: "extract"; readonly extract: NumExtract; readonly operator: "+" | "-" | "*" | "/" | null }
  | { readonly kind: "literal"; readonly value: number; readonly operator: "+" | "-" | "*" | "/" | null };

function unknownAssertion(raw: string, reason: string): UiAssertion {
  return { tag: "UNKNOWN", raw, reason };
}

const RE_LITERAL = /^\/(.*)\/([gimsuy]*)$/;

function parseRegex(text: string, raw: string): { pattern: string; flags: string } | { error: string } {
  const m = RE_LITERAL.exec(text.trim());
  if (!m) return { error: `expected a /regex/ literal, got '${text.trim()}'` };
  try {
    new RegExp(m[1], m[2]);
  } catch (e) {
    return { error: `invalid regex /${m[1]}/${m[2]}: ${(e as Error).message}` };
  }
  return { pattern: m[1], flags: m[2] };
}

function parseNumExtract(text: string): { extract?: NumExtract; error?: string } {
  const m = /^num\s*\(\s*(.*?)\s*\)$/.exec(text.trim());
  if (!m) return { error: `expected num(<locator>), got '${text.trim()}'` };
  const { locator, error } = parseLocator(m[1]);
  if (!locator) return { error };
  return { extract: { kind: "num", locator } };
}

function parseDom(operand: string, raw: string): UiAssertion {
  const t = operand.trim();
  if (!t) return unknownAssertion(raw, "[DOM] has no operand");

  const attr = /^(.*?)\s+attr\[([A-Za-z_:.-]+)\]\s*==\s*(?:'([^']*)'|"([^"]*)")$/.exec(t);
  if (attr) {
    const { locator, error } = parseLocator(attr[1]);
    if (!locator) return unknownAssertion(raw, `[DOM] ${error}`);
    return { tag: "DOM", locator, predicate: { kind: "attr-eq", attr: attr[2], value: attr[3] ?? attr[4] ?? "" }, raw };
  }

  const count = /^(.*?)\s+count\s+(==|!=|>=|<=|>|<)\s*(\d+)$/.exec(t);
  if (count) {
    const { locator, error } = parseLocator(count[1]);
    if (!locator) return unknownAssertion(raw, `[DOM] ${error}`);
    return { tag: "DOM", locator, predicate: { kind: "count", op: count[2] as CompareOp, n: Number(count[3]) }, raw };
  }

  const textMatches = /^(.*?)\s+text\s+matches\s+(.+)$/.exec(t);
  if (textMatches) {
    const { locator, error } = parseLocator(textMatches[1]);
    if (!locator) return unknownAssertion(raw, `[DOM] ${error}`);
    const re = parseRegex(textMatches[2], raw);
    if ("error" in re) return unknownAssertion(raw, `[DOM] ${re.error}`);
    return { tag: "DOM", locator, predicate: { kind: "text-matches", pattern: re.pattern, flags: re.flags }, raw };
  }

  const textOp = /^(.*?)\s+text\s+(==|contains)\s+(?:'([^']*)'|"([^"]*)")$/.exec(t);
  if (textOp) {
    const { locator, error } = parseLocator(textOp[1]);
    if (!locator) return unknownAssertion(raw, `[DOM] ${error}`);
    const value = textOp[3] ?? textOp[4] ?? "";
    return {
      tag: "DOM", locator,
      predicate: textOp[2] === "==" ? { kind: "text-eq", value } : { kind: "text-contains", value },
      raw,
    };
  }

  const state = /^(.*?)\s+(visible|hidden|enabled|disabled)$/.exec(t);
  if (state) {
    const { locator, error } = parseLocator(state[1]);
    if (!locator) return unknownAssertion(raw, `[DOM] ${error}`);
    return { tag: "DOM", locator, predicate: { kind: state[2] as DomPredicate["kind"] } as DomPredicate, raw };
  }

  return unknownAssertion(
    raw,
    `[DOM] predicate not recognised — expected visible|hidden|enabled|disabled, count <op> <n>, text ==|contains '…', text matches /re/, or attr[x] == '…'`,
  );
}

function parseNavAssertion(operand: string, raw: string): UiAssertion {
  const t = operand.trim();
  const matches = /^url\s+matches\s+(.+)$/.exec(t);
  if (matches) {
    const re = parseRegex(matches[1], raw);
    if ("error" in re) return unknownAssertion(raw, `[NAV] ${re.error}`);
    return { tag: "NAV", predicate: { kind: "url-matches", pattern: re.pattern, flags: re.flags }, raw };
  }
  const eq = /^url\s*==\s*(?:'([^']*)'|"([^"]*)")$/.exec(t);
  if (eq) return { tag: "NAV", predicate: { kind: "url-eq", path: eq[1] ?? eq[2] ?? "" }, raw };
  return unknownAssertion(raw, `[NAV] expected "url == '/path'" or "url matches /re/", got '${t}'`);
}

/**
 * `[MATH] num(<loc>) == num(<loc>) * 2` — arithmetic over numbers read off the page.
 *
 * 042 carries 8 of these and every one is prose today ("line total = unit price × updated
 * quantity"). They are the cases where a wrong number is the bug, so they are worth compiling
 * rather than dropping to a browser agent that eyeballs it.
 */
function parseMath(operand: string, raw: string): UiAssertion {
  const t = operand.trim();
  const split = /^(.*?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(t);
  if (!split) return unknownAssertion(raw, `[MATH] expected '<extract> <op> <expression>', got '${t}'`);
  const left = parseNumExtract(split[1]);
  if (!left.extract) return unknownAssertion(raw, `[MATH] left side: ${left.error}`);

  const terms: NumTerm[] = [];
  // Tokenise the right side into `term (op term)*`. Splitting on the operators rather than
  // building an expression tree keeps precedence out of the grammar entirely — a v1 predicate
  // that needs parentheses is a predicate that should be a unit test, not a UI assertion.
  const tokens = split[3].split(/\s+([+\-*/])\s+/);
  let pendingOp: "+" | "-" | "*" | "/" | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].trim();
    if (i % 2 === 1) {
      pendingOp = tok as "+" | "-" | "*" | "/";
      continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(tok)) {
      terms.push({ kind: "literal", value: Number(tok), operator: pendingOp });
    } else {
      const ex = parseNumExtract(tok);
      if (!ex.extract) return unknownAssertion(raw, `[MATH] term '${tok}': ${ex.error}`);
      terms.push({ kind: "extract", extract: ex.extract, operator: pendingOp });
    }
    pendingOp = null;
  }
  if (terms.length === 0) return unknownAssertion(raw, "[MATH] right side is empty");
  return { tag: "MATH", left: left.extract, op: split[2] as CompareOp, right: terms, raw };
}

function parseFormat(operand: string, raw: string): UiAssertion {
  const m = /^(.*?)\s+matches\s+(.+)$/.exec(operand.trim());
  if (!m) return unknownAssertion(raw, `[FORMAT] expected '<extract> matches /re/', got '${operand.trim()}'`);
  const src = parseNumExtract(m[1]);
  if (!src.extract) return unknownAssertion(raw, `[FORMAT] ${src.error}`);
  const re = parseRegex(m[2], raw);
  if ("error" in re) return unknownAssertion(raw, `[FORMAT] ${re.error}`);
  return { tag: "FORMAT", source: src.extract, pattern: re.pattern, flags: re.flags, raw };
}

export function parseUiAssertionLine(line: string): UiAssertion {
  const raw = line.trim();
  const m = TAG_RE.exec(raw);
  if (!m) return unknownAssertion(raw, "line carries no [TAG]");
  const [, tag, operand] = m;
  switch (tag) {
    case "DOM": return parseDom(operand, raw);
    case "NAV": return parseNavAssertion(operand, raw);
    case "STATE": {
      const expr = operand.trim();
      if (!expr) return unknownAssertion(raw, "[STATE] has no operand");
      return { tag: "STATE", expr, raw };
    }
    case "MATH": return parseMath(operand, raw);
    case "FORMAT": return parseFormat(operand, raw);
    default: return unknownAssertion(raw, `unknown assertion tag [${tag}] — not in the v1 UI grammar`);
  }
}

export function parseUiAssertions(cell: string): UiAssertion[] {
  return (cell ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseUiAssertionLine);
}

/**
 * Can the runner actually score this assertion? Same three-valued vocabulary as
 * `classifyPredicateScoreability`, deliberately, so the two families report alike.
 *
 * `[STATE]` is "delegated": this module cannot answer, and answering anyway — either way —
 * would be a guess. The caller asks the GraphQL scorer.
 */
export type UiScoreability = "scoreable" | "delegated" | "unparseable";

export function classifyUiScoreability(a: UiAssertion): UiScoreability {
  if (a.tag === "UNKNOWN") return "unparseable";
  if (a.tag === "STATE") return "delegated";
  return "scoreable";
}

// ---------------------------------------------------------------------------------------------
// Preconditions and cross-layer checks — recorded, not gating (see the header)
// ---------------------------------------------------------------------------------------------

export interface PreconditionParse {
  readonly primitives: readonly { readonly primitive: string; readonly arg?: string }[];
  /** `[PRE:*]` tags naming something no runner implements. An error, not prose. */
  readonly errors: readonly string[];
  /** Prose lines, counted so a caller can show them without treating them as blockers. */
  readonly proseLines: number;
}

export function parsePreconditions(cell: string): PreconditionParse {
  const primitives: { primitive: string; arg?: string }[] = [];
  const errors: string[] = [];
  let proseLines = 0;
  for (const line of (cell ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = TAG_RE.exec(line);
    if (!m || !(m[1] === "PRE" || m[1].startsWith("PRE:"))) {
      proseLines++;
      continue;
    }
    const parsed = parsePre(m[1], line);
    if (parsed.tag === "PRE") primitives.push({ primitive: parsed.primitive, ...(parsed.arg ? { arg: parsed.arg } : {}) });
    else errors.push(parsed.reason);
  }
  return { primitives, errors, proseLines };
}

/** Cross-layer channels a runner can subscribe to or query with what it already has. */
const SCOREABLE_CROSS_LAYER = new Set(["CONSOLE", "NETWORK", "GQL", "API"]);

export interface CrossLayerParse {
  /** Channels the runner can observe — page events and calls it already makes. */
  readonly scoreable: readonly { readonly channel: string; readonly raw: string }[];
  /**
   * Channels it cannot: `[ADMIN]` needs the AngularJS Admin SPA, a second application with its
   * own selector surface, explicitly out of v1. A runner must report these as `unchecked` on the
   * case result — a case with unchecked items is not a clean PASS.
   */
  readonly unscoreable: readonly { readonly channel: string; readonly raw: string; readonly reason: string }[];
  readonly proseLines: number;
}

export function classifyCrossLayer(cell: string): CrossLayerParse {
  const scoreable: { channel: string; raw: string }[] = [];
  const unscoreable: { channel: string; raw: string; reason: string }[] = [];
  let proseLines = 0;
  for (const line of (cell ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = TAG_RE.exec(line);
    if (!m) {
      proseLines++;
      continue;
    }
    const channel = m[1];
    if (SCOREABLE_CROSS_LAYER.has(channel)) scoreable.push({ channel, raw: line });
    else if (channel === "ADMIN") {
      unscoreable.push({ channel, raw: line, reason: "[ADMIN] targets the Admin SPA, a separate application — out of ui-runner v1" });
    } else {
      unscoreable.push({ channel, raw: line, reason: `[${channel}] is not a channel the UI runner observes` });
    }
  }
  return { scoreable, unscoreable, proseLines };
}
