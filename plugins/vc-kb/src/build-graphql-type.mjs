// An entry per named GraphQL type.
//
// Its own module rather than a fourth builder inside build.mjs, because it changes what the
// derived plane is projected AT. Every other builder answers "what does this operation do";
// this one answers "what is this thing made of", and the difference is the point.
//
// WHY IT EXISTS. Until now a type was described only as a side effect of being some root field's
// return or argument type. Two consequences, from one cause, both measurable in the corpus:
//
//   omission     89 types were NAMED in signatures and described nowhere. `CartTotalType` is
//                reachable only as `CartType.cartTotals`, so the plane mentioned it and stopped.
//                A live run asked for its fields by name, twice, and got the `Query.cart` entry
//                both times; it settled the question by introspecting the deployment by hand.
//   duplication  `CartType`'s field table was copied into 40 separate entries, ~280 KB of repeats
//                across the plane. Forty documents answering to the same terms is not tidiness,
//                it is noise in a BM25 index.
//
// AND THE COORDINATE SHAPE. Of the eight anchors the first live run chose for the facts it
// recorded, six were named by no derived entry at all, and nearly all of those were `Type.field`.
// So the cross-plane check — the thing that exists to stop an observation quietly contradicting a
// generated contract — was blind to the commonest shape of coordinate the experiential plane
// actually uses. Anchoring each type on itself and on every one of its fields is what closes that.

import { hash, slug } from './canonical.mjs';
import { renderType } from './sources.mjs';

const describe = (t) => (t.kind === 'INPUT_OBJECT' ? t.inputFields : t.fields) ?? [];

export function graphqlTypeRecord(types, name) {
  const t = types.get(name);
  if (!t) return null;
  const rows = (t.kind === 'INPUT_OBJECT' ? t.inputFields : t.fields) ?? [];
  return {
    name: t.name,
    kind: t.kind,
    fields: rows
      .map((f) => ({ name: f.name, type: renderType(f.type), description: f.description ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function buildGraphqlTypeEntry(group, ctx) {
  const record = graphqlTypeRecord(ctx.schema.types, group.typeName);
  const subject = slug(`gql type ${group.typeName}`);
  const isInput = record.kind === 'INPUT_OBJECT';
  const rows = record.fields;

  const said = (d) => (d ? d.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() : '—');

  const lines = [
    `# ${record.name}`,
    '',
    `A GraphQL ${isInput ? 'input object' : 'object'} type on this deployment's schema, carrying ` +
      `${rows.length} field${rows.length === 1 ? '' : 's'}. ` +
      (isInput
        ? 'It is what an operation accepts: a required field left out is refused before anything is attempted.'
        : 'It is what an operation returns: a field that is not here cannot be selected, however plausible its name.'),
    '',
    '| field | type | what the schema says |',
    '|---|---|---|',
    ...rows.map((f) => `| \`${f.name}\` | \`${f.type}\` | ${said(f.description)} |`),
  ];

  if (ctx.prerelease?.length) {
    lines.push(
      '',
      `> **Not shown to be a release fact.** This deployment runs ${ctx.prerelease.length} module` +
        `${ctx.prerelease.length === 1 ? '' : 's'} on a pre-release build, and introspection publishes ` +
        `no attribution of a type to the module that contributed it.`,
    );
  }

  lines.push('', `Generated from \`${ctx.deployment}\` at pin \`${ctx.pin}\`. Table: \`derived/graphql/${subject}.json\`.`, '');

  return {
    subject,
    table: { dir: 'graphql', name: subject, data: record },
    frontmatter: {
      subject,
      question: `What fields does the GraphQL type \`${record.name}\` have, and what type is each?`,
      appliesTo: [{
        surface: 'graphql',
        platformVersion: ctx.platformVersion ?? undefined,
        prereleaseContributorsPossible: ctx.prerelease?.length ? ctx.prerelease.length : undefined,
      }],
      // The type, and every field on it. `Type.field` is what an observation anchors on, so this is
      // what makes an experiential fact about `CartType.discounts` meet the contract it argues with.
      anchors: [
        { coordinate: record.name, hash: hash(record) },
        ...rows.map((f) => ({ coordinate: `${record.name}.${f.name}`, hash: hash({ name: f.name, type: f.type }) })),
      ],
    },
    body: lines.join('\n'),
    indexText: [record.name, ...rows.map((f) => `${f.name} ${f.type}`)].join(' '),
  };
}

export { describe };
