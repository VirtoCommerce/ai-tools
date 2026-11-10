---
kind: test
budget: 12000
lede_max: 240
trim: "[QUESTIONS, SUGGESTED, BUGS]"
---
> [!{{ALERT}}] **{{ICON}} {{HEADLINE}}**
> {{LEDE}}

Tested on {{ENV}} · {{DATE}} · {{BUILD}} · {{TOTAL}} checks: {{PASSED}} passed, {{FAILED}} failed, {{BLOCKED}} blocked
{{?AS_USER}}
Signed in as {{AS_USER}}
{{/AS_USER}}

{{?TO_FIX}}
### What to fix and how to reproduce
| # | What is broken | How to reproduce | Expected → actual | Fix in |
|---|---|---|---|---|
{{/TO_FIX}}
{{#FIX_ROWS}}
{{{.}}}
{{/FIX_ROWS}}

{{#SHOTS}}
!{{.}}|width=700!
{{/SHOTS}}

{{?BUGS}}
### Filed as separate bugs
| What is wrong | Severity | Ticket |
|---|---|---|
{{/BUGS}}
{{#BUGS}}
| {{what}} | {{severity}} | {{ref}} |
{{/BUGS}}
{{#BUGS_MORE}}
| {{.}} | | |
{{/BUGS_MORE}}
{{?SUGGESTED}}
### Suggested as separate tickets (not created)
| What is wrong | Severity | Type |
|---|---|---|
{{/SUGGESTED}}
{{#SUGGESTED}}
| {{what}} | {{severity}} | {{type}} |
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

**Next step** {{NEXT_STEP}}
{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
