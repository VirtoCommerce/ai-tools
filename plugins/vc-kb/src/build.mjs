// Turning what the deployment published into derived tables and entries.
//
// Nothing in here is authored. Every cell of every table is a value the platform serves, and the
// prose that surrounds it is a fixed sentence over those values -- because a body describing what
// an endpoint does would be transcribing something that already has a source of truth, and the
// authored bridge from a real question to a capability is a different plane and a later step.

import { stableStringify, hash, slug } from './canonical.mjs';
import { renderType } from './sources.mjs';
import { stringifyFrontmatter } from './frontmatter.mjs';

// ---------------------------------------------------------------- OpenAPI rendering helpers

const refName = (schema) => {
  if (!schema) return null;
  if (schema.$ref) return schema.$ref.split('/').pop();
  if (schema.type === 'array') {
    const inner = refName(schema.items);
    return inner ? `${inner}[]` : 'array';
  }
  return schema.type ?? null;
};

const bodyOf = (op) => {
  const content = op.requestBody?.content ?? {};
  const media = Object.keys(content).sort()[0];
  if (!media) return null;
  const schema = content[media].schema;
  const named = refName(schema);
  const inlineRequired = Array.isArray(schema?.required) ? schema.required.slice().sort() : [];
  // An inline body schema names its own fields and nothing else does. /connect/token is the
  // case that matters: it is served as an inline form schema, so grant_type, username, password,
  // storeId and user_id exist ONLY here -- and those are the words the most-asked contract
  // question in the whole measurement is phrased in.
  const inlineProps = schema?.properties ? Object.keys(schema.properties).sort() : [];
  return {
    media,
    schema: named,
    required: Boolean(op.requestBody?.required),
    requiredFields: inlineRequired,
    fields: inlineProps,
  };
};

const responseOf = (op) => {
  const codes = Object.keys(op.responses ?? {}).filter((c) => /^2\d\d$/.test(c)).sort();
  if (!codes.length) return null;
  const code = codes[0];
  const content = op.responses[code].content ?? {};
  const media = Object.keys(content).sort()[0];
  return { code, schema: media ? refName(content[media].schema) : null };
};

const paramsOf = (op) =>
  (op.parameters ?? [])
    .map((p) => ({ name: p.name, in: p.in, required: Boolean(p.required), type: refName(p.schema) }))
    .sort((a, b) => a.name.localeCompare(b.name));

// The canonical record for one operation. This -- not the raw document -- is what an anchor hashes,
// so a formatting change upstream does not move it and a contract change does.
function restOperationRecord(c) {
  return {
    coordinate: c.coordinate,
    verb: c.verb,
    route: c.route,
    operationId: c.operationId,
    module: c.module,
    tag: c.tag,
    // The platform's own sentence about the operation, where it publishes one (417 of 825 here).
    // Carrying it is extraction, not authoring -- it is regenerated and byte-compared like every
    // other cell, and it is the only place the surface says what it is FOR rather than what it is.
    summary: c.op.summary ?? c.op.description ?? null,
    parameters: paramsOf(c.op),
    requestBody: bodyOf(c.op),
    response: responseOf(c.op),
    deprecated: Boolean(c.op.deprecated),
  };
}

// The module inventory covers MODULES. The platform host is not one of them -- it serves 23 of the
// coordinates here and appears in no inventory row -- and its version comes from the system-info
// endpoint instead. So an owner the inventory does not know is versioned at the host version and
// SAYS so, per entry, and is listed in unresolved.json. Silently leaving it blank would read as
// "version unknown", which is a different and false statement.
export function appliesToFor(module, ctx) {
  const v = ctx.versions?.get(module);
  if (v?.version) return { module, version: v.version };
  if (ctx.platformVersion) {
    ctx.hostOwners?.add(module);
    return { module, version: ctx.platformVersion, versionedAs: 'platform-host' };
  }
  return { module };
}

// ---------------------------------------------------------------- REST entries

