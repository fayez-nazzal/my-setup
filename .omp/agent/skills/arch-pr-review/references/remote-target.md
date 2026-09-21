# Reviewing a remote target

Use this when the user gave a PR link or number, a work item id, a branch name, or said `rereview`. All four resolve through the same flow.

Defaults: repo `<repo>`, project `<project>`, `targetBranch` = `main`. Fill these in for your own Azure DevOps org, or ask the user once and reuse the answer for the rest of the conversation.

## 1. Resolve the target

| Input | Resolve to |
| --- | --- |
| PR URL (`.../pullrequest/7178`) or PR number | Extract the id, fetch the PR metadata |
| Branch name (`review tasks/11095`, `review vscode-changes`) | `sourceBranch` = the name; find the PR by branch; derive the work item from `tasks/<id>` when it fits that shape |
| Work item id (`review 11095`) | `sourceBranch` = `tasks/<id>`; find the PR by branch |
| `rereview` | Reuse the PR, branch, and work item already established in this conversation |

From PR metadata set `sourceBranch` and `targetBranch`, stripping `refs/heads/`. The metadata gives you the file list and the tip SHAs but never the patch, so the diff always comes from git.

### Finding the PR by branch

List active PRs matching all of: `sourceRefName` = `refs/heads/<sourceBranch>`, `targetRefName` = `refs/heads/<targetBranch>`, `status` = `Active`.

- Exactly one match — load it and its work items.
- No match — there is no PR yet. Skip the metadata and go straight to the git diff.
- More than one — stop and ask which to use. Do not guess.

### How to reach Azure DevOps

Prefer the ADO MCP when it is connected: `repo_pull_request` get and list, `wit_work_item` get.

Without MCP, use REST through `az rest`, which needs the resource GUID:

```bash
az rest --method get --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  --url "https://dev.azure.com/<org>/<project>/_apis/git/repositories/<repo>/pullRequests/<id>?api-version=7.1"
```

`az repos pr thread` does not exist in the installed az version, so read threads through REST at `.../pullRequests/<id>/threads?api-version=7.1` rather than polling a command that will never work.

If neither MCP nor `az` is available, set `targetBranch` = `main`, take `sourceBranch` from the input, and proceed git-only. When the input was a PR id with no branch name, ask for the branch.

## 2. Fetch and diff

```bash
git fetch origin <targetBranch> <sourceBranch>
git diff origin/<targetBranch>...origin/<sourceBranch>
git merge-base origin/<targetBranch> origin/<sourceBranch>
git log -1 --format='%H %ci %s' origin/<targetBranch>
git log -1 --format='%H %ci %s' origin/<sourceBranch>
git rev-list --count origin/<targetBranch>..origin/<sourceBranch>
git log --oneline origin/<targetBranch>..origin/<sourceBranch>
git rev-list --count origin/<sourceBranch>..origin/<targetBranch>
git log --oneline -n 10 origin/<sourceBranch>..origin/<targetBranch>
```

Three dots, never two. Two dots would compare the tips and drag in every commit the target gained since the branch started, which turns other people's work into your findings.

Report before any code finding: the merge-base SHA, both tip SHAs, the branch-only commit count and list, and the target-only count with the first ten. A target-only count above zero means the branch is behind, so say **branch behind target, rebase recommended**.

Review the fetched remote refs, not the local checkout or uncommitted changes, unless the user asks otherwise.

## 3. Load the ticket scope

Ask the API which work items are linked rather than trusting what the PR body or the person asking told you — both go stale, and a review scoped to the wrong ticket verifies the wrong criteria.

```bash
az rest --method get --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  --url "https://dev.azure.com/<org>/<project>/_apis/git/repositories/<repo>/pullRequests/<id>/workitems?api-version=7.1"
```

An empty list means no ticket, so review the code alone and say so. Otherwise load each work item and let its type decide how much of it counts.

| Type | Scope |
| --- | --- |
| **User Story**, or Feature carrying acceptance criteria | `System.Description` plus `Microsoft.VSTS.Common.AcceptanceCriteria` is the full checklist |
| **Task** | The task title, the PR description, and the diff. Use the task's own description and criteria when it has them. When it has none, fetch the parent User Story for context only |
| **Bug** | The reported problem in the description is the fix target |

A story usually spans several tasks, so verifying a whole parent story against one task's PR fails the PR for work nobody asked it to do. For a task, pull in only the criteria that plausibly match it — by title, task description, PR text, or overlap with the diff.

Report only the in-scope criteria as met, partial, or not met. The out-of-scope ones get a single line naming the group they belong to, not an item-by-item list — reprinting a whole story checklist buries the few criteria this PR was meant to satisfy. Mark overall coverage **partial** whenever anything was set aside, so nobody reads a narrow pass as a full one.

When the scope is still unclear, ask which criteria apply, or drop the requirements check and review the code alone. Say which you did.

Without MCP or `az`, ask the user to paste the task description and criteria, or skip requirements coverage and say so.

Output the work item title, a one-line scope summary, the task-scoped checklist, and each item verified against the diff with file evidence.

## 4. Re-review

On `rereview`, re-run steps 1 through 3 before touching prior findings. A finding is not fixed until a fresh diff and a fresh criteria check say it is.
