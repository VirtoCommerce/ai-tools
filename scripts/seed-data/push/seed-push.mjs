#!/usr/bin/env node
/**
 * seed-push.mjs — populate the Push Messages fixture inboxes (`npm run seed:push`).
 *
 *   reader  (PUSH_RECIPIENT_READER, data.push.inbox.reader-mixed) — TOP-UP: count OUR visible messages
 *           as the reader, send only the difference, keep ≥1 read and ≥1 unread, and keep exactly the
 *           one link message present. A second run on a satisfied inbox sends nothing.
 *   bulk    (PUSH_RECIPIENT_BULK, data.push.inbox.bulk-fresh) — FRESH: send the declared number of new
 *           unread messages EVERY run (mark-all-read / clear-all consume them), poll until visible+unread.
 *   never   PUSH_RECIPIENT_BYSTANDER / PUSH_RECIPIENT_EMPTY — the run REFUSES to start if either
 *           resolves to a send target, and reports their live state at the end.
 *
 * Thresholds come from the PUSH_DATA_READER_INBOX / PUSH_DATA_BULK aliases, the send contract from
 * PUSH_MSG_SEED, the storefront origin from FRONT_URL. Shape + derivations: ./push-specs.mjs.
 *
 * Writes back to test-data/aliases.<env>.json:
 *   PUSH_DATA_READER_INBOX.link_message_id          — the reader's link message (irrevocable, stable)
 *   PUSH_DATA_BULK.batch_marker / batch_message_ids — this run's fresh bulk batch
 *
 * Usage:
 *   node scripts/seed-data/push/seed-push.mjs [--dry-run] [--verbose] [--only reader|bulk] [--teardown]
 *
 * --teardown does NOTHING destructive: a Sent push message can be neither edited nor deleted (domain
 * map push-messages.md §1 link 8; DELETE of a Sent message is refused). Isolation is by the dedicated
 * accounts in their own organization, never by cleanup.
 */
import '../../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import {
  FRONT_URL, DRY_RUN, TEARDOWN, ONLY, log, verbose, assertSafeTarget, auth, api, loadAliases, writeEnvAliasOverride,
} from '../../lib/seed-common.mjs';
import {
  BODY_PREFIX, INBOXES, PROTECTED, SEND_CONTRACT_ALIAS, sendTargetAliases, buildMessageBodies, linkMessageBody,
  isLinkMessage, isOurs, classifyInbox, planReaderTopUp, runMarker,
} from './push-specs.mjs';
import {
  TEST_ENV, readThresholds, signInRecipient, fetchInbox, setRead, waitForMessages, protectedStateReport,
} from './push-live.mjs';

const byCreated = (a, b) => String(a.createdDate).localeCompare(String(b.createdDate));

function teardownNotice() {
  console.log('\n  seed:push --teardown — nothing to delete, by design.');
  console.log('  A Sent push message can be neither edited nor deleted (push-messages.md §1 link 8), so the');
  console.log('  messages this seeder sent stay in their inboxes for good. Isolation is by dedicated accounts:');
  for (const i of Object.values(INBOXES)) console.log(`    ${i.recipientAlias.padEnd(26)} ${i.requirement}`);
  console.log('  and the protected accounts (never targeted):');
  for (const p of Object.values(PROTECTED)) console.log(`    ${p.recipientAlias.padEnd(26)} ${p.requirement}`);
  console.log('  To start an inbox over, provision a NEW account (seed:b2b / seed:users) — never clear-all a');
  console.log('  shared one, and never send to a protected one.\n');
}

async function sendMessages(contract, memberId, bodies, topicStem) {
  const ids = [];
  for (let k = 0; k < bodies.length; k++) {
    const body = {
      topic: `${contract.topic_prefix}${topicStem}-${String(k + 1).padStart(2, '0')}`,
      shortMessage: bodies[k],
      status: contract.sent_status,
      startDate: contract.epoch_start_date,
      memberIds: [memberId],
    };
    const created = await api('POST', contract.endpoint, body);
    if (!created?.id) throw new Error(`POST ${contract.endpoint} returned no id for "${body.topic}"`);
    ids.push(created.id);
    verbose(`sent ${created.id} ${body.topic}`);
  }
  return ids;
}