function restRequiredCell(rec) {
  const bits = [];
  for (const p of rec.parameters) if (p.required) bits.push(`\`${p.name}\` (${p.in})`);
  if (rec.requestBody) {
    const b = rec.requestBody;
    const named = b.schema ? `\`${b.schema}\`` : b.media;
    const shown = b.requiredFields.length
      ? `${named} — required: ${b.requiredFields.map((f) => `\`${f}\``).join(', ')}${b.fields.length > b.requiredFields.length ? `; also accepts ${b.fields.filter((f) => !b.requiredFields.includes(f)).map((f) => `\`${f}\``).join(', ')}` : ''}`
      : b.fields.length
        ? `${named} — fields: ${b.fields.map((f) => `\`${f}\``).join(', ')}`
        : named;
    bits.push(`body ${shown}${b.required ? '' : ' (optional)'}`);
  }
  return bits.length ? bits.join(', ') : '—';
}

export function buildRestEntry(group, ctx) {
  const records = group.members.map(restOperationRecord);
  const subject = slug(`rest ${group.key}`);
  const modules = group.modules;

  const anchors = records.map((r) => ({
    coordinate: r.coordinate,
    operationId: r.operationId ?? undefined,
    hash: hash(r),
  }));

  const appliesTo = modules.map((m) => appliesToFor(m, ctx));

  const noun = group.tags.length === 1 ? group.tags[0] : group.key;
  const question = `Which endpoints does this deployment serve under ${group.key}, and what does each one require?`;

  const lines = [];
  lines.push(`# ${group.key}`);
  lines.push('');
  lines.push(
    `${records.length} operation${records.length === 1 ? '' : 's'} under \`${group.key}\`, ` +
      `served by ${modules.length === 1 ? `module \`${modules[0]}\`` : `${modules.length} modules (${modules.map((m) => `\`${m}\``).join(', ')})`}` +
      `${group.tags.length ? `, published under the tag ${group.tags.map((t) => `"${t}"`).join(' / ')}` : ''}.`,
  );
  if (modules.length > 1) {
    lines.push('');
    lines.push(
      `> This surface spans more than one module. An answer that reads only one of them is ` +
        `incomplete — the owning module is given per operation below.`,
    );
  }
  lines.push('');
  lines.push('| operation | what the platform says it does | required input | returns |');
  lines.push('|---|---|---|---|');
  for (const r of records) {
    const said = r.summary ? r.summary.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() : '—';
    lines.push(
      `| \`${r.coordinate}\`<br>\`${r.operationId ?? '—'}\` | ${said} | ` +
        `${restRequiredCell(r)} | ${r.response?.schema ? `\`${r.response.schema}\`` : r.response ? r.response.code : '—'} |`,
    );
  }
  if (modules.length === 1 && ctx.versions?.get(modules[0])?.description) {
    lines.push('');
    lines.push(`Module \`${modules[0]}\` — ${ctx.versions.get(modules[0]).title}: ${ctx.versions.get(modules[0]).description}`);
  }
  lines.push('');
  lines.push(`Generated from \`${ctx.deployment}\` at pin \`${ctx.pin}\`. Table: \`derived/rest/${subject}.json\`.`);
  lines.push('');

  return {
    subject,
    table: { dir: 'rest', name: subject, data: { key: group.key, modules, tags: group.tags, operations: records } },
    frontmatter: { subject, question, appliesTo, anchors },
    body: lines.join('\n'),
    indexText: [
      group.key,
      noun,
      ...group.tags,
      ...modules,
      ...records.flatMap((r) => [r.route, r.operationId, r.response?.schema, r.requestBody?.schema]),
      ...records.flatMap((r) => r.parameters.map((p) => p.name)),
      ...records.flatMap((r) => r.requestBody?.fields ?? []),
    ].filter(Boolean).join(' '),
  };
}

// ---------------------------------------------------------------- GraphQL entries

const namedTypeOf = (t) => {
  let cur = t;
  while (cur?.ofType) cur = cur.ofType;
  return cur?.name ?? null;
};

