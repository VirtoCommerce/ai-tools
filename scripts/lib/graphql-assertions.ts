/**
 * Parses and evaluates assertion lines from the Assertions column of a
 * runner-native GraphQL test case. Assertions reference ops by label:
 *
 *   [ERRORS label=valid_name] errors[] empty
 *   [DATA   label=valid_name] data.createOrganization.name = AT&T Corp. #1
 *   [DATA   label=xss_name]   data.createOrganization is null
 *   [DATA   label=valid_name] data.createOrganization.id is non-empty GUID
 *
 * Verdict-affecting kinds: ERRORS, DATA, NULL, COUNT. Any other tag
 * (e.g. [ADMIN], [ROUNDTRIP], [STOREFRONT], [EVENT], [MATH], [EVIDENCE])
 * is captured as an InfoAssertion — runner records them to evidence but
 * does not evaluate them in the GraphQL-only layer. [MATH] is intentionally
 * info-only because authors use it for prose annotation; for verifiable
 * arithmetic on response data use [DATA <path> > N] / [COUNT <path> = N].
 */

import { GraphQLResponse } from "./graphql-executor.js";

export type AssertionKind = "ERRORS" | "DATA" | "NULL" | "COUNT" | "VAR";

export interface Assertion {
  raw: string;
  kind: AssertionKind;
  label: string;
  predicate: string;
}

export interface InfoAssertion {
  raw: string;
  layer: string; // e.g. ADMIN, ROUNDTRIP, STOREFRONT, EVENT
  note: string;
}

export interface AssertionResult {
  raw: string;
  label?: string;
  kind: string;
  passed: boolean;
  expected: string;
  actual: string;
  message?: string;
}

const GQL_KINDS = new Set<AssertionKind>(["ERRORS", "DATA", "NULL", "COUNT", "VAR"]);

/**
 * Parse a multi-line Assertions column into Assertion + InfoAssertion arrays.
 */
export function parseAssertions(text: string): {
  assertions: Assertion[];
  info: InfoAssertion[];
} {
  const assertions: Assertion[] = [];
  const info: InfoAssertion[] = [];

  const tagRegex = /^\[(\w+)(?:\s+label=([\w-]+))?\]\s*(.*)$/;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const m = line.match(tagRegex);
    if (!m) continue; // non-tagged commentary; skip

    const tag = m[1].toUpperCase();
    const label = m[2] || "";
    const predicate = m[3].trim();

    if (GQL_KINDS.has(tag as AssertionKind)) {
      if (!label) {
        assertions.push({
          raw: rawLine,
          kind: tag as AssertionKind,
          label: "_default",
          predicate,
        });
      } else {
        assertions.push({
          raw: rawLine,
          kind: tag as AssertionKind,
          label,
          predicate,
        });
      }
    } else {
      info.push({ raw: rawLine, layer: tag, note: predicate });
    }
  }

  return { assertions, info };
}

/**
 * Evaluate one assertion against its referenced operation response.
 * `responses` maps op-label → GraphQLResponse.
 * `variables` is the runtime variables bag (for `= {{VAR}}` substitution
 * in the predicate, if the caller has not already substituted).
 */
export function evaluateAssertion(
  assertion: Assertion,
  responses: Map<string, GraphQLResponse>,
  variables: Record<string, string>
): AssertionResult {
  const predicate = substituteVars(assertion.predicate, variables);

  // VAR is variable-vs-literal — no response needed, no label binding to enforce.
  if (assertion.kind === "VAR") {
    return evaluateVarPredicate(assertion, predicate);
  }

  const response = responses.get(assertion.label);

  if (!response) {
    return {
      raw: assertion.raw,
      label: assertion.label,
      kind: assertion.kind,
      passed: false,
      expected: `response for label="${assertion.label}"`,
      actual: "no response recorded",
      message: `Assertion references unknown label "${assertion.label}" — no [GQL-EXEC ${assertion.label}] was run`,
    };
  }

  switch (assertion.kind) {
    case "ERRORS":
      return evaluateErrorsPredicate(assertion, response, predicate);
    case "DATA":
      return evaluateDataPredicate(assertion, response, predicate);
    case "NULL":
      return evaluateNullPredicate(assertion, response, predicate);
    case "COUNT":
      return evaluateCountPredicate(assertion, response, predicate);
  }
}