function describe(s) {
  return `visible=${s.visible} read=${s.read} unread=${s.unread} hidden(ours)=${s.hidden} link=${s.linkVisible ? 'yes' : 'no'} | foreign rows=${s.total - s.ours}`;
}

async function seedReader(ctx) {
  const spec = INBOXES.reader;
  const t = readThresholds(ctx.aliases, spec.thresholdsAlias, spec.thresholds);
  const who = ctx.recipients[spec.recipientAlias];
  let state = classifyInbox((await fetchInbox(who.token)).items);
  const plan = planReaderTopUp(state, t);
  log(`reader ${who.email}`);
  log(`  before: ${describe(state)}`);
  log(`  target: visible>=${t.minVisible} read>=${t.minRead} unread>=${t.minUnread} + 1 link`);
  log(`  plan:   send ${plan.send} (${plan.plain} plain${plan.includeLink ? ' + 1 link' : ''}), mark read ${plan.markRead}, mark unread ${plan.markUnread}`);
  if (DRY_RUN) return { state, plan };

  if (plan.send) {
    const bodies = buildMessageBodies({ inboxKey: 'reader', marker: ctx.marker, count: plan.plain, startIndex: state.ours + 1 });
    if (plan.includeLink) bodies.push(linkMessageBody({ marker: ctx.marker, frontUrl: FRONT_URL }));
    const ids = await sendMessages(ctx.contract, who.memberId, bodies, `PUSH-SEED-reader-${ctx.marker}`);
    const { inbox, waitedMs } = await waitForMessages(who.token, ids);
    log(`  sent ${ids.length}; all visible to the reader after ${Math.round(waitedMs / 1000)} s`);
    state = classifyInbox(inbox.items);
  }
  const inbox = (await fetchInbox(who.token)).items.filter((i) => isOurs(i.shortMessage) && !i.isHidden);
  const plain = inbox.filter((i) => !isLinkMessage(i.shortMessage));
  // Re-derive against the CURRENT inbox (another lane may have flipped a flag since the plan).
  const need = planReaderTopUp(state, t);
  const toRead = plain.filter((i) => !i.isRead).sort(byCreated).slice(0, need.markRead);
  for (const m of toRead) { await setRead(who.token, m.id, true); log(`  marked read   ${m.id}`); }
  const toUnread = plain.filter((i) => i.isRead && !toRead.includes(i)).sort(byCreated).reverse().slice(0, need.markUnread);
  for (const m of toUnread) { await setRead(who.token, m.id, false); log(`  marked unread ${m.id}`); }

  const finalItems = (await fetchInbox(who.token)).items;
  state = classifyInbox(finalItems);
  log(`  after:  ${describe(state)}`);
  if (state.visible < t.minVisible || state.read < t.minRead || state.unread < t.minUnread || !state.linkVisible) {
    throw new Error(`reader inbox did not reach its state: ${describe(state)}`);
  }
  const link = finalItems.find((i) => isOurs(i.shortMessage) && !i.isHidden && isLinkMessage(i.shortMessage));
  return { state, plan, writeback: { link_message_id: link.id } };
}

async function seedBulk(ctx) {
  const spec = INBOXES.bulk;
  const { fresh } = readThresholds(ctx.aliases, spec.thresholdsAlias, spec.thresholds);
  const who = ctx.recipients[spec.recipientAlias];
  const before = classifyInbox((await fetchInbox(who.token)).items);
  log(`bulk ${who.email}`);
  log(`  before: ${describe(before)}`);
  log(`  plan:   send ${fresh} fresh unread (every run — mark-all-read / clear-all consume them)`);
  if (DRY_RUN) return { state: before };

  const { marker } = ctx;
  const bodies = buildMessageBodies({ inboxKey: 'bulk', marker, count: fresh });
  const ids = await sendMessages(ctx.contract, who.memberId, bodies, `PUSH-SEED-bulk-${marker}`);
  const { inbox, waitedMs } = await waitForMessages(who.token, ids);
  const batch = inbox.items.filter((i) => ids.includes(i.id));
  const bad = batch.filter((i) => i.isRead || i.isHidden);
  if (bad.length) throw new Error(`bulk batch not fresh: ${bad.map((i) => `${i.id} read=${i.isRead} hidden=${i.isHidden}`).join('; ')}`);
  const state = classifyInbox(inbox.items);
  log(`  sent ${ids.length}; visible + unread after ${Math.round(waitedMs / 1000)} s`);
  log(`  after:  ${describe(state)}`);
  return { state, writeback: { batch_marker: `${BODY_PREFIX}bulk-${marker}`, batch_message_ids: ids.join(';') } };
}