function graphqlTypeRecord(types, name) {
  const t = types.get(name);
  if (!t) return null;
  return {
    name: t.name,
    kind: t.kind,
    fields: (t.fields ?? []).map((f) => ({ name: f.name, type: renderType(f.type), description: f.description ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
    inputFields: (t.inputFields ?? []).map((f) => ({ name: f.name, type: renderType(f.type), description: f.description ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
    enumValues: (t.enumValues ?? []).map((e) => e.name).sort(),
  };
}

export function buildGraphqlEntry(group, ctx) {
  const { types } = ctx.schema;
  const field = group.field;
  const subject = slug(`gql ${group.key}`);

  const args = (field.args ?? [])
    .map((a) => ({ name: a.name, type: renderType(a.type), required: renderType(a.type)?.endsWith('!') ?? false, description: a.description ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // The types this field actually drags in: its argument types and its return type. Anchoring them
  // is what makes a change to InputAddItemType flag the addItem entry rather than nothing at all.
  //
  // SCALARS ARE NOT COORDINATES. An anchor's job is to raise a flag when the thing it names
  // changes, and `String` cannot change -- so a scalar anchor can never fire, while claiming that
  // 64 entries are "about String". That claim is not inert: the cross-plane lookup answers a
  // capture anchored on a scalar with dozens of unrelated derived facts, and anything that
  // retrieves by coordinate inherits the same noise. Enums, interfaces and unions stay: those can
  // gain a member, so an anchor on one can actually fire.
  const referenced = [...new Set([
    ...(field.args ?? []).map((a) => namedTypeOf(a.type)),
    namedTypeOf(field.type),
  ].filter((n) => n && types.has(n) && types.get(n).kind !== 'SCALAR'))].sort();

  const typeRecords = referenced.map((n) => graphqlTypeRecord(types, n)).filter(Boolean);

  const record = {
    coordinate: group.key,
    role: group.role,
    rootType: group.rootType,
    field: field.name,
    signature: `${field.name}(${args.map((a) => `${a.name}: ${a.type}`).join(', ')}): ${renderType(field.type)}`,
    args,
    returns: renderType(field.type),
    // Names and kinds; the field tables live in each type's own artifact. The anchors below still
    // carry a hash of the full record, so a change inside InputAddItemType still flags this entry.
    referencedTypes: typeRecords.map((t) => ({ name: t.name, kind: t.kind })),
  };

  const anchors = [
    { coordinate: group.key, hash: hash({ signature: record.signature }) },
    ...typeRecords.map((t) => ({ coordinate: t.name, hash: hash(t) })),
  ];

  // Introspection returns ONE merged schema and publishes no attribution of a field to the module
  // that contributed it. So a GraphQL fact cannot be labelled at a module version the way a REST
  // fact can -- and staying silent about that is the failure the pre-release rule exists to
  // prevent: this deployment's GraphQL surface is contributed to by modules that may be on PR
  // builds, and one of them (ProfileExperienceApiModule, measured on vcst) exposes NO REST at all,
  // so it exists only here. What can honestly be said is said: the platform version serving the
  // schema, and how many pre-release modules the deployment is running, since any of them could
  // be a contributor and none can be ruled out.
  const appliesTo = [{
    surface: 'graphql',
    root: group.rootType,
    platformVersion: ctx.platformVersion ?? undefined,
    prereleaseContributorsPossible: ctx.prerelease?.length ? ctx.prerelease.length : undefined,
  }];

  const lines = [];
  lines.push(`# ${group.key}`);
  lines.push('');
  lines.push(
    `A GraphQL ${group.role} field on the root type \`${group.rootType}\`. ` +
      `The root type names on this deployment are read from introspection, not assumed: ` +
      `\`${ctx.schema.roots.query}\` / \`${ctx.schema.roots.mutation}\` / \`${ctx.schema.roots.subscription}\`.`,
  );
  lines.push('');
  lines.push('```graphql');
  lines.push(record.signature);
  lines.push('```');
  if (args.length) {
    lines.push('');
    lines.push('| argument | type | required | what the schema says |');
    lines.push('|---|---|---|---|');
    for (const a of args) {
      const said = a.description ? a.description.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() : '—';
      lines.push(`| \`${a.name}\` | \`${a.type}\` | ${a.required ? 'yes' : 'no'} | ${said} |`);
    }
  }
  // The referenced types are NAMED and not inlined. Copying a type's field table into every
  // operation that touches it put CartType into 40 entries, ~280 KB of repeats, and made forty
  // documents answer to the same terms in the index. Each type now has an entry of its own; this
  // one says which, so a reader following a signature has one hop rather than a duplicate.
  if (typeRecords.length) {
    lines.push('');
    lines.push(`Types in this signature: ${typeRecords.map((t) => `\`${t.name}\` (${t.kind}) — \`gql-type-${t.name.toLowerCase()}\``).join(', ')}.`);
  }
  if (ctx.prerelease?.length) {
    lines.push('');
    lines.push(
      `> **Not merged into the release line.** This deployment runs ${ctx.prerelease.length} module` +
        `${ctx.prerelease.length === 1 ? '' : 's'} on a pre-release build ` +
        `(${ctx.prerelease.map((p) => `\`${p.module}@${p.version}\``).join(', ')}), and introspection ` +
        `publishes no attribution of a schema field to the module that contributed it — so this fact ` +
        `cannot be shown to come from a released build, and must not be read as one.`,
    );
  }
  lines.push('');
  lines.push(`Generated from \`${ctx.deployment}\` at pin \`${ctx.pin}\`. Table: \`derived/graphql/${subject}.json\`.`);
  lines.push('');

  return {
    subject,
    table: { dir: 'graphql', name: subject, data: record },
    frontmatter: {
      subject,
      question: `What is the signature of the GraphQL ${group.role} \`${group.key}\`, and what do its inputs require?`,
      appliesTo,
      anchors,
    },
    body: lines.join('\n'),
    indexText: [
      group.key, field.name, group.rootType, record.returns,
      ...args.map((a) => `${a.name} ${a.type}`),
      // The BODY no longer copies these tables, but the INDEX still carries their field names, and
      // the two are not the same decision. A reader following a signature wants one hop, not a
      // duplicate -- that is the body. But "which operation gives me the discount" is answered by
      // the operation that RETURNS a type carrying discounts, and dropping the field names here
      // took that away: measured on the nine questions of run 01, `Query.cart` stopped being found
      // for a question about cart discounts, and a type entry that does not answer it took the
      // place. Conflating the two cost three rows to buy three.
      ...typeRecords.flatMap((t) => [
        t.name,
        ...(t.inputFields ?? []).map((f) => f.name),
        ...(t.fields ?? []).map((f) => f.name),
      ]).filter(Boolean),
    ].filter(Boolean).join(' '),
  };
}

// ---------------------------------------------------------------- no-REST-surface entries

export function buildNoRestEntry(group, ctx) {
  const subject = slug(`no-rest ${group.module}`);

  const lines = [
    `# ${group.module} exposes no REST surface`,
    '',
    `The deployment serves an OpenAPI document for \`${group.module}\` and that document declares ` +
      `zero paths. This is a fact about the module, not a failed extraction: ${ctx.noRestCount} of ` +
      `${ctx.documentCount} documents on this deployment are in this state by construction — ` +
      `payment, search and asset providers, SSO, telemetry, and every xAPI module, whose entire ` +
      `contract is served through GraphQL instead.`,
    '',
    `Generated from \`${ctx.deployment}\` at pin \`${ctx.pin}\`.`,
    '',
  ];
  return {
    subject,
    table: null,
    frontmatter: {
      subject,
      question: `Does ${group.module} expose REST endpoints on this deployment?`,
      appliesTo: [appliesToFor(group.module, ctx)],
      anchors: [{ coordinate: `document ${group.module}`, hash: hash({ paths: {} }) }],
    },
    body: lines.join('\n'),
    indexText: `${group.module} no rest surface graphql xapi zero paths`,
  };
}

// ---------------------------------------------------------------- assembly

export function renderEntryFile(entry, id, ctx) {
  const fm = stringifyFrontmatter({
    id,
    subject: entry.frontmatter.subject,
    plane: 'derived-first',
    question: entry.frontmatter.question,
    status: 'active',
    refutableBy: 'derivation',
    appliesTo: entry.frontmatter.appliesTo,
    anchors: entry.frontmatter.anchors,
    evidence: [{ method: 'extraction', deployment: ctx.deployment, pin: ctx.pin }],
  });
  return `${fm}\n\n${entry.body}`;
}

export { stableStringify };
