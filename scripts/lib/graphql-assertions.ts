/**
 * Parses and evaluates assertion lines from the Assertions column of a
 * runner-native GraphQL test case. Assertions reference ops by label:
 *
 *   [ERRORS label=valid_name] errors[] empty
 *   [DATA   label=valid_name] data.createOrganization.name = AT&T Corp. #1
 *   [DATA   label=xss_name]   data.createOrganization is null
 *   [DATA   label=valid_name] data.createOrganization.id is non-empty GUID
 *
 * Lines outside the {ERRORS, DATA, NULL, COUNT, MATH} set are ignored
 * as commentary. Lines that belong to other layers (e.g. [ADMIN], [ROUNDTRIP])
 * are returned as InfoAssertions — runner records them to evidence but
 * does not evaluate them in the GraphQL-only layer.
 */

import { GraphQLResponse } from "./graphql-executor.js";

export type AssertionKind = "ERRORS" | "DATA" | "NULL" | "COUNT" | "MATH";

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

const GQL_KINDS = new Set<AssertionKind>(["ERRORS", "DATA", "NULL", "COUNT", "MATH"]);

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

  const predicate = substituteVars(assertion.predicate, variables);

  switch (assertion.kind) {
    case "ERRORS":
      return evaluateErrorsPredicate(assertion, response, predicate);
    case "DATA":
      return evaluateDataPredicate(assertion, response, predicate);
    case "NULL":
      return evaluateNullPredicate(assertion, response, predicate);
    case "COUNT":
      return evaluateCountPredicate(assertion, response, predicate);
    case "MATH":
      return {
        raw: assertion.raw,
        label: assertion.label,
        kind: "MATH",
        passed: false,
        expected: predicate,
        actual: "MATH evaluation not implemented in MVP",
        message: "MATH assertions pending runner v2",
      };
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
  predicate: string
): AssertionResult {
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

function getByPath(obj: unknown, path: string): unknown {
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

    const filterMatch = p.match(/^(\w+)?\[\?(\w+)=([^\]]+)\]$/);
    if (filterMatch) {
      const [, propName, key, val] = filterMatch;
      let target: unknown = cur;
      if (propName) {
        if (typeof cur !== "object" || cur === null) return undefined;
        target = (cur as Record<string, unknown>)[propName];
      }
      if (!Array.isArray(target)) return undefined;
      cur = target.find(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          String((item as Record<string, unknown>)[key]) === val
      );
      continue;
    }

    if (/^\d+$/.test(p) && Array.isArray(cur)) {
      cur = cur[Number(p)];
    } else if (typeof cur === "object" && cur !== null) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function jsonSummary(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  } catch {
    return String(v);
  }
}
