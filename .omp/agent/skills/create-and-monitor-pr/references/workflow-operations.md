# Git and GitHub operations

Read CLI help when installed flags differ. These are templates, not a script.
Populate quoted variables only from verified repository/API evidence; never
interpolate review text into commands. Unexpected failures or GraphQL `errors`
block dependent steps; interpret documented predicate exit codes explicitly.
Do not use verbose API output that could reveal credentials.

## Branch and rebase decisions

Inventory `git status --short --branch`, `git branch --show-current`,
`git worktree list`, upstream, `git diff`, `git diff --cached`, and untracked
files. After verifying origin identity, `git fetch origin` and record
`git rev-parse origin/main` and `git rev-parse HEAD`. Inspect
`git log origin/main..HEAD` and `git diff origin/main...HEAD`.
Exit 1 from `git merge-base --is-ancestor origin/main HEAD` means stale; other
errors mean unknown, not stale. Inspect exact head/base PR history through `gh`;
ancestry alone cannot detect squash/rebase merges. Branch age and `git cherry`
are supplementary evidence, not authority to drop commits.

| Observed state | Action |
| --- | --- |
| Main | Create a unique feature branch from HEAD before committing; rebase onto fetched origin/main. Never push main. |
| Stale feature branch, no active PR | Create a unique branch from HEAD; preserve old branch; rebase only intended unmerged work. |
| Proven merged branch | Create from HEAD; use verified merged PR head as replay boundary. With no remaining changes, report no PR needed. |
| Closed but unmerged/spent branch | Create from HEAD; inspect why it closed and preserve only authorized intended work. Do not use a merged-PR replay boundary. |
| Current unmerged feature branch | Keep it and reuse its matching open PR, if any. |
| Stale branch with active PR, shared published history, detached HEAD, ambiguous merge boundary | Preserve work; ask only the unresolved ownership/head-replacement/replay decision before proceeding. |

Verify a new name is unused locally/remotely with `git check-ref-format --branch`,
`git show-ref --verify`, and `git ls-remote --heads` on the verified remote.
Use `git switch -c "$new_branch" HEAD`; do not repoint/delete the original.
Safely checkpoint only intended edits on this branch, leaving rebase state clean.
Record pre-rebase SHA and retain a local recovery ref before rewriting a retained
branch. Never autostash, sweep unrelated staged work, or hide unresolved edits.
Disable autostash and automatic ref updates explicitly for every rebase start.
Inherited Git configuration can otherwise hide dirty work or move the original
branch and recovery refs that this workflow promises to preserve.

For ordinary work, use `git -c rebase.autoStash=false -c rebase.updateRefs=false rebase origin/main`.
For a proven merged PR whose exact head remains an ancestor of HEAD, inspect the
residual range first:

```bash
git merge-base --is-ancestor "$merged_pr_head" HEAD
git log "$merged_pr_head..HEAD"
git diff "$merged_pr_head" HEAD
git -c rebase.autoStash=false -c rebase.updateRefs=false rebase --onto origin/main "$merged_pr_head" "$new_branch"
```

If the boundary is not verified, or merge commits require different handling,
stop rather than guess. For conflicts inspect `git status`, conflicted files,
rebase commit, both versions and immediate callers. Resolve semantic intent,
`git add -- "$resolved_path"`, then `git rebase --continue`. Never blanket-pick
ours/theirs or blindly `--skip`. If blocked use `git rebase --abort`, verify
restored SHA/worktree against the checkpoint, and preserve all scoped work.
Compare pre/post ranges with `git range-diff` where applicable and inspect the
complete new diff. Re-run affected checks after conflict resolution.

Push a new branch with `git push --set-upstream origin "$branch"`, then verify
its exact remote SHA. Prefer normal pushes. Rewriting an existing published head
requires explicit authorization, confirmed ownership, and a freshly read exact
remote SHA; use only `--force-with-lease=refs/heads/$branch:$expected_remote_sha`.
A lease mismatch stops the push; never refresh it blindly to overwrite changes.
If main advances before the final gate, re-evaluate branch/PR handling, rebase
safely, revalidate and restart review; previous evidence is stale.

