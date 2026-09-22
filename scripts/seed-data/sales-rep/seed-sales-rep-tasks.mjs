#!/usr/bin/env node
/**
 * seed-sales-rep-tasks.mjs — the Sales Rep TASK fixtures (VCST-5732, "[E2E] Sales Rep Task
 * Management"). 14 tasks in four date/completion groups of DIFFERENT sizes.
 *
 * The design contract these rows encode — and why collapsing any of it makes the feature's central
 * question undecidable — lives in `sales-rep-tasks-specs.mjs`, which is the single source of truth
 * for the rows, the relative-date derivation and the vacuity gate. This file is a thin
 * authenticate → teardown → create → complete → write-back over it.
 *
 * ── DECAY WARNING — RE-SEED BEFORE ASSERTING GROUP SIZES ─────────────────────────────────────────
 * Due dates are WALL-CLOCK RELATIVE and computed at seed time. Alpha / Sierra / Delta stop being
 * "due today" at the next UTC MIDNIGHT, at which point they silently become overdue and the designed
 * group sizes 2 / 3 / 5 / 4 become 5 / 0 / 5 / 4. Nothing errors and no guard fires at run time —
 * the suite simply asserts the wrong number. **Any suite that asserts group membership or group size
 * must run this seeder first.** The seeder prints the UTC instant at which the fixture decays.
 *
 * ── ISOLATION: per REP ACCOUNT ───────────────────────────────────────────────────────────────────
 * Tasks are private to their owning rep (confirmed live: another rep reads `totalCount: 0`), so this
 * set is isolated **per REP ACCOUNT** — not per run, not per suite. Two suites on the same rep see
 * each other's mutations.
 *
 * ── TRANSPORT ────────────────────────────────────────────────────────────────────────────────────
 * There is no admin REST surface for sales-rep tasks. Everything goes through the SCOPED
 * `/graphql/sales-rep` endpoint AS THE OWNING REP, whose token needs `storeId` on the password grant.
 * That is why this seeder does not use seed-common's admin `api()` — it still calls
 * `assertSafeTarget()` for the ENV_RISK prod guard and still writes back through
 * `writeEnvAliasOverride()`.
 *
 * ── CREDENTIALS (GOLDEN RULE — nothing hardcoded) ────────────────────────────────────────────────
 *   SALES_REP_EMAIL     — identity, committed in `.env.<env>` (e.g. `.env.vcptcore_qa1`)
 *   SALES_REP_PASSWORD  — secret, ONLY in the gitignored `.env.local`, per-env suffixed
 *                         (`SALES_REP_PASSWORD_VCPTCORE_QA1`); template default in
 *                         `templates/.env.local.template`
 *   BACK_URL / STORE_ID — from the layered `.env` loader
 * Both are resolved through `process.env` AFTER the loader has run (never off one layer, never off
 * the curated `config.js` export — `.claude/rules/test-data.md` §Resolving a variable).
 *
 * Flags: --dry-run (reads only) · --verbose · --teardown (removes only AGENT-TEST-TASK rows)
 *
 * Run:      TEST_ENV=vcptcore_qa1 npm run seed:sales-rep-tasks
 * Teardown: TEST_ENV=vcptcore_qa1 npm run seed:sales-rep-tasks:teardown
 * Guard:    npm run td:validate:sales-rep-tasks
 */
import {
  assertSafeTarget, log, verbose, writeEnvAliasOverride, verifyRemoved,
  DRY_RUN, TEARDOWN, BACK_URL, STORE_ID,
} from '../../lib/seed-common.mjs';
import {
  TASK_SPECS, TASK_MARK, GROUPS_ALIAS, SHARED_DAY_OFFSET, EMPTY_DAY_OFFSETS,
  buildCreateCommand, dueDate, inCreationOrder, groupSizes,
  divergenceProblems, startOfUtcDay, GROUP_NAMES, expectedTotal,
} from './sales-rep-tasks-specs.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const ENV_SUFFIX = TEST_ENV.toUpperCase();
const REP_EMAIL = process.env.SALES_REP_EMAIL;
const REP_PASSWORD = process.env.SALES_REP_PASSWORD;
const ENDPOINT = '/graphql/sales-rep';

