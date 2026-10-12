#!/usr/bin/env node
/**
 * seed-sales-rep-tasks.mjs — the Sales Rep TASK fixtures (VCST-5732 "[E2E] Sales Rep Task Management",
 * extended for VCST-6077 "Tasks page redesign"). 22 tasks in six groups of DIFFERENT sizes:
 * overdue / today / future / completed / canceled / dateless.
 *
 * The design contract these rows encode — and why collapsing any of it makes the feature's central
 * question undecidable — lives in `sales-rep-tasks-specs.mjs`, which is the single source of truth
 * for the rows, the relative-date derivation and the vacuity gate. This file is a thin
 * authenticate → teardown → create → complete/cancel → verify → write-back over it.
 *
 * ── DECAY WARNING — RE-SEED BEFORE ASSERTING GROUP SIZES ─────────────────────────────────────────
 * Due dates are WALL-CLOCK RELATIVE and computed at seed time. The browser classifies by its LOCAL
 * day, so the "today" rows stop being today at the browser's LOCAL MIDNIGHT (22:00Z for a CEST lane),
 * not at UTC midnight. Nothing errors and no guard fires at run time — the suite simply asserts the
 * wrong number. **Any suite that asserts group membership or group size must run this seeder first.**
 * The seeder prints and writes back (`SR_TASK_GROUPS.decays_at_utc`) the instant the fixture decays.
 *
 * ── THE BROWSER'S ZONE ───────────────────────────────────────────────────────────────────────────
 * The boundary rows (00:00 / 23:30 browser-local) and every count are computed in the zone the TEST
 * BROWSER runs in. The lane configs (`config/mcp-playwright-*.config.json`) pin no `timezoneId`, so
 * the browsers inherit the host's zone — which is what this seeder reads (`Intl` on the seeding host)
 * unless `BROWSER_TZ=<IANA zone>` overrides it (seeding for a lane on another machine).
 *
 * ── ISOLATION: per REP ACCOUNT ───────────────────────────────────────────────────────────────────
 * Tasks are private to their owning rep (confirmed live: another rep reads `totalCount: 0`), so this
 * set is isolated **per REP ACCOUNT** — not per run, not per suite. Two suites on the same rep see
 * each other's mutations. Re-running restores every designed state: it deletes EVERY AGENT-TEST-TASK
 * row the rep owns (whatever a tester did to it) and recreates all 22 from the spec.
 *
 * ── TRANSPORT ────────────────────────────────────────────────────────────────────────────────────
 * Rows are created, completed, listed and deleted through the SCOPED `/graphql/sales-rep` endpoint AS
 * THE OWNING REP (token needs `storeId` on the password grant). Two states the rep endpoint cannot
 * produce go through TaskManagement REST with the ADMIN token (seed-common `auth()`/`api()`):
 *   - DATELESS: `POST /api/task-management` with `dueDate: null` (createSalesRepTask requires dueDate);
 *     responsibleId/organizationId/storeId copied from a row the rep created in this run.
 *   - CANCELED: `POST /api/task-management/finish?id=…&completed=false` → isActive=false, completed=false.
 * Teardown stays on the rep endpoint — `deleteSalesRepTask` removes both kinds (confirmed live).
 *
 * ── CREDENTIALS (GOLDEN RULE — nothing hardcoded) ────────────────────────────────────────────────
 *   SALES_REP_EMAIL     — identity, committed in `.env.<env>` / `.env.defaults`
 *   SALES_REP_PASSWORD  — secret, ONLY in the gitignored `.env.local`, per-env suffixed
 *   ADMIN / ADMIN_PASSWORD, BACK_URL / STORE_ID — from the layered `.env` loader
 * All resolved through `process.env` AFTER the loader has run (never off one layer, never off the
 * curated `config.js` export — `.claude/rules/test-data.md` §Resolving a variable).
 *
 * Flags: --dry-run (reads only) · --verbose · --teardown (removes only AGENT-TEST-TASK rows)
 *
 * Run:      TEST_ENV=vcst npm run seed:sales-rep-tasks
 * Teardown: TEST_ENV=vcst npm run seed:sales-rep-tasks:teardown
 * Guard:    npm run td:validate:sales-rep-tasks
 */
import {
  assertSafeTarget, auth, api, log, verbose, writeEnvAliasOverride, verifyRemoved,
  DRY_RUN, TEARDOWN, BACK_URL, STORE_ID,
} from '../../lib/seed-common.mjs';
import {
  TASK_SPECS, TASK_MARK, GROUPS_ALIAS, GROUPS_NY_ALIAS, NEGATIVE_OFFSET_ZONE,
  SHARED_DAY_OFFSET, EMPTY_DAY_OFFSETS,
  buildCreateCommand, buildRestCreateBody, provisioningPath, inCreationOrder, classifyGroup,
  countExpectations, divergenceProblems, startOfLocalDay, localDayOffset, isValidZone,
  GROUP_NAMES, expectedTotal,
} from './sales-rep-tasks-specs.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const ENV_SUFFIX = TEST_ENV.toUpperCase();
const REP_EMAIL = process.env.SALES_REP_EMAIL;
const REP_PASSWORD = process.env.SALES_REP_PASSWORD;
const ENDPOINT = '/graphql/sales-rep';
const BROWSER_TZ = process.env.BROWSER_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

