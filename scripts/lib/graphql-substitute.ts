/**
 * `{{VAR}}` substitution for the runner-native GraphQL case grammar
 * (`.claude/knowledge/api/graphql-test-cases-runner.md` §6).
 *
 * Three sources, resolved in this order: the `Test_Data` bag → `[GQL-CAPTURE]` /
 * `[REST-CAPTURE]` runtime captures (both live in the same bag) → process env.
 *
 * Two things live here that a bare textual `.replace()` cannot express:
 *
 *  1. **JSON-context awareness** (`substituteIntoJson`). A capture is stored as a
 *     bare string; substituting it into a `[GQL-VARS]` body is a *textual* splice
 *     into a JSON document. A captured value holding a newline, a double quote or
 *     a backslash — a push-message body, an org name, a store name — produced an
 *     unparsable body and killed the case with a runtime fatal
 *     (`body is not valid JSON: Bad control character in string literal`).
 *     Blanket-escaping every capture is NOT the fix: object/array captures are
 *     deliberately spliced RAW so they round-trip verbatim into an unquoted
 *     position (`{"items": {{CAPTURED_ARRAY}}}`), and scalars are deliberately
 *     spliced unquoted into GraphQL document bodies. So the escape decision has
 *     to be made where the target context is known — at JSON-body resolution
 *     time, per occurrence: inside a JSON string literal ⇒ escape, outside ⇒ raw.
 *
 *  2. **Env fallback for a caller that substitutes with a plain bag**
 *     (`withEnvFallback`). The Steps path resolves `{{VAR}}` then `{{ENV}}`;
 *     `evaluateAssertion()` takes only a bag, so an assertion RHS naming an env
 *     var (`= {{CURRENCY_CODE}}`) compared the literal token against the response
 *     and could never pass. Merging env UNDER the bag reproduces the documented
 *     precedence in one pass.
 */

type EnvLike = Record<string, string | undefined>;

/** Matches a single `{{NAME}}` token. */
const VAR_TOKEN = /\{\{(\w+)\}\}/g;

/** Anchored twin of {@link VAR_TOKEN} for the scanner in {@link substituteIntoJson}. */
const VAR_TOKEN_AT = /^\{\{(\w+)\}\}/;

/**
 * Context-blind textual substitution from the variables bag. An unknown name is
 * left as `{{NAME}}` so a later stage (env) can still resolve it, and so an
 * genuinely unresolved token shows up verbatim in the failure output.
 */
export function substituteVars(s: string, vars: Record<string, string>): string {
  return s.replace(VAR_TOKEN, (_m, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : `{{${name}}}`
  );
}

/** Context-blind textual substitution from process env (the last resolution stage). */
export function substituteEnv(s: string, env: EnvLike = process.env): string {
  return s.replace(VAR_TOKEN, (_m, name: string) => env[name] ?? `{{${name}}}`);
}

/**
 * JSON string-literal *inner* escaping — the body of a `"…"` with no surrounding
 * quotes. `JSON.stringify` is the authority on which characters need escaping
 * (`"`, `\`, and every control character incl. the raw newline that started this).
 */
export function escapeJsonStringInner(value: string): string {
  const quoted = JSON.stringify(value);
  return quoted.slice(1, -1);
}

/**
 * Resolve one variable name to its final string, or `undefined` when nothing
 * knows it. Bag wins over env; a bag value may itself carry a `{{ENV}}` token
 * (`Test_Data: store_id={{STORE_ID}}`), so it gets the env pass applied — this
 * is exactly what the old `substituteEnv(substituteVars(…))` two-pass produced.
 */
export function makeVarLookup(
  vars: Record<string, string>,
  env: EnvLike = process.env
): (name: string) => string | undefined {
  return (name: string): string | undefined => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return substituteEnv(vars[name], env);
    }
    const fromEnv = env[name];
    return fromEnv === undefined ? undefined : fromEnv;
  };
}

/**
 * Substitute `{{VAR}}` tokens into a JSON *template*, escaping only where the
 * substitution lands inside a JSON string literal.
 *
 *   {"keyword": "{{KW}}"}   KW = 'a"b\nc'  →  {"keyword": "a\"b\nc"}   (escaped)
 *   {"items": {{ARR}}}      ARR = '[1,2]'  →  {"items": [1,2]}         (raw)
 *
 * The scanner tracks string state over the TEMPLATE only — substituted text is
 * emitted, never re-scanned — so a raw splice cannot corrupt the quote state the
 * author wrote, and a value containing `{{…}}` cannot trigger a second round.
 * An unknown name is emitted verbatim as `{{NAME}}` (same as the textual path),
 * which keeps "variable was never captured" diagnosable instead of silently empty.
 */
export function substituteIntoJson(
  template: string,
  lookup: (name: string) => string | undefined
): string {
  let out = "";
  let inString = false;
  let i = 0;

  while (i < template.length) {
    const ch = template[i];

    if (inString) {
      if (ch === "\\") {
        // Escape pair — copy both chars so an escaped quote can't close the string.
        out += template.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        i++;
        continue;
      }
    } else if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }

    if (ch === "{" && template.startsWith("{{", i)) {
      const m = VAR_TOKEN_AT.exec(template.slice(i));
      if (m) {
        const value = lookup(m[1]);
        if (value === undefined) {
          out += m[0];
        } else {
          out += inString ? escapeJsonStringInner(value) : value;
        }
        i += m[0].length;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

/** `[REST-OP]` body lines that carry a JSON payload: `Body: {…}` / `Body: […]`. */
const REST_JSON_BODY_LINE = /^(\s*Body:\s*)([{[][\s\S]*)$/i;

/**
 * Substitute into a `[REST-OP]` block. The block is NOT pure JSON — it is a
 * request line, optional headers, then a single `Body:` line — so only the
 * `Body:` payload gets the JSON-aware treatment; the request line and headers
 * keep the plain textual substitution (`{{BACK_URL}}/api/…`, file paths).
 */
export function substituteIntoRestOp(
  block: string,
  vars: Record<string, string>,
  env: EnvLike = process.env
): string {
  const lookup = makeVarLookup(vars, env);
  return block
    .split(/\n/)
    .map((line) => {
      const m = REST_JSON_BODY_LINE.exec(line);
      if (m) return m[1] + substituteIntoJson(m[2], lookup);
      return substituteEnv(substituteVars(line, vars), env);
    })
    .join("\n");
}

/**
 * A bag that resolves env vars as a fallback, for callers that only take a
 * `Record<string,string>` (notably `evaluateAssertion`). Env keys go in FIRST so
 * the case's own bag (Test_Data + captures) overrides them, matching the
 * documented precedence; bag values get the env pass so an indirection like
 * `Test_Data: store_id={{STORE_ID}}` resolves the whole way.
 */
export function withEnvFallback(
  vars: Record<string, string>,
  env: EnvLike = process.env
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") merged[k] = v;
  }
  for (const [k, v] of Object.entries(vars)) {
    merged[k] = substituteEnv(v, env);
  }
  return merged;
}