const M_CREATE = 'mutation($c:InputCreateSalesRepTask!){createSalesRepTask(command:$c){id name type priority dueDate completed createdDate}}';
const M_STATUS = 'mutation($c:InputChangeSalesRepTaskStatus!){changeSalesRepTaskStatus(command:$c){id completed}}';
const M_DELETE = 'mutation($c:InputDeleteSalesRepTask!){deleteSalesRepTask(command:$c)}';
const Q_LIST = '{salesRepTasks(first:200){totalCount items{id name type priority dueDate completed createdDate}}}';

/** Password grant for the owning rep. `storeId` is REQUIRED by the scoped sales-rep grant. */
async function repToken() {
  if (!REP_EMAIL) {
    throw new Error(
      `SALES_REP_EMAIL is not set for TEST_ENV=${TEST_ENV}.\n`
      + `  Add it to the COMMITTED .env.${TEST_ENV} (it is an identity, not a secret).`,
    );
  }
  if (!REP_PASSWORD) {
    throw new Error(
      `SALES_REP_PASSWORD did not resolve for TEST_ENV=${TEST_ENV}.\n`
      + `  Add SALES_REP_PASSWORD_${ENV_SUFFIX}=<the rep's password> to the gitignored .env.local\n`
      + `  (see templates/.env.local.template). The suffix must match TEST_ENV EXACTLY — a\n`
      + `  differently-shaped name is never promoted, and the miss is SILENT.`,
    );
  }
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: REP_EMAIL, password: REP_PASSWORD, storeId: STORE_ID }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `rep token failed (${res.status}) for ${REP_EMAIL} @ ${new URL(BACK_URL).host} storeId=${STORE_ID}: `
      + `${JSON.stringify(body).slice(0, 200)}\n`
      + `  If this is invalid_grant, SALES_REP_PASSWORD_${ENV_SUFFIX} is probably missing from .env.local,\n`
      + `  so another env's shared password was used. Stop re-running until it is set — each attempt is a\n`
      + `  failed login against a shared account.`,
    );
  }
  return body.access_token;
}

