# Posting a review

Read this only when the user has explicitly asked to post the review to GitHub (`SKILL.md` Step 7).

- Asked to post: submit a formal **review**, never `gh pr comment`. An issue comment lands in the
  conversation tab; it does **not** clear the user's "Review requested" state or move
  `reviewDecision`. Only a submitted review of any type resolves the request. Ask which type first:
  `COMMENT` is neutral (clears the request, no approval), `APPROVE` also lifts the merge gate,
  `REQUEST_CHANGES` blocks merge.
- **Hybrid layout, one review event.** Anchor line-specific findings as inline comments; keep
  cross-cutting and design findings in the summary body, where a single line anchor would
  misrepresent them. Post both in one call:
  ```bash
  gh api --method POST repos/VirtoCommerce/<repo>/pulls/<pr>/reviews --input <scratch>/review.json
  # review.json: { "commit_id": "<headRefOid>", "event": "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
  #   "body": "<verdict + cross-cutting findings>",
  #   "comments": [ { "path": "src/…", "line": <n>, "side": "RIGHT", "body": "<finding>" }, … ] }
  ```
  `line` + `side: RIGHT` anchors to the new-file line; a line outside every diff hunk is rejected
  with 422. `gh pr review --body-file` carries only the summary body and cannot anchor lines, so use
  it only when every finding is cross-cutting. To add inline threads after a summary was already
  posted (a submitted review body cannot be edited), post a second `COMMENT` review carrying only
  `comments`.
- **Verify delivery by the anchored code, not by a field.** A review can post with comments silently
  dropped, so check:
  ```bash
  gh api repos/VirtoCommerce/<repo>/pulls/<pr>/reviews/<review-id>/comments \
    --jq '.[] | "\(.path|split("/")|last):\(.position)  <-  \(.diff_hunk|split("\n")|.[-1])"'
  ```
  Each row must show the line you meant to annotate. **Do not test `.line`**: this endpoint reports
  the anchor in `position` and leaves `line` and `side` `null` even on a correctly delivered comment,
  so a `select(.line == null)` check reports every comment as dropped. `diff_hunk` is the only field
  that shows what the comment actually attached to.
- Then confirm the request cleared:
  `gh pr view <pr> --repo VirtoCommerce/<repo> --json reviewRequests,reviewDecision,latestReviews`
  — a requested reviewer must be gone from `reviewRequests`.
- **A listing endpoint that paginates lies by omission.** `…/pulls/<pr>/reviews` without
  `--paginate` can omit the review you posted a minute ago, and the empty result reads as "it never
  landed". Add `--paginate`, or query the review by id.
