#!/usr/bin/env bash
# Clone, update, build, and link the GitHub tools listed in tools.conf.
#
#   sync.sh [sync] [--log]          clone missing tools, fast-forward checkouts whose tip is signed
#                                   by an enrolled owner key, rebuild what changed, refresh links
#   sync.sh list                    print the tools that apply to this platform
#   sync.sh cron install|remove|show|status
#                                   manage the crontab entry that runs `sync --log`
#
# Written for bash 3.2: macOS cron runs /bin/bash with PATH=/usr/bin:/bin.
set -uo pipefail

resolve() {
  local path="$1" dir target
  while [ -L "$path" ]; do
    dir="$(cd -P "$(dirname "$path")" && pwd)"
    target="$(readlink "$path")"
    case "$target" in /*) path="$target" ;; *) path="$dir/$target" ;; esac
  done
  printf '%s/%s\n' "$(cd -P "$(dirname "$path")" && pwd)" "$(basename "$path")"
}
SELF="$(resolve "${BASH_SOURCE[0]}")"
# shellcheck source=tools.conf
. "$(dirname "$SELF")/tools.conf"

# cron and launchd start with a minimal PATH; find bun, git, and node the way a login shell would.
for dir in /home/linuxbrew/.linuxbrew/bin /usr/local/bin /opt/homebrew/bin "$HOME/.local/bin" "$HOME/.volta/bin" "$HOME/.bun/bin"; do
  [ -d "$dir" ] && PATH="$dir:$PATH"
done
export PATH NX_DAEMON=false NX_TUI=false NX_NO_CLOUD=true
case "$(uname -s)" in Darwin) PLATFORM=darwin ;; Linux) PLATFORM=linux ;; *) PLATFORM=unknown ;; esac
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/my-setup"
CRON_MARKER="# my-setup:github-tools"
# Owner keys enrolled on this machine (public halves only; see tools/README.md). Never a repo file, never an env override.
TRUST_DIR="$HOME/.config/my-setup/tool-trust"
VERIFY_GPG="$(dirname "$SELF")/verify-gpg.sh"

trim() { local value="$1"; value="${value#"${value%%[![:space:]]*}"}"; printf '%s' "${value%"${value##*[![:space:]]}"}"; }

# Build helpers available to the build field in tools.conf.
bun_deps() {
  # Lifecycle scripts (nx's postinstall, for one) call `node`; without Node, run them on Bun.
  if ! command -v node >/dev/null 2>&1; then
    mkdir -p "$STATE_DIR/node-shim" && ln -sfn "$(command -v bun)" "$STATE_DIR/node-shim/node" && PATH="$STATE_DIR/node-shim:$PATH"
  fi
  if git ls-files --error-unmatch bun.lock >/dev/null 2>&1; then bun install --frozen-lockfile; else bun install; fi
}
nag_agent() {
  # `nag install` also appends a `nag banner` block to ~/.zshrc, which is this repository's
  # tracked zsh/.zshrc and already runs the banner (zsh/.config/zsh/rc.d/40-hooks.zsh), so
  # register only the launchd agent through nag's own installer. The agent records
  # process.execPath; pin it to the stable `bun` on PATH rather than Homebrew's versioned
  # Cellar path, which disappears on the next `brew upgrade bun`.
  NAG_BUN="$(command -v bun)" bun -e '
    Object.defineProperty(process, "execPath", { value: process.env.NAG_BUN });
    const { DEFAULT_DISPATCH_INTERVAL_SECONDS, runInstall } = await import(process.cwd() + "/src/installation/apply.ts");
    for (const note of runInstall(DEFAULT_DISPATCH_INTERVAL_SECONDS, "/dev/null")) console.log(note);'
}

# Split a tools.conf entry into NAME PLATFORMS BUILD LINKS.
parse() {
  local name platforms build links
  IFS='|' read -r name platforms build links <<EOF
$1
EOF
  NAME="$(trim "$name")"; PLATFORMS="$(trim "$platforms")"; BUILD="$(trim "$build")"; LINKS="$(trim "${links:-}")"
}
applies() { case " $PLATFORMS " in *" $PLATFORM "*) return 0 ;; *) return 1 ;; esac; }

default_branch() {
  local dir="$1" ref
  ref="$(git -C "$dir" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)" ||
    { git -C "$dir" remote set-head origin --auto >/dev/null 2>&1; ref="$(git -C "$dir" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"; } ||
    ref="origin/main"
  printf '%s\n' "${ref#origin/}"
}

# Trust gate. A revision is built or linked only when git verifies it against the owner keys enrolled in
# $TRUST_DIR: never trust-on-first-use, never the user's keyrings or git config, never GitHub's verified flag.
file_meta() { case "$PLATFORM" in darwin) stat -f '%Lp %u' "$1" ;; *) stat -c '%a %u' "$1" ;; esac; }

# Prints why the trust material cannot be used; returns non-zero when it cannot.
check_trust() {
  local name path
  if [ -L "$TRUST_DIR" ] || [ ! -d "$TRUST_DIR" ]; then
    echo "trust material missing: $TRUST_DIR must be a real directory (see tools/README.md)"; return 1
  fi
  [ "$(file_meta "$TRUST_DIR")" = "700 $(id -u)" ] || { echo "trust material unsafe: $TRUST_DIR needs mode 0700 owned by $(id -un)"; return 1; }
  for name in allowed_signers owner-keys.asc; do
    path="$TRUST_DIR/$name"
    if [ -L "$path" ] || [ ! -f "$path" ]; then echo "trust material missing: $path must be a regular file (see tools/README.md)"; return 1; fi
    [ "$(file_meta "$path")" = "600 $(id -u)" ] || { echo "trust material unsafe: $path needs mode 0600 owned by $(id -un)"; return 1; }
  done
}

# Prints ssh, openpgp, or unsupported. Git reads the single gpgsig header, so anything else (x509, several headers) is rejected.
signature_format() {
  local header
  header="$(git -C "$1" cat-file commit "$2" 2>/dev/null | sed '/^$/q')"
  if [ "$(printf '%s\n' "$header" | grep -c '^gpgsig')" != 1 ]; then echo unsupported; return; fi
  case "$(printf '%s\n' "$header" | grep '^gpgsig ' | sed 's/^gpgsig //')" in
    "-----BEGIN SSH SIGNATURE-----") echo ssh ;;
    "-----BEGIN PGP SIGNATURE-----") echo openpgp ;;
    *) echo unsupported ;;
  esac
}

# Git's exit status decides. Its localized "Good signature" text is not parsed; an unlisted key still prints it.
verify_ssh() { # checkout sha output
  local ssh_keygen
  ssh_keygen="$(command -v ssh-keygen)" || { echo "$NAME: failed: ssh-keygen is required to verify SSH-signed revisions"; return 1; }
  if GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git -C "$1" -c gpg.format=ssh -c gpg.ssh.program="$ssh_keygen" \
    -c gpg.ssh.allowedSignersFile="$TRUST_DIR/allowed_signers" verify-commit --raw "$2" >"$3" 2>&1; then
    return 0
  fi
  echo "$NAME: failed: ${2:0:7} is not signed by an enrolled owner key; not building or linking"; tail -n 5 "$3" | sed 's/^/  /'; return 1
}

openpgp_status_ok() { # status-fd output: GOODSIG and VALIDSIG present, no failure or untrusted status
  grep -q '^\[GNUPG:\] GOODSIG ' "$1" && grep -q '^\[GNUPG:\] VALIDSIG ' "$1" &&
    ! grep -Eq '^\[GNUPG:\] (BADSIG|ERRSIG|EXPKEYSIG|EXPSIG|REVKEYSIG|NO_PUBKEY|TRUST_NEVER) ' "$1"
}

# A throwaway keyring holding only the enrolled owner keys; the user's ~/.gnupg is never read.
verify_openpgp() { # checkout sha output
  local home rc=0
  [ -x "$VERIFY_GPG" ] || { echo "$NAME: failed: $VERIFY_GPG is missing or not executable"; return 1; }
  home="$(mktemp -d)" && chmod 700 "$home" || { echo "$NAME: failed: could not create a temporary keyring"; return 1; }
  if ! GNUPGHOME="$home" "$VERIFY_GPG" --quiet --import "$TRUST_DIR/owner-keys.asc" >"$3" 2>&1; then
    echo "$NAME: failed: trust material unusable: could not import $TRUST_DIR/owner-keys.asc"; rc=1
  elif ! GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GNUPGHOME="$home" git -C "$1" -c gpg.openpgp.program="$VERIFY_GPG" \
    verify-commit --raw "$2" >"$3" 2>&1 || ! openpgp_status_ok "$3"; then
    echo "$NAME: failed: ${2:0:7} is not signed by an enrolled owner key; not building or linking"; tail -n 5 "$3" | sed 's/^/  /'; rc=1
  fi
  gpgconf --homedir "$home" --kill all >/dev/null 2>&1; rm -rf "$home"
  return $rc
}

# Returns non-zero, after printing "NAME: failed: ...", unless commit $2 in checkout $1 passes the trust gate.
verify_revision() {
  local checkout="$1" sha="$2" format tool problem out rc=0
  if ! problem="$(check_trust)"; then echo "$NAME: failed: $problem; not building or linking"; return 1; fi
  format="$(signature_format "$checkout" "$sha")"
  case "$format" in
    ssh) tool=ssh-keygen ;;
    openpgp) tool=gpg ;;
    *) echo "$NAME: failed: ${sha:0:7} has no single SSH or OpenPGP signature; not building or linking"; return 1 ;;
  esac
  command -v "$tool" >/dev/null 2>&1 || { echo "$NAME: failed: $tool is required to verify ${format}-signed revisions; not building or linking"; return 1; }
  out="$(mktemp)" || { echo "$NAME: failed: could not create a temporary file"; return 1; }
  if [ "$format" = ssh ]; then verify_ssh "$checkout" "$sha" "$out" || rc=1; else verify_openpgp "$checkout" "$sha" "$out" || rc=1; fi
  rm -f "$out"; return $rc
}

# Prints one summary line per tool; returns non-zero when the tool failed. A checkout that is skipped (other branch,
# uncommitted changes, diverged) is neither built nor linked. Otherwise HEAD must pass verify_revision first.
sync_tool() {
  local dir="$GITHUB_TOOLS_DIR/$NAME" url="https://github.com/$GITHUB_TOOLS_OWNER/$NAME.git"
  local actions="" notes="" attention="" fresh=false held=false verified="" head target before stage
  local branch default stamp stampfile need_build=false link source command dest output
  if [ ! -e "$dir" ] && [ -d "$GITHUB_TOOLS_PREVIOUS_DIR/$NAME/.git" ]; then
    mkdir -p "$GITHUB_TOOLS_DIR" && mv "$GITHUB_TOOLS_PREVIOUS_DIR/$NAME" "$dir" || { echo "$NAME: failed to move $GITHUB_TOOLS_PREVIOUS_DIR/$NAME to $dir"; return 1; }
    rmdir "$GITHUB_TOOLS_PREVIOUS_DIR" 2>/dev/null
    actions="moved from $GITHUB_TOOLS_PREVIOUS_DIR"
  fi
  if [ ! -e "$dir" ]; then
    # Clone without a checkout, verify the default-branch tip, and publish only then: nothing unverified is checked out.
    mkdir -p "$GITHUB_TOOLS_DIR" || { echo "$NAME: failed: cannot create $GITHUB_TOOLS_DIR"; return 1; }
    rm -rf "$GITHUB_TOOLS_DIR/.staging-$NAME".*
    stage="$(mktemp -d "$GITHUB_TOOLS_DIR/.staging-$NAME.XXXXXX")" || { echo "$NAME: failed: cannot create a staging directory in $GITHUB_TOOLS_DIR"; return 1; }
    if ! git -c core.hooksPath=/dev/null clone --quiet --no-checkout "$url" "$stage/repo"; then
      rm -rf "$stage"; echo "$NAME: failed: could not clone $url"; return 1
    fi
    default="$(default_branch "$stage/repo")"
    if ! target="$(git -C "$stage/repo" rev-parse --verify --quiet "refs/remotes/origin/$default^{commit}")"; then
      rm -rf "$stage"; echo "$NAME: failed: $url has no $default branch"; return 1
    fi
    if ! verify_revision "$stage/repo" "$target"; then rm -rf "$stage"; return 1; fi
    if ! { git -C "$stage/repo" -c core.hooksPath=/dev/null checkout --quiet -B "$default" "$target" && mv "$stage/repo" "$dir"; }; then
      rm -rf "$stage"; echo "$NAME: failed: could not check out ${target:0:7} into $dir"; return 1
    fi
    rm -rf "$stage"
    actions="cloned"; fresh=true; verified="$target"
  elif [ ! -d "$dir/.git" ]; then
    echo "$NAME: failed: $dir exists but is not a git checkout; move it aside"; return 1
  else
    branch="$(git -C "$dir" symbolic-ref --quiet --short HEAD 2>/dev/null || echo "detached HEAD")"
    default="$(default_branch "$dir")"
    if [ "$branch" != "$default" ]; then
      notes="$notes; on $branch, not $default: not updated"; held=true
    elif [ -n "$(git -C "$dir" status --porcelain --untracked-files=no)" ]; then
      notes="$notes; uncommitted changes: not updated"; held=true
    elif ! git -C "$dir" -c core.hooksPath=/dev/null fetch --quiet origin "$default"; then
      echo "$NAME: failed: could not fetch origin/$default"; return 1
    else
      # Resolve FETCH_HEAD once: the object verified below is the object merged.
      if ! target="$(git -C "$dir" rev-parse --verify --quiet 'FETCH_HEAD^{commit}')"; then
        echo "$NAME: failed: origin/$default has no commit"; return 1
      fi
      before="$(git -C "$dir" rev-parse HEAD)"
      if [ "$before" = "$target" ] || git -C "$dir" merge-base --is-ancestor "$target" "$before"; then
        :  # up to date, or local commits ahead of origin: HEAD is verified below
      elif git -C "$dir" merge-base --is-ancestor "$before" "$target"; then
        verify_revision "$dir" "$target" || return 1
        verified="$target"
        if ! git -C "$dir" -c core.hooksPath=/dev/null -c merge.verifySignatures=false merge --ff-only --quiet "$target"; then
          echo "$NAME: failed: fast-forward to ${target:0:7} failed"; return 1
        fi
        if [ -n "$(git -C "$dir" status --porcelain --untracked-files=no)" ]; then
          echo "$NAME: failed: uncommitted changes after the update"; return 1
        fi
        actions="updated ${before:0:7}..${target:0:7}"
      else
        notes="$notes; local commits diverge from origin/$default: not updated"; held=true
      fi
    fi
  fi

  if [ "$held" = true ]; then
    notes="$notes; not built or linked"
  else
    head="$(git -C "$dir" rev-parse HEAD)"
    if [ "$head" != "$verified" ]; then verify_revision "$dir" "$head" || return 1; fi
    if [ -n "$BUILD" ]; then
      # Rebuild only when the commit or the build command changed since the last good build,
      # or when a linked output is missing.
      stamp="$head $(printf '%s' "$BUILD" | cksum | cut -d' ' -f1)"
      stampfile="$dir/.git/my-setup-build"
      [ "$(cat "$stampfile" 2>/dev/null)" = "$stamp" ] || need_build=true
      for link in $LINKS; do [ -e "$dir/${link%%:*}" ] || need_build=true; done
      if [ "$need_build" = true ]; then
        echo "$NAME: building…"
        output="$(mktemp)"
        if (cd "$dir" && eval "$BUILD") >"$output" 2>&1; then
          printf '%s\n' "$stamp" >"$stampfile"; actions="${actions:+$actions, }built"; rm -f "$output"
        else
          echo "$NAME: failed: build \`$BUILD\` exited non-zero; last output:"; tail -n 20 "$output" | sed 's/^/  /'; rm -f "$output"; return 1
        fi
      fi
    fi

    for link in $LINKS; do
      source="${link%%:*}"; command="${link#*:}"; [ "$command" = "$link" ] && command="$(basename "$source")"
      target="$dir/$source"; dest="$GITHUB_TOOLS_BIN/$command"
      [ -e "$target" ] || { echo "$NAME: failed: $target is missing"; return 1; }
      if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$target" ]; then continue; fi
      if [ -e "$dest" ] && [ ! -L "$dest" ]; then
        notes="$notes; $dest is not a symlink: left alone"
        attention="${attention}attention: $command was not linked because $dest is a real file; move it aside and rerun my-setup-tools.
"
        continue
      fi
      mkdir -p "$GITHUB_TOOLS_BIN" && ln -sfn "$target" "$dest" || { echo "$NAME: failed to link $dest"; return 1; }
      actions="${actions:+$actions, }linked $command"
    done
  fi

  echo "$NAME: ${actions:-unchanged}$notes"
  printf '%s' "$attention"
  if [ "$fresh" = true ] && [ -f "$dir/manifest.json" ] && grep -q '"manifest_version"' "$dir/manifest.json"; then
    echo "attention: $NAME is a browser extension; load $dir once per Chrome profile (chrome://extensions > Developer mode > Load unpacked). Pulled updates apply when Chrome restarts or you click Reload there."
  fi
  return 0
}

command_sync() {
  local entry failed=0 log pid
  if [ "${1:-}" = --log ]; then
    mkdir -p "$STATE_DIR"; log="$STATE_DIR/tools-sync.log"
    if [ -f "$log" ] && [ "$(wc -l <"$log")" -gt 2000 ]; then tail -n 1000 "$log" >"$log.tmp" && mv "$log.tmp" "$log"; fi
    exec >>"$log" 2>&1
    echo "== $(date '+%Y-%m-%d %H:%M:%S')"
  fi
  # One sync at a time: the installer and cron may overlap. A lock left by a dead process is reclaimed.
  mkdir -p "$STATE_DIR"
  if ! mkdir "$STATE_DIR/tools.lock" 2>/dev/null; then
    pid="$(cat "$STATE_DIR/tools.lock/pid" 2>/dev/null)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "another sync (pid $pid) is running; skipped"; return 0; fi
    rm -rf "$STATE_DIR/tools.lock"; mkdir "$STATE_DIR/tools.lock" || { echo "could not take $STATE_DIR/tools.lock"; return 1; }
  fi
  echo $$ >"$STATE_DIR/tools.lock/pid"
  trap 'rm -rf "$STATE_DIR/tools.lock"' EXIT
  command -v git >/dev/null 2>&1 || { echo "git is required"; return 1; }
  command -v bun >/dev/null 2>&1 || echo "attention: bun is not on PATH; tools that build with bun will fail until it is installed"
  for entry in "${GITHUB_TOOLS[@]}"; do
    parse "$entry"; applies || continue
    sync_tool || failed=1
  done
  return "$failed"
}

command_list() {
  local entry
  for entry in "${GITHUB_TOOLS[@]}"; do
    parse "$entry"; applies || continue
    printf '%s -> %s/%s%s%s\n' "$NAME" "$GITHUB_TOOLS_DIR" "$NAME" "${BUILD:+, build: $BUILD}" "${LINKS:+, links: $LINKS}"
  done
}

cron_line() { printf "%s '%s' sync --log %s\n" "$GITHUB_TOOLS_CRON" "$SELF" "$CRON_MARKER"; }
current_crontab() {
  local output
  if output="$(crontab -l 2>&1)"; then printf '%s\n' "$output"; return 0; fi
  # An empty crontab is fine; any other error must not lead to overwriting the user's entries.
  case "$output" in *"no crontab"*) return 0 ;; *) echo "crontab -l failed: $output" >&2; return 1 ;; esac
}
command_cron() {
  local current others desired
  command -v crontab >/dev/null 2>&1 || { echo "crontab is not installed"; return 1; }
  case "${1:-}" in
    show) cron_line ;;
    status)
      current="$(current_crontab)" || return 1
      if printf '%s\n' "$current" | grep -F -- "$CRON_MARKER"; then return 0; fi
      echo "cron: not installed"; return 1 ;;
    install|remove)
      current="$(current_crontab)" || return 1
      others="$(printf '%s\n' "$current" | grep -v -F -- "$CRON_MARKER" | sed '/^$/d')"
      if [ "$1" = install ]; then desired="${others:+$others
}$(cron_line)"; else desired="$others"; fi
      if [ "$desired" = "$(printf '%s\n' "$current" | sed '/^$/d')" ]; then echo "cron: unchanged"; return 0; fi
      if [ -z "$desired" ]; then crontab -r 2>/dev/null || true; else printf '%s\n' "$desired" | crontab - || return 1; fi
      if [ "$1" = install ]; then echo "cron: installed"; else echo "cron: removed"; fi ;;
    *) echo "usage: $(basename "$0") cron install|remove|show|status" >&2; return 2 ;;
  esac
}

case "${1:-sync}" in
  sync) shift $(( $# > 0 ? 1 : 0 )); command_sync "$@" ;;
  --log) command_sync --log ;;
  list) command_list ;;
  cron) shift; command_cron "$@" ;;
  *) sed -n '2,9p' "$SELF" | sed 's/^# \{0,1\}//' >&2; exit 2 ;;
esac