const M_CREATE = 'mutation($c:InputCreateSalesRepTask!){createSalesRepTask(command:$c){id name type priority dueDate completed createdDate}}';
const M_STATUS = 'mutation($c:InputChangeSalesRepTaskStatus!){changeSalesRepTaskStatus(command:$c){id completed}}';
const M_DELETE = 'mutation($c:InputDeleteSalesRepTask!){deleteSalesRepTask(command:$c)}';
const Q_LIST = '{salesRepTasks(first:200){totalCount items{id name type priority dueDate completed isActive createdDate}}}';

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

/** Every AGENT-TEST-TASK row currently owned by this rep (canceled and dateless rows included). */
async function listSeeded(gql) {
  const d = await gql(Q_LIST);
  return (d?.salesRepTasks?.items || []).filter((t) => String(t.name || '').startsWith(TASK_MARK));
}

/**
 * Teardown = delete every AGENT-TEST-TASK row this rep owns, and nothing else.
 * Idempotency here is TEARDOWN-THEN-SEED rather than find-or-create on purpose: a task's group
 * membership is a function of its dueDate, which is recomputed on every run, and a tester may have
 * completed/reopened/edited any row — a "reuse if present" path would keep that drift.
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

const fmtCounts = (c) => `overdue=${c.open_overdue} today=${c.open_today} future=${c.open_future} completed=${c.completed} canceled=${c.canceled} dateless=${c.dateless} | chips Today(excl. canceled)=${c.today_scope_excl_canceled} Upcoming=${c.chip_upcoming} Overdue=${c.chip_overdue} Completed=${c.chip_completed} All=${c.chip_all} (All-tabs=${c.all_minus_tabs})`;
const stringify = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));

async function main() {
  assertSafeTarget();
  if (!isValidZone(BROWSER_TZ)) throw new Error(`BROWSER_TZ "${BROWSER_TZ}" is not a valid IANA zone`);

  // The vacuity gate runs BEFORE anything is written, AT THE SEED INSTANT IN THE BROWSER'S ZONE: a
  // fixture set that has stopped discriminating should never reach an environment, because a vacuous
  // pass is worse than no data at all (e.g. 00:00Z–04:00Z, when New York's date is still yesterday).
  const now = new Date();
  const designProblems = divergenceProblems(TASK_SPECS, now, BROWSER_TZ);
  if (designProblems.length) {
    console.error(`ABORT: at ${now.toISOString()} in ${BROWSER_TZ} the task fixture set no longer satisfies its design contract:`);
    for (const p of designProblems) console.error(`  - ${p}`);
    process.exit(2);
  }

  const token = await repToken();
  const gql = makeGql(token);
  log(`Owner rep: ${REP_EMAIL} (store ${STORE_ID}) — tasks are PRIVATE to this rep account`);
  log(`Browser zone: ${BROWSER_TZ} — local today = [${startOfLocalDay(now, BROWSER_TZ).toISOString()}, ${startOfLocalDay(now, BROWSER_TZ, 1).toISOString()})`);

  await teardown(gql);
  if (TEARDOWN) { log('Teardown only — done.'); return; }

  await auth(); // admin token — dateless create + cancel go through TaskManagement REST

  const writeback = {};
  let owner = null; // copied from the first row the rep creates

  for (const spec of inCreationOrder(TASK_SPECS)) {
    const path = provisioningPath(spec);
    const command = buildCreateCommand(spec, now, BROWSER_TZ);
    if (DRY_RUN) {
      log(`DRY RUN: would create ${spec.key.padEnd(4)} via ${path.create.padEnd(11)} due=${command.dueDate ?? 'null'} completed=${spec.completed}${spec.canceled ? ' then CANCEL' : ''}`);
      continue;
    }
    let id;
    if (path.create === 'rep-graphql') {
      id = (await gql(M_CREATE, { c: command }))?.createSalesRepTask?.id;
      if (id && !owner) {
        const t = await api('GET', `/api/task-management/${id}`);
        owner = { responsibleId: t.responsibleId, responsibleName: t.responsibleName, organizationId: t.organizationId, storeId: t.storeId };
        verbose(`owner from ${id}: responsibleId=${owner.responsibleId} organizationId=${owner.organizationId}`);
      }
    } else {
      if (!owner?.responsibleId) throw new Error(`${spec.key}: no rep-created row to copy the owner from — creationOrder must put a rep-graphql row first`);
      id = (await api('POST', '/api/task-management', buildRestCreateBody(spec, owner, now, BROWSER_TZ)))?.id;
    }
    if (!id) throw new Error(`${path.create} create returned no id for ${spec.key}`);
    // `createSalesRepTask` has NO `completed` input — completion is a SECOND call.
    if (path.complete) await gql(M_STATUS, { c: { id, completed: true } });
    // Closed WITHOUT completing — the only way to get the client's `canceled`. Body `{}` is required (no body → 415).
    if (path.cancel) await api('POST', `/api/task-management/finish?id=${encodeURIComponent(id)}&completed=false`, {});
    writeback[spec.alias] = { id, due_date: command.dueDate ?? '' };
    log(`+ ${spec.key.padEnd(4)} ${spec.priority.padEnd(6)} due=${(command.dueDate ?? 'null').padEnd(24)} ${classifyGroup(spec, now, BROWSER_TZ).padEnd(9)} ${id}`);
  }

  if (DRY_RUN) { log('DRY RUN complete — nothing written.'); return; }

  // ── verify against what the SERVER actually persisted, not against what we sent ────────────────
  const live = await listSeeded(gql);
  if (live.length !== expectedTotal()) {
    throw new Error(`expected ${expectedTotal()} ${TASK_MARK} row(s) after seeding, the server reports ${live.length}`);
  }
  // Every row must land in its DESIGNED group, read the way the browser reads it.
  const byId = new Map(live.map((t) => [t.id, t]));
  const misplaced = [];
  for (const spec of TASK_SPECS) {
    const row = byId.get(writeback[spec.alias].id);
    if (!row) { misplaced.push(`${spec.key}: id ${writeback[spec.alias].id} not listed for the rep`); continue; }
    const want = classifyGroup(spec, now, BROWSER_TZ); const got = classifyGroup(row, now, BROWSER_TZ);
    if (want !== got) misplaced.push(`${spec.key}: designed "${want}", persisted as "${got}" (dueDate=${row.dueDate} completed=${row.completed} isActive=${row.isActive})`);
  }
  if (misplaced.length) throw new Error(`persisted rows left their designed groups:\n  ${misplaced.join('\n  ')}`);

  const counts = countExpectations(live, now, BROWSER_TZ);
  log(`Counts (PERSISTED, ${BROWSER_TZ}): ${fmtCounts(counts)}`);
  const GROUP_COUNT_KEYS = ['open_overdue', 'open_today', 'open_future', 'completed', 'canceled', 'dateless'];
  if (GROUP_COUNT_KEYS.length !== GROUP_NAMES.length) throw new Error('GROUP_COUNT_KEYS is out of step with GROUP_NAMES');
  if (new Set(GROUP_COUNT_KEYS.map((k) => counts[k])).size !== GROUP_COUNT_KEYS.length) {
    throw new Error('the persisted group sizes are not all distinct — a mis-wired filter could hide behind a plausible count');
  }
  // The shared calendar day (+7) still carries 2+ rows and the six after it none, as LOCAL days.
  const perDay = new Map();
  for (const t of live.filter((r) => r.dueDate)) {
    const off = localDayOffset(new Date(t.dueDate), now, BROWSER_TZ);
    perDay.set(off, (perDay.get(off) || 0) + 1);
  }
  if ((perDay.get(SHARED_DAY_OFFSET) || 0) < 2) throw new Error(`the shared calendar day (+${SHARED_DAY_OFFSET}) persisted with ${perDay.get(SHARED_DAY_OFFSET) || 0} task(s), not 2+`);
  for (const off of EMPTY_DAY_OFFSETS) if (perDay.get(off)) throw new Error(`empty day +${off} persisted with ${perDay.get(off)} task(s)`);

  const countsNy = countExpectations(live, now, NEGATIVE_OFFSET_ZONE);
  log(`Counts (PERSISTED, ${NEGATIVE_OFFSET_ZONE}): ${fmtCounts(countsNy)}`);

  // Count expectations are DATA a case reads via @td(SR_TASK_GROUPS.*) — never a literal in a suite
  // row. They are written per-env alongside the ids because they decay with them.
  const decaysAt = startOfLocalDay(now, BROWSER_TZ, 1).toISOString();
  writeback[GROUPS_ALIAS] = {
    ...stringify(counts),
    seeded_at: now.toISOString(),
    decays_at_utc: decaysAt,
    owner_rep_email: REP_EMAIL,
    browser_tz: BROWSER_TZ,
  };
  writeback[GROUPS_NY_ALIAS] = {
    ...stringify(countsNy),
    seeded_at: now.toISOString(),
    decays_at_utc: startOfLocalDay(now, NEGATIVE_OFFSET_ZONE, 1).toISOString(),
  };
  writeEnvAliasOverride(writeback);
  log(`Wrote ${Object.keys(writeback).length} alias override(s) to test-data/aliases.${TEST_ENV}.json`);

  log('');
  log(`DECAY: the "today" rows stop being today at ${decaysAt} (local midnight, ${BROWSER_TZ}).`);
  log('       After that every count above is wrong SILENTLY. Re-seed before asserting group sizes.');
  log(`Seed complete — ${live.length} task(s) for ${REP_EMAIL}.`);
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
