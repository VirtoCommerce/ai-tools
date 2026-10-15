---
kind: test
budget: 1500
lede_max: 240
trim: "[BUGS, NOT_FILED, AREAS]"
---
## {{ICON}} QA {{VERDICT_LABEL}} — {{TICKET}}
{{LEDE}}

| Where we tested | |
|---|---|
| **Environment** | {{ENV}} |
| **Artifact** | {{BUILD}} |
| **Signed in as** | {{AS_USER}} |
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

**AC coverage** {{AC_COVERAGE}} · **DoD** {{DOD}}
**Regression** {{REGRESSION}}
**Business rules** {{BL}}

### New regression coverage
{{NEW_CASES}}

### Findings
| What is wrong | Severity | Ticket |
|---|---|---|
{{#BUGS}}
| {{what}} | {{severity}} | {{key}} ({{relation}}) |
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

**Release gate** {{RELEASE_GATE}} · **Release note** {{RELEASE_NOTE}}
{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