function makeGql(token) {
  return async (query, variables = {}) => {
    const res = await fetch(`${BACK_URL}${ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.errors) throw new Error(`GraphQL ${ENDPOINT}: ${JSON.stringify(body.errors.map((e) => e.message)).slice(0, 400)}`);
    if (!res.ok) throw new Error(`GraphQL ${ENDPOINT}: HTTP ${res.status}`);
    return body.data || {};
  };
}

/** Every AGENT-TEST-TASK row currently owned by this rep. */
async function listSeeded(gql) {
  const d = await gql(Q_LIST);
  return (d?.salesRepTasks?.items || []).filter((t) => String(t.name || '').startsWith(TASK_MARK));
}

/**
 * Teardown = delete every AGENT-TEST-TASK row this rep owns, and nothing else.
 * Idempotency here is TEARDOWN-THEN-SEED rather than find-or-create on purpose: a task's group
 * membership is a function of its dueDate, which is recomputed on every run, so a "reuse if present"
 * path would leave yesterday's absolute dates in place and quietly re-shape the groups.
 */
async function teardown(gql) {
  const mine = await listSeeded(gql);
  if (DRY_RUN) { log(`DRY RUN: would delete ${mine.length} ${TASK_MARK} row(s)`); return mine.length; }
  for (const t of mine) {
    await gql(M_DELETE, { c: { id: t.id } });
    verbose(`deleted ${t.name} (${t.id})`);
  }
  const residue = await verifyRemoved(() => listSeeded(gql));
  log(`Teardown: removed ${mine.length} ${TASK_MARK} row(s); residue ${residue}`);
  if (residue > 0) throw new Error(`teardown left ${residue} ${TASK_MARK} row(s) behind — not a clean sweep`);
  return mine.length;
}

async function main() {
  assertSafeTarget();

  // The vacuity gate runs BEFORE anything is written: a fixture set that has stopped discriminating
  // should never reach an environment, because a vacuous pass is worse than no data at all.
  const designProblems = divergenceProblems(TASK_SPECS, new Date());
  if (designProblems.length) {
    console.error('ABORT: the task fixture set no longer satisfies its design contract:');
    for (const p of designProblems) console.error(`  - ${p}`);
    process.exit(2);
  }

  const token = await repToken();
  const gql = makeGql(token);
  log(`Owner rep: ${REP_EMAIL} (store ${STORE_ID}) — tasks are PRIVATE to this rep account`);

  await teardown(gql);
  if (TEARDOWN) { log('Teardown only — done.'); return; }

  const now = new Date();
  const writeback = {};
  const seeded = [];

  for (const spec of inCreationOrder(TASK_SPECS)) {
    const command = buildCreateCommand(spec, now);
    if (DRY_RUN) {
      log(`DRY RUN: would create ${spec.key.padEnd(4)} ${spec.priority.padEnd(6)} due=${command.dueDate} completed=${spec.completed}`);
      continue;
    }
    const created = (await gql(M_CREATE, { c: command }))?.createSalesRepTask;
    if (!created?.id) throw new Error(`createSalesRepTask returned no id for ${spec.key}`);
    // `createSalesRepTask` has NO `completed` input — completion is a SECOND call.
    if (spec.completed) await gql(M_STATUS, { c: { id: created.id, completed: true } });
    writeback[spec.alias] = { id: created.id, due_date: command.dueDate };
    seeded.push({ ...spec, id: created.id, dueDate: command.dueDate });
    log(`+ ${spec.key.padEnd(4)} ${spec.priority.padEnd(6)} due=${command.dueDate.slice(0, 16)}Z completed=${String(spec.completed).padEnd(5)} ${created.id}`);
  }

  if (DRY_RUN) { log('DRY RUN complete — nothing written.'); return; }

  // ── verify against what the SERVER actually persisted, not against what we sent ────────────────
  const live = await listSeeded(gql);
  if (live.length !== expectedTotal()) {
    throw new Error(`expected ${expectedTotal()} ${TASK_MARK} row(s) after seeding, the server reports ${live.length}`);
  }
  const sizes = groupSizes(live, now);
  const distinct = new Set(GROUP_NAMES.map((g) => sizes[g]));
  log(`Group sizes (from PERSISTED state): ${GROUP_NAMES.map((g) => `${g}=${sizes[g]}`).join(' ')}`);
  if (distinct.size !== GROUP_NAMES.length) {
    throw new Error('the persisted group sizes are not all distinct — a mis-wired filter could hide behind a plausible count');
  }
  // Completion must outrank the date in BOTH directions, checked on persisted rows.
  const dayStart = startOfUtcDay(now);
  const doneToday = live.filter((t) => t.completed === true && new Date(t.dueDate) >= dayStart && new Date(t.dueDate) < new Date(dayStart.getTime() + 86400000));
  const doneFuture = live.filter((t) => t.completed === true && new Date(t.dueDate) >= new Date(dayStart.getTime() + 86400000));
  if (!doneToday.length || !doneFuture.length) {
    throw new Error('persisted state lost the completed-due-today and/or completed-due-future straddle — completion can no longer be shown to outrank the date');
  }
  const sharedDayIso = dueDate({ dueOffsetDays: SHARED_DAY_OFFSET, dueHourUtc: 12 }, now).slice(0, 10);
  const sharedDay = live.filter((t) => String(t.dueDate).slice(0, 10) === sharedDayIso);
  if (sharedDay.length < 2) throw new Error(`the shared calendar day (+${SHARED_DAY_OFFSET}) persisted with ${sharedDay.length} task(s), not 2+`);

  // Group-size expectations are DATA a case reads via @td(SR_TASK_GROUPS.*) — never a literal in a
  // suite row. They are written per-env alongside the ids because they decay with them.
  const decaysAt = new Date(startOfUtcDay(now).getTime() + 86400000).toISOString();
  writeback[GROUPS_ALIAS] = {
    open_overdue: String(sizes.overdue),
    open_today: String(sizes.today),
    open_future: String(sizes.future),
    completed: String(sizes.completed),
    total: String(live.length),
    seeded_at: now.toISOString(),
    decays_at_utc: decaysAt,
    owner_rep_email: REP_EMAIL,
  };
  writeEnvAliasOverride(writeback);
  log(`Wrote ${Object.keys(writeback).length} alias override(s) to test-data/aliases.${TEST_ENV}.json`);

  log('');
  log(`DECAY: this fixture's "due today" group expires at ${decaysAt} (next UTC midnight).`);
  log('       After that, 2/3/5/4 becomes 5/0/5/4 SILENTLY. Re-seed before asserting group sizes.');
  log(`       Empty-day offsets (+${EMPTY_DAY_OFFSETS.join(', +')}) and the shared day (+${SHARED_DAY_OFFSET}) shift with it.`);
  log(`Seed complete — ${seeded.length} task(s) for ${REP_EMAIL}.`);
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
