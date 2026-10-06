# VCST-5850 — Testing checklist (Artifact PASS | subtitle "Reaches every member of <ACME>"; Title·Message*·Send via* — fe-P1-profile-send-modal.png PASS | disabled w/o channel and on whitespace-only message PASS | organizationIds:[ACME] only, legacy arg not sent; toast "Your message has been sent." — fe-P3-profile-send-toast.png PASS | marker P3-k7q2x: ACME buyer 1 hit, TechFlow 0, rep 0 (pushMessages) PASS | 14 journal emails = 14 distinct emailable members, rep absent (env: transport fails, see notes) PASS | BuildRight draft → cancel → TechFlow: subtitle/request = TechFlow, field empty — fe-M1-row-Y-subtitle-no-stale.png PASS | organizationIds:[TechFlow], push only; 1 push (6 members, rep excl.), 0 emails PASS | organizationIds:[ACME], email only; 14 emails, 0 push PASS | ONE ChangeWishlist add:[ACME,TechFlow] + ONE send organizationIds:[ACME,TechFlow]; toast "List shared with 2 customers." — fe-S1-share-two-orgs-before-save.png PASS | note + /shared-list/<key>; 17 push members = 17 emails = union minus rep PASS | default "Hi! I’ve just shared the list …" + link delivered; sharingSetting.message null PASS | send carried organizationIds:[BuildRight] only; old recipients 0 hits PASS | no send; message persisted and shown on reopen PASS | confirm "Change who can access?"; removeSharedWithIds only, no send PASS | cut at 250, counter 250/250 — fe-S7-message-250-cap.png PASS | contact in both orgs: 1 memberId, 1 inbox item PASS | succeeded/pushSent/emailSent true; 1 push, 17 members = union minus rep PASS | fixture + 2 pre-existing dual-org contacts appear once PASS | legacy organizationId alone works (6 members) PASS | X + [X, X upper] → 1 record, 0 duplicates PASS | 4 mixed variants → Forbidden, data null, no push/journal PASS | [], omitted, [""], "" → "Organization is required." (whitespace id → Forbidden, Low) PASS | 1001 → cap error; 1000 → Forbidden; dup/legacy counted distinct PASS | rep-only → NoRecipients; + ACME → ACME minus rep PASS | channel / message / 1000-1001 chars / anon / buyer token all as specified; validation before auth PASS | no app console errors; GraphQL errors only env 401s; P3 send 2.3 s ||||||||||||||||||||||||||B)