## PR identity, publication, and checks

Resolve host and owner/repo from sanitized remote/platform evidence; verify
`gh repo view` matches origin. List open and merged/closed PRs for the exact
source/base, using pagination/API when CLI limits could omit a match. Confirm
head repository as well as branch name. Set `repo_id` to verified
`[HOST/]OWNER/REPO`; never rely on shell cwd or default branch inference.

```bash
gh pr create --repo "$repo_id" --base main --head "$head_ref" --title "$title" --body-file "$body_file"
gh pr edit "$pr" --repo "$repo_id" --body-file "$body_file"
gh pr view "$pr" --repo "$repo_id" --json number,url,state,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,headRepository,reviewDecision,mergeable,mergeStateStatus,body,statusCheckRollup
gh pr checks "$pr" --repo "$repo_id" --watch --interval 30
```

Create OR edit, never both blindly. Re-fetch and compare applied title/body with
the validated draft, including exact template headings/checklist labels and
bytes. Inspect all checks, not just `--required`. Verify expected checks and
branch/ruleset requirements from available policy evidence. For failures use the
identified run's `gh run view` and bounded failing logs; check its head SHA/run
attempt and association to the current PR head or test-merge revision. Missing
permissions or a zero-check result are not evidence of success.

## Complete review collection

Collect issue comments and reviews as well as inline threads:

```bash
gh api --hostname "$host" --paginate "repos/$owner/$name/issues/$pr/comments?per_page=100"
gh api --hostname "$host" --paginate "repos/$owner/$name/pulls/$pr/reviews?per_page=100"
gh api --hostname "$host" graphql --paginate -F owner="$owner" -F name="$name" -F number="$pr" -f query='
query($owner:String!,$name:String!,$number:Int!,$endCursor:String) {
  repository(owner:$owner,name:$name) {
    pullRequest(number:$number) {
      headRefOid
      reviewThreads(first:100,after:$endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated viewerCanResolve path line
          comments(first:100) {
            pageInfo { hasNextPage endCursor }
            nodes { id databaseId url body createdAt updatedAt author { login __typename } commit { oid } }
          }
        }
      }
    }
  }
}'
```

Thread pagination does not paginate each nested comments connection. When a
thread's comments `hasNextPage` is true, separately query that thread node by ID
with `comments(first:100,after:$endCursor)` and paginate to completion. Keep raw
results local; extract the minimal thread evidence. Verify bot identity from
actual authors/app metadata and repository configuration. Deduplicate by IDs,
not text; reread updated/unresolved threads after every new head. Also assess
actionable bot review summaries and issue comments, which have no thread to
resolve. Do not assume `isOutdated` means the concern disappeared.

## Reply and resolve one verified bot thread

Use the root review comment's REST `databaseId` for replies, not the GraphQL
thread ID or an arbitrary child comment. Have `orchestrate-writer` draft the
plain one-sentence justification, validate its facts and 20-word maximum, and
write it to a local file outside the commit scope.

```bash
gh api --hostname "$host" --method POST "repos/$owner/$name/pulls/$pr/comments/$root_comment_id/replies" -F body=@"$reply_file"
gh api --hostname "$host" graphql -f query='
mutation($thread:ID!) {
  resolveReviewThread(input:{threadId:$thread}) { thread { id isResolved } }
}' -f thread="$thread_id"
```

Reply first, verify the returned/stored body and target, then resolve only if
`viewerCanResolve`, current evidence, and authorization permit it. Re-query the
thread to confirm `isResolved`. Fixed comments require pushed fix and test
evidence; incorrect comments require verified refutation. Do not fabricate
review approval or resolve human/uncertain threads. For non-thread bot comments,
post a scoped reply with `gh pr comment --body-file` if needed and record its URL;
there is no GitHub review thread to resolve.
