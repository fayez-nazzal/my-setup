#!/usr/bin/env bash
set -eu
script=$(cd "$(dirname "$0")/../scripts" && pwd)/pr-deploy-status
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
printf 'gh %s\n' "$*" >>"$CALLS"
case "$*" in
  'auth status') exit 0;;
  'repo view --json nameWithOwner --jq .nameWithOwner') printf 'owner/repo\n';;
  'repo view owner/repo --json defaultBranchRef --jq .defaultBranchRef.name') printf 'main\n';;
  'api user --jq .login') printf 'person\n';;
  'api repos/owner/repo/pulls/7 '*|'api repos/owner/repo/pulls/7') printf '7\thttps://example.invalid/pr/7\ttrue\tmain\t2026-01-01T00:00:00Z\tabcdef0123456789abcdef0123456789abcdef01\n';;
  'api repos/owner/repo/pulls?'*) printf '\n';;
  *) echo "unexpected gh query: $*" >&2; exit 9;;
esac
GH
cat >"$tmp/bin/aws" <<'AWS'
#!/usr/bin/env bash
printf 'aws %s\n' "$*" >>"$CALLS"
case "$*" in
  *'get-caller-identity'*) printf '123456789012\tarn:aws:iam::123456789012:user/test\n';;
  *'codepipeline list-pipelines'*) printf 'pipe\n';;
  *'actions[?actionTypeId.provider=='\''CodeStarSourceConnection'\''].name'*) printf 'Source\n';;
  *'actions[?name=='\''Source'\''].configuration.FullRepositoryId'*) printf 'owner/repo\n';;
  *'actions[?name=='\''Source'\''].configuration.BranchName'*) printf 'main\n';;
  *'pipeline.stages[?name=='\''Deploy'\''].name'*) printf 'Deploy\n';;
  *'list-pipeline-executions'*) printf 'exec\tSucceeded\tabcdef0123456789abcdef0123456789abcdef01\t2026-01-01\t2026-01-01\n';;
  *'list-action-executions'*) printf 'Deploy\tRelease\tSucceeded\tDeploy\tCloudFormation\t\t\n';;
esac
AWS
chmod +x "$tmp/bin/gh" "$tmp/bin/aws"
export CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" AWS_PROFILE=test AWS_REGION=us-east-1
expect_code() { wanted=$1; shift; set +e; "$@" >/dev/null 2>&1; got=$?; set -e; [[ $got == "$wanted" ]] || { echo "expected exit $wanted got $got: $*" >&2; exit 1; }; }
expect_code 0 "$script" --help
expect_code 2 "$script" --pr 0
expect_code 2 "$script" --sha xyz
expect_code 2 "$script" --pr 7 --sha abcdef0
expect_code 2 "$script" --wat
expect_code 2 "$script" --max-executions 101
out=$("$script" --pr 7)
expect_code 2 "$script" --pr 7 --base other
grep -q '^deployed=yes$' <<<"$out"
grep -q 'exact_execution=exec' <<<"$out"
set +e
err=$("$script" 2>&1)
rc=$?
set -e
[[ $rc == 4 ]]
grep -q 'no PR merged by person' <<<"$err"
if grep -Eiq '(^| )(put|start-pipeline-execution|retry-stage-execution|stop-pipeline-execution|approve|update-pipeline|delete-pipeline|deploy)( |$)' "$CALLS"; then echo 'mutation-like CLI call observed' >&2; exit 1; fi
# Every fixture command is a narrowly allowlisted authenticated GET/read.
while IFS= read -r call; do
  case "$call" in
    'gh auth status'|'gh repo view '*|'gh api user '*|'gh api repos/owner/repo/pulls/7 '*|'gh api repos/owner/repo/pulls/7'|'gh api repos/owner/repo/pulls?'*|aws\ *'sts get-caller-identity'*|aws\ *'codepipeline list-pipelines'*|aws\ *'codepipeline get-pipeline '*|aws\ *'codepipeline list-pipeline-executions '*|aws\ *'codepipeline list-action-executions '*) ;;
    *) echo "non-allowlisted call: $call" >&2; exit 1;;
  esac
done <"$CALLS"
printf 'offline wrapper tests passed\n'