function substituteVars(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : `{{${name}}}`;
  });
}

function evaluateErrorsPredicate(
  a: Assertion,
  r: GraphQLResponse,
  predicate: string
): AssertionResult {
  // HTTP <code> — common shorthand for assertions on REST-EXEC responses,
  // where authors care about the HTTP status code rather than GraphQL errors[].
  const httpMatch = /^HTTP\s+(\d{3})\s*$/i.exec(predicate);
  if (httpMatch) {
    const expected = Number(httpMatch[1]);
    return {
      raw: a.raw,
      label: a.label,
      kind: "ERRORS",
      passed: r.status === expected,
      expected: `HTTP ${expected}`,
      actual: `HTTP ${r.status}`,
    };
  }

  const errorsLen = r.errors?.length ?? 0;
  const isEmpty = errorsLen === 0;
  const wantsEmpty = /\bempty\b/i.test(predicate) && !/non[-\s]?empty/i.test(predicate);
  const wantsNonEmpty = /non[-\s]?empty/i.test(predicate);

  if (wantsEmpty) {
    return {
      raw: a.raw,
      label: a.label,
      kind: "ERRORS",
      passed: isEmpty,
      expected: "errors[] empty",
      actual: isEmpty ? "errors[] empty" : `errors[] has ${errorsLen} entr${errorsLen === 1 ? "y" : "ies"}: ${JSON.stringify(r.errors.slice(0, 2))}`,
    };
  }

  if (wantsNonEmpty) {
    return {
      raw: a.raw,
      label: a.label,
      kind: "ERRORS",
      passed: !isEmpty,
      expected: "errors[] non-empty",
      actual: isEmpty ? "errors[] empty" : `errors[] has ${errorsLen} entr${errorsLen === 1 ? "y" : "ies"}`,
    };
  }

  return {
    raw: a.raw,
    label: a.label,
    kind: "ERRORS",
    passed: false,
    expected: predicate,
    actual: "unrecognized predicate — expected empty|non-empty",
    message: `Could not parse ERRORS predicate: "${predicate}"`,
  };
}

