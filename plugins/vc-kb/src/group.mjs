// The granularity rule, in one file, so that what one derived entry is ABOUT is a thing you
// can read rather than infer from the shape of the output.
//
// One entry = one capability surface.
//
// It is neither one-per-operation (1,650 entries, and step 0 measured zero questions that one
// operation answers) nor one-per-module (87 entries, and five route prefixes on this deployment
// are served by more than one module, so a module key splits the answer away from the question
// that asks it -- /api/pages is four modules of one operation each).
//
// The key is the ROUTE PREFIX, because that is the noun the asker can produce. The owning module
// is carried as data. The platform's own grouping supports this: none of its 60 tags is named
// after a module, and 42 of them map to exactly one route prefix -- the platform groups at module
// granularity but names by capability, and the route prefix is that name in machine-stable form.

export const SPLIT_AT = 25; // a group larger than this re-keys one segment deeper

const segmentsOf = (route) =>
  route.split('/').filter(Boolean).filter((s) => !s.startsWith('{'));

const prefixOf = (route, depth) => '/' + segmentsOf(route).slice(0, depth).join('/');

// REST: two segments, deepened to three for the few groups a flat two-segment key would make
// unreadable. The threshold is stated rather than tuned per group, and the groups that remain
// above it after deepening are reported instead of being split further by hand.
export function groupRest(coordinates) {
  const shallow = new Map();
  for (const c of coordinates) {
    const k = prefixOf(c.route, 2);
    if (!shallow.has(k)) shallow.set(k, []);
    shallow.get(k).push(c);
  }

  const groups = new Map();
  for (const [key, members] of shallow) {
    if (members.length <= SPLIT_AT) {
      groups.set(key, members);
      continue;
    }
    for (const c of members) {
      const k3 = prefixOf(c.route, 3);
      if (!groups.has(k3)) groups.set(k3, []);
      groups.get(k3).push(c);
    }
  }

  return [...groups.entries()]
    .map(([prefix, members]) => ({
      kind: 'rest',
      key: prefix,
      members: members.sort((a, b) => a.coordinate.localeCompare(b.coordinate)),
      modules: [...new Set(members.map((m) => m.module).filter(Boolean))].sort(),
      tags: [...new Set(members.map((m) => m.tag).filter(Boolean))].sort(),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// GraphQL: one entry per root field. Step 0's four GraphQL contract questions asked for exactly
// this unit -- the required fields of InputAddItemType, the signature of changeCartItemQuantity,
// which fields of CartType carry validationErrors -- so the entry carries the field's argument
// types and its return type's own fields with it.
// One group per named object type, alongside the per-root-field groups below.
//
// Until this existed a type was described only as a side effect of being some root field's return
// or argument type, which had two consequences the corpus wore plainly: 89 types were NAMED in
// signatures and described nowhere (CartTotalType is reachable only as CartType.cartTotals, so the
// plane mentioned it and stopped), while CartType's field table was copied into 40 separate
// entries. Omission and duplication from one cause.
//
// Root types are excluded -- Query and Mutations are already covered field by field, and an entry
// listing all 168 of them answers nothing anyone asks. Introspection's own `__`-prefixed types are
// not part of the deployment's contract.
export function groupGraphqlTypes({ roots, types }) {
  const rootNames = new Set(Object.values(roots).filter(Boolean));
  const out = [];
  for (const [name, t] of types) {
    if (rootNames.has(name) || name.startsWith('__')) continue;
    if (t.kind !== 'OBJECT' && t.kind !== 'INPUT_OBJECT') continue;
    const rows = t.kind === 'INPUT_OBJECT' ? (t.inputFields ?? []) : (t.fields ?? []);
    if (!rows.length) continue;
    out.push({ kind: 'graphql-type', key: name, typeName: name, typeKind: t.kind });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function groupGraphql({ roots, types }) {
  const out = [];
  for (const [role, typeName] of Object.entries(roots)) {
    if (!typeName) continue;
    const rootType = types.get(typeName);
    if (!rootType?.fields) continue;
    for (const field of [...rootType.fields].sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({
        kind: 'graphql',
        key: `${typeName}.${field.name}`,
        role,
        rootType: typeName,
        field,
      });
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

// A module that serves a document with no paths exposes no REST surface. That is a fact about
// the module -- 27 of the 88 documents here are in that state by construction, every xAPI module
// among them -- and recording it as an unresolved row instead would make a third of the inventory
// read as broken extraction forever.
export function groupEmptyModules(documents) {
  return documents
    .filter((d) => d.role === 'empty')
    .map((d) => ({ kind: 'no-rest', key: d.name, module: d.name }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
