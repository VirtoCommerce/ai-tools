---
kind: fix
budget: 1600
lede_max: 280
trim: "[QUESTIONS, BEFORE_AFTER, ISSUES, BUGS]"
---
## {{ICON}} Fix {{VERDICT_LABEL}} — {{TICKET}}
{{LEDE}}

**Build** {{BUILD}} · **Env** {{ENV}} · {{DATE}}
**STR** {{STR}} · **Checklist** {{PASSED}}/{{TOTAL}} passed · **Baseline** {{BASELINE}}

{{?BEFORE_AFTER}}
| Check | Before fix | After fix |
|---|---|---|
{{/BEFORE_AFTER}}
{{#BEFORE_AFTER}}
| {{check}} | {{before}} | {{after}} |
{{/BEFORE_AFTER}}
{{#BEFORE_AFTER_MORE}}
| {{.}} | | |
{{/BEFORE_AFTER_MORE}}
{{^BEFORE_AFTER}}
No before/after pair recorded.
{{/BEFORE_AFTER}}

{{#SHOTS}}
!{{.}}|width=700!
{{/SHOTS}}

### Regressions / side effects
| What is wrong | Severity | Ticket |
|---|---|---|
{{#ISSUES}}
| {{what}} | {{severity}} | {{ticket}} |
{{/ISSUES}}
{{#ISSUES_MORE}}
| {{.}} | | |
{{/ISSUES_MORE}}
{{^ISSUES}}
| {{ISSUES_NONE}} | | |
{{/ISSUES}}

### Bugs filed
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
**Report** [open the before/after page]({{.}})
{{/PAGE_URL}}