function evaluateDataPredicate(
  a: Assertion,
  r: GraphQLResponse,
  predicateRaw: string
): AssertionResult {
  // Strip a leading `<label>.` prefix from path tokens. Authors of REST-EXEC
  // assertions write `rest_upload.body.[0].url = ...` for readability, but the
  // response is stored under the label and walked from r.data — the label
  // shouldn't be part of the path. Replace `<label>.` only when it appears at
  // the start of a path-like token (preceded by start-of-string, whitespace,
  // or an open paren).
  const predicate =
    a.label && a.label !== "_default"
      ? predicateRaw.replace(
          new RegExp(`(^|[\\s(])${escapeRegex(a.label)}\\.`, "g"),
          "$1"
        )
      : predicateRaw;

  // Composite predicate: "<sub> OR <sub> [OR <sub>]" / "<sub> AND <sub> ..."
  // Case-sensitive uppercase OR/AND with surrounding whitespace, so "OR" inside
  // a literal value won't trigger. Each sub-predicate is evaluated via this
  // function recursively, except sub-predicates starting with `errors[]` which
  // route through evaluateErrorsPredicate. Mixing OR and AND in one line is
  // not supported (split into separate assertion lines instead).
  if (/\s+(OR|AND)\s+/.test(predicate)) {
    const orParts = predicate.split(/\s+OR\s+/);
    const andParts = predicate.split(/\s+AND\s+/);
    const isOr = orParts.length > 1 && andParts.length === 1;
    const isAnd = andParts.length > 1 && orParts.length === 1;
    if (isOr || isAnd) {
      const parts = isOr ? orParts : andParts;
      const subResults = parts.map((sub) => {
        const trimmed = sub.trim();
        if (/^errors\[\]/.test(trimmed)) {
          return evaluateErrorsPredicate(a, r, trimmed);
        }
        return evaluateDataPredicate(a, r, trimmed);
      });
      const passed = isOr
        ? subResults.some((s) => s.passed)
        : subResults.every((s) => s.passed);
      const op = isOr ? "OR" : "AND";
      return {
        raw: a.raw,
        label: a.label,
        kind: "DATA",
        passed,
        expected: predicate,
        actual: subResults
          .map((s, i) => `${i === 0 ? "" : ` ${op} `}[${s.passed ? "✓" : "✗"} ${s.expected}: ${s.actual}]`)
          .join(""),
      };
    }
  }

  // Try patterns in order of specificity:
  // 1. "data is null"
  // 2. "<path> is null" / "<path> is non-null"
  // 3. "<path> is non-empty GUID"
  // 4. "<path> matches /regex/"
  // 5. "<path> = <value>"

  if (/^data\s+is\s+null\b/i.test(predicate)) {
    const isNull = r.data === null || r.data === undefined;
    return {
      raw: a.raw,
      label: a.label,
      kind: "DATA",
      passed: isNull,
      expected: "data is null",
      actual: isNull ? "data is null" : `data is ${jsonSummary(r.data)}`,
    };
  }

  const nullMatch = predicate.match(/^(\S+)\s+is\s+(null|non-null)\b/i);
  if (nullMatch) {
    const [, path, want] = nullMatch;
    const value = getByPath(r.data, path);
    const isNull = value === null || value === undefined;
    const passed = want.toLowerCase() === "null" ? isNull : !isNull;
    return {
      raw: a.raw,
      label: a.label,
      kind: "DATA",
      passed,
      expected: `${path} is ${want}`,
      actual: isNull ? `${path} is null` : `${path} = ${jsonSummary(value)}`,
    };
  }

  const guidMatch = predicate.match(/^(\S+)\s+is\s+non-empty\s+GUID\b/i);
  if (guidMatch) {
    const [, path] = guidMatch;
    const value = getByPath(r.data, path);
    const str = typeof value === "string" ? value : "";
    const guidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const passed = guidRe.test(str);
    return {
      raw: a.raw,
      label: a.label,
      kind: "DATA",
      passed,
      expected: `${path} is non-empty GUID`,
      actual: `${path} = ${jsonSummary(value)}`,
    };
  }

  const regexMatch = predicate.match(/^(\S+)\s+matches\s+\/(.+)\/([gimsu]*)$/);
  if (regexMatch) {
    const [, path, pattern, flags] = regexMatch;
    const value = getByPath(r.data, path);
    const str = typeof value === "string" ? value : String(value);
    let passed = false;
    try {
      passed = new RegExp(pattern, flags).test(str);
    } catch {
      return {
        raw: a.raw,
        label: a.label,
        kind: "DATA",
        passed: false,
        expected: `${path} matches /${pattern}/`,
        actual: `invalid regex`,
      };
    }
    return {
      raw: a.raw,
      label: a.label,
      kind: "DATA",
      passed,
      expected: `${path} matches /${pattern}/${flags}`,
      actual: `${path} = ${jsonSummary(value)}`,
    };
  }

  const numericMatch = predicate.match(/^(\S+)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (numericMatch) {
    const [, path, op, nStr] = numericMatch;
    const value = getByPath(r.data, path);
    const n = Number(nStr);
    const actualNum = typeof value === "number" ? value : Number(value);
    let passed = false;
    if (Number.isFinite(actualNum)) {
      switch (op) {
        case ">": passed = actualNum > n; break;
        case ">=": passed = actualNum >= n; break;
        case "<": passed = actualNum < n; break;
        case "<=": passed = actualNum <= n; break;
      }
    }
    return {
      raw: a.raw,
      label: a.label,
      kind: "DATA",
      passed,
      expected: `${path} ${op} ${n}`,
      actual: Number.isFinite(actualNum)
        ? `${path} = ${actualNum}`
        : `${path} = ${jsonSummary(value)} (not numeric)`,
    };
  }

  // Arithmetic / cross-path predicates: when the RHS (or LHS) contains
  // arithmetic operators AND at least one `data.` path token, evaluate
  // both sides as numeric expressions. Supports + - * /, parentheses,
  // and exact (=) or approximate (≈ / ~=) comparison.
  // Examples (drawn from CFG-GQL-023..028):
  //   data.x.extendedPrice.amount = data.x.listPrice.amount * data.x.quantity
  //   (1111 - data.x.subTotal.amount) ≈ 100
  //   data.x.total = data.x.subtotal + data.x.tax - data.x.discount
  const arithMatch = predicate.match(/^(.+?)\s*(=|≈|~=)\s*(.+)$/);
  if (arithMatch) {
    const [, lhsRaw, op, rhsRaw] = arithMatch;
    // Strip filter-bracket bodies so hyphens in GUIDs (e.g. `[?id=37e4-…]`)
    // and `*` in `[*?key=value]` aren't mistaken for arithmetic operators.
    const stripBrackets = (s: string) => s.replace(/\[[^\]]*\]/g, "");
    const lhsClean = stripBrackets(lhsRaw);
    const rhsClean = stripBrackets(rhsRaw);
    // Trigger arithmetic on unambiguous operators (`*`, `/`, parens) OR
    // a whitespace-padded `+`/`-` (so `data.X = -100` and hyphenated literals
    // still hit the simple `=` branch).
    const combined = lhsClean + " " + rhsClean;
    const hasArith = /[*/()]/.test(combined) || /\s[+\-]\s/.test(combined);
    const lhsHasPath = /(?:^|[^\w])data\.\w/.test(lhsClean);
    const rhsHasPath = /(?:^|[^\w])data\.\w/.test(rhsClean);
    // Take the numeric/expression branch when EITHER:
    //   (a) there's an arithmetic operator + at least one path  (a = b * c)
    //   (b) both sides are paths (cross-path comparison, no operators: a = b)
    //   (c) approximate operator (≈/~=) is used (always numeric intent)
    const hasPath = lhsHasPath || rhsHasPath;
    const isCrossPath = lhsHasPath && rhsHasPath;
    const isApprox = op === "≈" || op === "~=";
    const takeArithBranch = (hasArith && hasPath) || isCrossPath || isApprox;
    if (takeArithBranch) {
      const lv = evaluateNumericExpression(lhsRaw, r);
      const rv = evaluateNumericExpression(rhsRaw, r);
      const TOLERANCE = 0.011; // cents-level rounding wiggle for ≈
      let passed = false;
      if (typeof lv === "number" && typeof rv === "number" && Number.isFinite(lv) && Number.isFinite(rv)) {
        passed = op === "=" ? lv === rv : Math.abs(lv - rv) <= TOLERANCE;
      }
      return {
        raw: a.raw,
        label: a.label,
        kind: "DATA",
        passed,
        expected: `${lhsRaw.trim()} ${op} ${rhsRaw.trim()}`,
        actual:
          typeof lv === "number" && typeof rv === "number"
            ? `lhs=${lv} rhs=${rv}`
            : `lhs=${lv === undefined ? "?" : lv} rhs=${rv === undefined ? "?" : rv}`,
      };
    }
  }

  const equalsMatch = predicate.match(/^(\S+)\s*=\s*(.+)$/);
  if (equalsMatch) {
    const [, path, rawExpected] = equalsMatch;
    const expectedStr = rawExpected.trim().replace(/^"|"$/g, "");
    const value = getByPath(r.data, path);
    const actualStr = typeof value === "string" ? value : JSON.stringify(value);
    const passed = actualStr === expectedStr;
    return {
      raw: a.raw,
      label: a.label,
      kind: "DATA",
      passed,
      expected: `${path} = ${expectedStr}`,
      actual: `${path} = ${actualStr}`,
    };
  }

  return {
    raw: a.raw,
    label: a.label,
    kind: "DATA",
    passed: false,
    expected: predicate,
    actual: "unrecognized DATA predicate",
    message: `Could not parse: "${predicate}"`,
  };
}