**Ticket:** [Sales Rep hub] Send push/email to multiple customers · Story · Testing · parent VCST-5142
**Env:** vcptcore-qa · store `B2B-store` · Platform 3.1076.0
**Build under test (deployed = PR heads, all OPEN/unmerged):** SalesRep `3.1012.0-pr-21-8964` · XCart `3.1038.0-pr-141-b404` · Cart `3.1011.0-pr-194-8331` · theme `2.59.0-pr-2476-0abb` (vc-frontend #2476, VCST-5707)
**Scope (set by the operator 2026-10-06):** the push/email dispatch from three entry points —
(1) Customer profile → Quick actions → **Send email**; (2) My customers → row **envelope**;
(3) List **Share → Specific customers** (message + notification to the newly added organizations).
**Out of scope (operator):** the ticket's To-Be multi-select "Customers" field inside the *Send a message*
popup — it is not implemented in any vc-frontend branch (the deployed theme only changed the call to
`organizationIds: [props.organizationId]`). Recorded as a finding at 5-verdict, not tested.

**Oracles:** no `BL-SR-*` invariant covers communication (sr.yaml = statistics/layout) → `{SPEC}` = PR #21 /
#2476 descriptions + diff; `{OBSERVED}` = kb `KB-EFD1A7FD`, `KB-50D03D62`, `KB-A98E467C`, `KB-20F8350F`,
`KB-40FCBAE6` (re-observe, then confirm/dispute). Contract: `organizationId` kept (deprecated) and unioned with
`organizationIds` (distinct, case-insensitive) · ≥1 and ≤1000 orgs · rep must serve **all** (else Forbidden,
nothing sent) · recipients deduplicated by member · initiator excluded · zero recipients → `NoRecipients`.

**Data:** rep `@td(SR_REP_PRIMARY)` (serves `@td(ORG_ACME)`, `@td(ORG_TECHFLOW)`, `@td(ORG_BUILDRIGHT)`,
`@td(ORG_ACMEWEST)`); reader `@td(ACME_BUYER)` (grant `organization_id=@td(ORG_ACME.platform_id)`);
`@td(SR_REP_EXCLUSIVE_TECHFLOW)` as a TechFlow member; `@td(SR_UNSERVED_ORG)`; `@td(ORG_REP_ONLY)`.
Created in case: `AGENT-TEST-5850` contact+user in ACME **and** TechFlow (dedup), deleted in Cleanup.
Every message body carries a unique `AGENT-TEST-5850-<case>-<rand>` marker — delivery is asserted by marker, never by count.

| # | Condition | Lane | Verdict | Evidence |
|---|---|---|---|---|
| **P — Customer profile → Quick actions → Send email** |||||
| P1 | Tile opens *Send a message*; subtitle names the profile's own org; Title · Message* · Send via* (Email, Push) | FE | PASS | subtitle names the profile org; Title·Message*·Send via* — fe-P1-profile-send-modal.png |
| P2 | Send disabled until Message filled AND ≥1 channel | FE | PASS | disabled without channel and on whitespace-only message |
| P3 | Send (Email+Push) → success toast, modal closes; request = `sendCustomerCommunication` with `organizationIds:[<this org>]` (exactly one) | FE | PASS | organizationIds:[ACME] only, legacy arg not sent; toast "Your message has been sent." — fe-P3-profile-send-toast.png |
| P4 | A member of that org receives the push (marker in `pushMessages` / header bell); the rep does not | FE | PASS | marker P3-k7q2x: ACME buyer 1 hit, TechFlow 0, rep 0 (pushMessages) |
| P5 | Email: a `SalesRepMessageEmailNotification` per emailable member, rep excluded (admin notification journal) | BE | PASS | 14 journal emails = 14 distinct emailable members, rep absent (env: transport fails — see summary) |
| **M — My customers → envelope** |||||
| M1 | Envelope on row X opens the modal for X; then row Y → subtitle Y (not stale X) | FE | PASS | BuildRight draft → cancel → TechFlow: subtitle + request = TechFlow, field empty — fe-M1-row-Y-subtitle-no-stale.png |
| M2 | Push-only send → request `organizationIds:[Y]`, `sendEmail:false`; member of Y gets the push, no email | FE+BE | PASS | organizationIds:[TechFlow], push only; 1 push (6 members, rep excl.), 0 emails |
| M3 | Email-only send → email logged, no push | FE+BE | PASS | organizationIds:[ACME], email only; 14 emails, 0 push |
| **S — List Share → Specific customers** |||||
| S1 | New list shared with 2 orgs + message → ONE `sendCustomerCommunication`, `organizationIds` = both | FE | PASS | ONE ChangeWishlist add:[ACME,TechFlow] + ONE send organizationIds:[ACME,TechFlow]; toast "List shared with 2 customers." — fe-S1-share-two-orgs-before-save.png |
| S2 | Members of both orgs get push = message + `/shared-list/<key>` link; email logged; rep excluded | FE+BE | PASS | note + /shared-list/<key>; 17 push members = 17 emails = union minus rep |
| S3 | Shared with no message → default text + link is sent | FE | PASS | default "Hi! I've just shared the list …" + link delivered; sharingSetting.message null |
| S4 | Add a 3rd org to an existing share → call carries ONLY the new org; old recipients not re-notified | FE | PASS | send carried organizationIds:[BuildRight] only; old recipients 0 hits |
| S5 | Message-only edit → no `sendCustomerCommunication`; message persisted (`sharingSetting.message`) | FE | PASS | no send; message persisted, shown on reopen |
| S6 | Remove a recipient → no communication sent | FE | PASS | "Change who can access?" confirm; removeSharedWithIds only, no send |
| S7 | Message counter 0/250, 251st char refused | FE | PASS | cut at 250, counter 250/250 — fe-S7-message-250-cap.png |
| S8 | A contact in both targeted orgs receives the share push ONCE | BE | PASS | contact in both orgs: 1 memberId, 1 inbox item |
| **A — API contract (`/graphql/sales-rep`, as the rep)** |||||
| A1 | `organizationIds:[ACME,TechFlow]` → succeeded/pushSent/emailSent true; members of both get it | BE | PASS | succeeded/pushSent/emailSent true; 1 push, 17 members = union minus rep |
| A2 | Contact in both orgs → exactly one push + one email (dedup) | BE | PASS | fixture + 2 pre-existing dual-org contacts appear once |
| A3 | Legacy `organizationId` alone still works (deprecated, backward compatible) | BE | PASS | legacy organizationId alone works (6 members) |
| A4 | `organizationId:X` + `organizationIds:[X, x-uppercased]` → one delivery per member | BE | PASS | X + [X, X upper] → 1 record, 0 duplicates |
| A5 | `[served, unserved]` → Forbidden, NOTHING delivered to the served org | BE | PASS | 4 mixed variants → Forbidden, data null, no push/journal |
| A6 | `organizationIds:[]` and no legacy id → "Organization is required." | BE | PASS | [], omitted, [""], "" → "Organization is required." (whitespace-only id → Forbidden, Low) |
| A7 | 1001 ids → "must not target more than 1000"; 1000 ids → passes count validation (then Forbidden) | BE | PASS | 1001 → cap error; 1000 → Forbidden; dup/legacy counted distinct |
| A8 | `[ORG_REP_ONLY]` → succeeded false, warnings `NoRecipients`; `[ORG_REP_ONLY, ACME]` → delivered to ACME | BE | PASS | rep-only → NoRecipients; + ACME → ACME minus rep |
| A9 | Neither channel / empty message / 1001-char message / anonymous → existing contract (050m SR-GQL-045…049) holds | BE | PASS | channel / message / 1000-1001 chars / anon / buyer token as specified; validation before auth |
| **X — always-on** |||||
| X1 | No app-origin console errors / GraphQL `errors[]` inside 200 on the three flows | FE | PASS | no app console errors; GraphQL errors only env 401s; P3 send 2.3 s |

**Result: 26/26 PASS** — FE `qa-frontend-expert` (playwright-chrome) 00:52–01:06Z, BE `qa-backend-expert` (API) 00:52–01:00Z, 2026-10-06. Not tested by operator decision: the To-Be multi-select inside *Send a message* (not implemented).

**Existing coverage (2a, inline):** `050m` SR-GQL-042…05x · `089` SR-FE-031…041 · `091` SR-CP-024…027 ·
`007` list sharing — all still executable (legacy arg kept) ⇒ `CONFIRMED`, no REPAIR/RE-BASE. No case
exercises multi-org `organizationIds`, dedup, or the 1000 cap → gap (see summary).
