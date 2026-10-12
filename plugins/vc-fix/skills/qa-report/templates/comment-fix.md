---
kind: fix
budget: 1200
lede_max: 280
trim: [BEFORE_AFTER, ISSUES, BUGS]
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

**Regressions / side effects**
{{#ISSUES}}
- {{.}}
{{/ISSUES}}
{{#ISSUES_MORE}}
- {{.}}
{{/ISSUES_MORE}}
{{^ISSUES}}
- None
{{/ISSUES}}
**Bugs filed** {{#BUGS}}{{key}} {{/BUGS}}{{#BUGS_MORE}}{{.}}{{/BUGS_MORE}}{{^BUGS}}None{{/BUGS}}
**Business rules** {{BL}}
{{#PAGE_URL}}
**Report** [open the before/after page]({{.}})
{{/PAGE_URL}}