function evaluateVarPredicate(
  a: Assertion,
  predicate: string
): AssertionResult {
  // [VAR] <substituted-value> = <expected>
  // Author writes `{{X}} = Text` and the runner has already substituted
  // `{{X}}` upstream (substituteVars in evaluateAssertion). At this point
  // the predicate is e.g. "Text = Text" or "Product = Text". A simple
  // string equality compare on the trimmed sides covers the existing use.
  const m = predicate.match(/^(.+?)\s*=\s*(.+)$/);
  if (!m) {
    return {
      raw: a.raw,
      label: a.label,
      kind: "VAR",
      passed: false,
      expected: predicate,
      actual: "unrecognized VAR predicate (expected `<substituted-var> = <literal>`)",
    };
  }
  const [, lhs, rhs] = m;
  const lhsClean = lhs.trim().replace(/^"(.*)"$/, "$1");
  const rhsClean = rhs.trim().replace(/^"(.*)"$/, "$1");
  // If the LHS still contains an unsubstituted `{{NAME}}`, the variable
  // wasn't captured upstream — flag explicitly.
  const unsubstituted = lhsClean.match(/\{\{(\w+)\}\}/);
  if (unsubstituted) {
    return {
      raw: a.raw,
      label: a.label,
      kind: "VAR",
      passed: false,
      expected: `${lhsClean} = ${rhsClean}`,
      actual: `variable {{${unsubstituted[1]}}} was never captured (still literal)`,
    };
  }
  return {
    raw: a.raw,
    label: a.label,
    kind: "VAR",
    passed: lhsClean === rhsClean,
    expected: `${lhsClean} = ${rhsClean}`,
    actual: `${lhsClean} = ${rhsClean}`,
  };
}