async function run() {
  assertSafeTarget();
  if (TEARDOWN) { teardownNotice(); return; }
  console.log(`\n  seed:push — TEST_ENV=${TEST_ENV}${DRY_RUN ? ' [DRY RUN — reads only, nothing sent or marked]' : ''}`);
  if (!FRONT_URL) throw new Error('FRONT_URL is not set — the link message needs the storefront origin');
  if (ONLY && !INBOXES[ONLY]) throw new Error(`--only must be one of ${Object.keys(INBOXES).join(', ')} (got "${ONLY}")`);
  await auth();

  const aliases = loadAliases();
  const contract = aliases[SEND_CONTRACT_ALIAS];
  for (const f of ['endpoint', 'topic_prefix', 'sent_status', 'epoch_start_date']) {
    if (!contract?.[f]) throw new Error(`${SEND_CONTRACT_ALIAS}.${f} is missing from test-data/aliases.json`);
  }

  // Resolve EVERY account first — targets and protected — and refuse to send if they collide.
  const recipients = {};
  for (const a of [...sendTargetAliases(), ...Object.values(PROTECTED).map((p) => p.recipientAlias)]) {
    const r = await signInRecipient(aliases, a);
    if (!r.memberId) throw new Error(`${a}: me.memberId is empty — the account has no contact`);
    if (r.overlayContactId && r.overlayContactId !== r.memberId) log(`⚠ ${a}: aliases.${TEST_ENV}.json contactId ${r.overlayContactId} != live memberId ${r.memberId} — re-run seed:b2b`);
    recipients[a] = r;
    verbose(`${a} → user ${r.userId}, member ${r.memberId}`);
  }
  const protectedIds = new Set(Object.values(PROTECTED).map((p) => recipients[p.recipientAlias].memberId));
  const targetIds = sendTargetAliases().map((a) => recipients[a].memberId);
  if (targetIds.some((id) => protectedIds.has(id)) || new Set(targetIds).size !== targetIds.length) {
    throw new Error(`REFUSING TO SEND: a send target resolves to a protected account or two targets share a member id (targets ${targetIds.join(', ')}; protected ${[...protectedIds].join(', ')})`);
  }

  const ctx = { aliases, contract, recipients, marker: runMarker(new Date()) };
  const results = {};
  if (!ONLY || ONLY === 'reader') results.reader = await seedReader(ctx);
  if (!ONLY || ONLY === 'bulk') results.bulk = await seedBulk(ctx);

  if (!DRY_RUN) {
    const updates = {};
    if (results.reader?.writeback) updates[INBOXES.reader.thresholdsAlias] = results.reader.writeback;
    if (results.bulk?.writeback) updates[INBOXES.bulk.thresholdsAlias] = results.bulk.writeback;
    writeEnvAliasOverride(updates);
    if (Object.keys(updates).length) log(`✓ aliases.${TEST_ENV}.json: ${Object.entries(updates).map(([k, v]) => `${k}.{${Object.keys(v).join(',')}}`).join(', ')}`);
  }

  // The protected accounts: never written to here, but their state is the reason the fixture set
  // exists, so report it on every run. td:validate:push (--live) is the gate that FAILS on it.
  log('protected accounts (never targeted by this seeder):');
  const report = await protectedStateReport({ aliases, api, PROTECTED, isOurs });
  for (const r of report) log(`  ${r.ok ? '✓' : '✗'} ${r.alias}: ${r.detail}`);
  if (report.some((r) => !r.ok)) log('⚠ a protected state is VIOLATED — see td:validate:push; this seeder did not cause it and cannot undo it.');
  console.log(`\n✅ seed:push ${DRY_RUN ? 'dry run' : 'complete'}\n`);
}

run().catch((e) => { console.error(`\n❌ seed:push failed: ${e.message}`); process.exit(1); });
