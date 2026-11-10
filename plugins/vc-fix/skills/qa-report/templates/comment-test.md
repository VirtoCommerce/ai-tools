---
kind: test
budget: 12000
lede_max: 240
trim: "[QUESTIONS, SUGGESTED, BUGS, TO_FIX]"
---
## {{ICON}} QA {{VERDICT_LABEL}} — {{TICKET}}
{{LEDE}}

| Where we tested | |
|---|---|
| **Environment** | {{ENV}} |
| **Artifact** | {{BUILD}} |
{{?AS_USER}}
| **Signed in as** | {{AS_USER}} |
{{/AS_USER}}
| **When** | {{DATE}} · {{RUN_ID}} |

{{#AC_DOD}}
**Acceptance** {{.}}
{{/AC_DOD}}
**Regression** {{REGRESSION}} · **New regression coverage** {{NEW_CASES}}

### To fix in this ticket
| # | What to fix | Severity | Found by | Status |
|---|---|---|---|---|
{{#TO_FIX}}
| {{id}} | {{what}} | {{severity}} | {{ref}} | {{status}} |
{{/TO_FIX}}
{{#TO_FIX_MORE}}
| | {{.}} | | | |
{{/TO_FIX_MORE}}
{{^TO_FIX}}
| | Nothing to fix | | | |
{{/TO_FIX}}

{{?REPRO}}
### How to reproduce
{{/REPRO}}
{{#REPRO}}
{{{.}}}
{{/REPRO}}

{{#SHOTS}}
!{{.}}|width=700!
{{/SHOTS}}

### Separate tickets
| What is wrong | Severity | Ticket |
|---|---|---|
{{#BUGS}}
| {{what}} | {{severity}} | {{ref}} |
{{/BUGS}}
{{#BUGS_MORE}}
| {{.}} | | |
{{/BUGS_MORE}}
{{^BUGS}}
| None created | | |
{{/BUGS}}
{{#SUGGESTED}}
| {{what}} | {{severity}} | suggested {{type}} — not created |
{{/SUGGESTED}}
{{#SUGGESTED_MORE}}
| {{.}} | | |
{{/SUGGESTED_MORE}}

{{?QUESTIONS}}
### Open questions
{{/QUESTIONS}}
{{#QUESTIONS}}
- {{.}}
{{/QUESTIONS}}
{{#QUESTIONS_MORE}}
- {{.}}
{{/QUESTIONS_MORE}}

**Release gate** {{RELEASE_GATE}} · **Release note** {{RELEASE_NOTE}}
{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