function evaluateNullPredicate(
  a: Assertion,
  r: GraphQLResponse,
  predicate: string
): AssertionResult {
  const m = predicate.match(/^(\S+)/);
  if (!m) {
    return {
      raw: a.raw,
      label: a.label,
      kind: "NULL",
      passed: false,
      expected: predicate,
      actual: "missing path",
    };
  }
  const path = m[1];
  const value = getByPath(r.data, path);
  const isNull = value === null || value === undefined;
  return {
    raw: a.raw,
    label: a.label,
    kind: "NULL",
    passed: isNull,
    expected: `${path} is null`,
    actual: isNull ? "null" : jsonSummary(value),
  };
}

function evaluateCountPredicate(
  a: Assertion,
  r: GraphQLResponse,
  predicate: string
): AssertionResult {
  const m = predicate.match(/^(\S+)\s*(=|==|>=|<=|>|<)\s*(\d+)/);
  if (!m) {
    return {
      raw: a.raw,
      label: a.label,
      kind: "COUNT",
      passed: false,
      expected: predicate,
      actual: "unrecognized COUNT predicate",
    };
  }
  const [, path, op, nStr] = m;
  const value = getByPath(r.data, path);
  const n = Number(nStr);
  const actual = typeof value === "number" ? value : Array.isArray(value) ? value.length : NaN;
  let passed = false;
  switch (op) {
    case "=":
    case "==":
      passed = actual === n;
      break;
    case ">=":
      passed = actual >= n;
      break;
    case "<=":
      passed = actual <= n;
      break;
    case ">":
      passed = actual > n;
      break;
    case "<":
      passed = actual < n;
      break;
  }
  return {
    raw: a.raw,
    label: a.label,
    kind: "COUNT",
    passed,
    expected: `${path} ${op} ${n}`,
    actual: `${path} = ${actual}`,
  };
}

