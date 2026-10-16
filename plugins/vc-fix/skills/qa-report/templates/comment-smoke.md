---
kind: smoke
budget: 900
lede_max: 200
trim: "[QUESTIONS, FAILURES, BUGS]"
---
## {{ICON}} Smoke {{VERDICT_LABEL}} — {{RUN_ID}}
{{LEDE}}

**Env** {{ENV}} · {{DATE}} · **Gates** {{GATES}}
**Cases** {{PASSED}}/{{TOTAL}} passed · {{FAILED}} failed · {{BLOCKED}} blocked

{{?FAILURES}}
### Failed / blocked
| Case | Result | What it checks |
|---|---|---|
{{/FAILURES}}
{{#FAILURES}}
| `{{id}}` | {{result}} | {{title}} |
{{/FAILURES}}
{{#FAILURES_MORE}}
| {{.}} | | |
{{/FAILURES_MORE}}

### Bugs
| Ticket | What is wrong |
|---|---|
{{#BUGS}}
| {{key}} | {{what}} |
{{/BUGS}}
{{#BUGS_MORE}}
| {{.}} | |
{{/BUGS_MORE}}
{{^BUGS}}
| None | |
{{/BUGS}}
{{?QUESTIONS}}
### Open questions
{{/QUESTIONS}}
{{#QUESTIONS}}
- {{.}}
{{/QUESTIONS}}
{{#QUESTIONS_MORE}}
- {{.}}
{{/QUESTIONS_MORE}}

{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
