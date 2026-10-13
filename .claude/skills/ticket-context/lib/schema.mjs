// .claude/skills/ticket-context/lib/schema.mjs — a JSON-schema SUBSET validator (M4: vc-fix ships no ajv).
// It supports exactly the keywords bundle.schema.json uses, and THROWS on any other, so the schema can
// never quietly outgrow the validator and pass something it did not check.
const SUPPORTED = new Set(["$schema", "$id", "$defs", "$ref", "title", "description", "allOf", "type", "enum", "const",
  "required", "properties", "additionalProperties", "items", "minLength", "pattern", "minimum"]);

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const typeMatches = (v, t) => t === typeOf(v) || (t === "number" && typeOf(v) === "integer");

export function validate(value, schema, root = schema, path = "$") {
  const errors = [];
  for (const k of Object.keys(schema)) if (!SUPPORTED.has(k)) throw new Error(`schema keyword "${k}" at ${path} is not supported by lib/schema.mjs`);
  if (schema.$ref) {
    const m = /^#\/\$defs\/(.+)$/.exec(schema.$ref);
    if (!m || !root.$defs?.[m[1]]) throw new Error(`unresolvable $ref "${schema.$ref}" at ${path}`);
    errors.push(...validate(value, root.$defs[m[1]], root, path));
  }
  for (const sub of schema.allOf ?? []) errors.push(...validate(value, sub, root, path));
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => typeMatches(value, t))) return [...errors, `${path}: expected ${types.join("|")}, got ${typeOf(value)}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);
  if ("const" in schema && value !== schema.const) errors.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below ${schema.minimum}`);
  if (typeOf(value) === "object") {
    for (const r of schema.required ?? []) if (!(r in value)) errors.push(`${path}: missing "${r}"`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) errors.push(...validate(v, schema.properties[k], root, `${path}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected property "${k}"`);
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items, root, `${path}[${i}]`)));
  return errors;
}

export function validateDef(value, schema, def) {
  if (!schema.$defs?.[def]) throw new Error(`no $def "${def}" in the schema`);
  return validate(value, { $ref: `#/$defs/${def}` }, schema);
}