export function getByPath(obj: unknown, path: string): unknown {
  // Accept both the natural "data.foo.bar" (author-facing) and the
  // internal shape where `obj` is already `response.data`. Strip a leading
  // "data." if present so authors don't have to remember the distinction.
  //
  // Path segments support:
  //   - object property: `foo`
  //   - numeric array index: `0`
  //   - JSONPath-style filter: `foo[?key=value]` selects the first array
  //     element of `foo` where element.key === value. Insulates assertions
  //     from backend response-shape ordering shifts. Variables in the value
  //     position should be substituted (via {{VAR}}) before the path
  //     reaches getByPath.
  const normalized = path.startsWith("data.") ? path.slice(5) : path === "data" ? "" : path;
  const parts = normalized ? normalized.split(".") : [];
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;

    // Filter syntax:
    //   foo[?key=value]    → FIRST element of foo[] where item.key === value
    //   foo[?key!=value]   → FIRST element of foo[] where item.key !== value
    //   foo[*?key=value]   → ARRAY of ALL elements where item.key === value
    //   foo[*?key!=value]  → ARRAY of ALL elements where item.key !== value
    //                       (chain .0 / .1 / .length on filtered result)
    const filterMatch = p.match(/^(\w+)?\[(\*)?\?(\w+)(!?=)([^\]]+)\]$/);
    if (filterMatch) {
      const [, propName, allFlag, key, op, val] = filterMatch;
      let target: unknown = cur;
      if (propName) {
        if (typeof cur !== "object" || cur === null) return undefined;
        target = (cur as Record<string, unknown>)[propName];
      }
      if (!Array.isArray(target)) return undefined;
      const matches = (target as unknown[]).filter((item) => {
        if (item === null || typeof item !== "object") return false;
        const actual = String((item as Record<string, unknown>)[key]);
        return op === "=" ? actual === val : actual !== val;
      });
      cur = allFlag ? matches : matches[0];
      continue;
    }

    // Bracketed array index: "[0]" / "[12]" — common in REST-CAPTURE paths
    // like rest_upload.body.[0].url. Treat the same as a bare numeric.
    const bracketIdx = p.match(/^\[(\d+)\]$/);
    if (bracketIdx && Array.isArray(cur)) {
      cur = (cur as unknown[])[Number(bracketIdx[1])];
    } else if (/^\d+$/.test(p) && Array.isArray(cur)) {
      cur = cur[Number(p)];
    } else if (typeof cur === "object" && cur !== null) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Evaluate a numeric expression that may contain `data.x.y.z` path references,
 * numeric literals, and the operators + - * / with parentheses. Returns
 * undefined if any path doesn't resolve to a number or the expression contains
 * disallowed characters (defense against test-author typos, not malicious input
 * — these CSVs live in the same repo).
 */
function evaluateNumericExpression(
  expr: string,
  r: GraphQLResponse
): number | undefined {
  // Replace each `data.<path-tokens>` reference with its numeric value.
  // A segment is either `field`, `field[<filter>]`, or `<digits>`. Filter
  // bodies are matched permissively (anything except `]`) so GUIDs with
  // hyphens, `*?`, `?key=value` etc. all work.
  const PATH_RE = /data(?:\.(?:[A-Za-z_]\w*(?:\[[^\]]+\])?|\d+))+/g;
  const replaced = expr.replace(PATH_RE, (match) => {
    const value = getByPath(r.data, match);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) {
      return value;
    }
    return "NaN";
  });
  // Reject anything other than digits, decimals, operators, parens, whitespace.
  // (Keep the validation tight so a stray identifier doesn't silently coerce.)
  if (!/^[\d.+\-*/()\s]+$/.test(replaced)) return undefined;
  if (/NaN/.test(replaced)) return undefined;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${replaced});`)() as unknown;
    return typeof result === "number" && Number.isFinite(result) ? result : undefined;
  } catch {
    return undefined;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsonSummary(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  } catch {
    return String(v);
  }
}
