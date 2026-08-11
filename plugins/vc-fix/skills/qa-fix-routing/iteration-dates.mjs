/**
 * skills/qa-fix-routing/iteration-dates.mjs
 *
 * Pure date-range validation for an Azure Boards team ITERATION (sprint). Shared by:
 *   - ado.mjs                          (resolveCurrentIteration — stamp System.IterationPath at
 *                                       bug-create time, and scope list-parent-candidates)
 *   - project-init/discover-tracker.mjs (pick the team that OWNS a date-valid current sprint)
 * so the runtime resolve and the onboarding discovery can never disagree about what "current" means.
 *
 * WHY validate dates instead of trusting `$timeframe=current`: Azure DevOps still flags an
 * iteration as `attributes.timeFrame:"current"` even when NO iteration brackets today (a dormant
 * team's last sprint keeps the flag). Trusting the flag stamped a 3-year-dead "Sprint 12.5 Launch"
 * onto an OPUS bug. An iteration is current ONLY when startDate <= today <= finishDate.
 *
 * CRITICAL — compare DATE-ONLY. finishDate is stored at `T00:00:00Z` (a midnight timestamp for the
 * sprint's last calendar day), so a raw `new Date(finish) >= now` timestamp compare wrongly REJECTS
 * the sprint on its final day. Both sides are normalised to `YYYY-MM-DD` and compared lexically, so
 * the whole finish day is inclusive (finishDate treated as end-of-day). `today` is the LOCAL
 * calendar date — sprint date labels are timezone-agnostic calendar days, and using UTC risks a
 * midnight rollover rejecting a sprint that is still current in the operator's own day.
 *
 * Pure + side-effect-free: no network, no fs, no process.env.
 */

/** Extract the leading `YYYY-MM-DD` from an ADO date string (`2026-08-11T00:00:00Z` → `2026-08-11`). */
export function iterationDateOnly(s) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s ?? ""));
  return m ? m[1] : "";
}

/** Today's LOCAL calendar date as `YYYY-MM-DD` (not UTC — see the header on the rollover edge). */
export function localTodayYMD(d = new Date()) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/**
 * Is this iteration current for `today`? True ONLY when its date range brackets today, compared
 * DATE-ONLY (finish day inclusive). Missing/unparsable start OR finish ⇒ false (a sprint with no
 * dates is never treated as current — that is the dormant-team case this guards against).
 * @param {{attributes?:{startDate?:string,finishDate?:string}}} iteration
 * @param {string} [today]  YYYY-MM-DD; defaults to the local calendar date
 */
export function isIterationCurrent(iteration, today = localTodayYMD()) {
  const a = (iteration && iteration.attributes) || {};
  const start = iterationDateOnly(a.startDate);
  const finish = iterationDateOnly(a.finishDate);
  if (!start || !finish) return false;
  return start <= today && today <= finish;
}

/** "YYYY-MM-DD..YYYY-MM-DD" for an iteration's range — for loud errors / onboarding notes. */
export function iterationRange(iteration) {
  const a = (iteration && iteration.attributes) || {};
  return `${iterationDateOnly(a.startDate) || "?"}..${iterationDateOnly(a.finishDate) || "?"}`;
}

/**
 * The SHARED team-selection decision, extracted so the runtime resolver (ado.mjs
 * `resolveCurrentIteration`) and the onboarding scan (discover-tracker.mjs `discoverTeam`) apply the
 * SAME ambiguity rule — the leaf date-predicate was already shared, but the selection control-flow
 * around it used to be copy-pasted and could drift. Each caller does its own network fan-out to build
 * `matches` (a team + its date-valid current iteration), then hands the list here.
 *
 * Dedupe by iteration PATH first: several teams can SHARE one current sprint, and if every match
 * resolves to the same path there is no real ambiguity — the stamped System.IterationPath is
 * identical either way. Only DISTINCT current sprints across teams are a genuine "pick one".
 *
 * @param {Array<{team:string, iteration:{id?:string,name?:string,path:string}}>} matches
 * @returns {{ ok:boolean, ambiguous:boolean, team?:string, iteration?:Object,
 *            matches:Array, distinctPaths:string[] }}
 *   ok:true  → exactly one distinct sprint (team/iteration are the pick)
 *   ambiguous:true → >1 distinct sprint (caller must ask for a --team)
 *   ok:false & !ambiguous → no team had a date-valid current sprint
 */
export function selectTeamWithCurrentSprint(matches) {
  const list = (Array.isArray(matches) ? matches : []).filter((m) => m && m.iteration && m.iteration.path);
  const distinctPaths = [...new Set(list.map((m) => m.iteration.path))];
  if (list.length >= 1 && distinctPaths.length === 1) {
    return { ok: true, ambiguous: false, team: list[0].team, iteration: list[0].iteration, matches: list, distinctPaths };
  }
  if (distinctPaths.length > 1) {
    return { ok: false, ambiguous: true, matches: list, distinctPaths };
  }
  return { ok: false, ambiguous: false, matches: [], distinctPaths: [] };
}
