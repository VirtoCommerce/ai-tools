---
kind: test
budget: 1500
lede_max: 240
trim: "[NOT_FILED, AREAS, QUESTIONS, BUGS]"
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

### What was tested
| Area | Cases | Result |
|---|---|---|
{{#AREAS}}
| {{area}} | {{cases}} | {{result}} |
{{/AREAS}}
{{#AREAS_MORE}}
| {{.}} | | |
{{/AREAS_MORE}}
{{^AREAS}}
| Everything in the checklist | {{TOTAL}} | {{PASSED}} passed · {{FAILED}} failed · {{BLOCKED}} blocked |
{{/AREAS}}

{{#AC_DOD}}
**Acceptance** {{.}}
{{/AC_DOD}}
**Regression** {{REGRESSION}}

### New regression coverage
{{NEW_CASES}}

### Findings
| What is wrong | Severity | Ticket |
|---|---|---|
{{#BUGS}}
| {{what}} | {{severity}} | {{ref}} |
{{/BUGS}}
{{#BUGS_MORE}}
| {{.}} | | |
{{/BUGS_MORE}}
{{^BUGS}}
| Nothing filed | | |
{{/BUGS}}

**Not filed (below severity floor)**
{{#NOT_FILED}}
- [{{severity}}] {{title}}
{{/NOT_FILED}}
{{#NOT_FILED_MORE}}
- {{.}}
{{/NOT_FILED_MORE}}
{{^NOT_FILED}}
- None
{{/NOT_FILED}}

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
