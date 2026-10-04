#!/usr/bin/env bash
# Clone, update, build, and link the GitHub tools listed in tools.conf.
#
#   sync.sh [sync] [--log]          clone missing tools, fast-forward clean checkouts,
#                                   rebuild what changed, refresh links
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

# Prints one summary line per tool; returns non-zero when the tool failed.
sync_tool() {
  local dir="$GITHUB_TOOLS_DIR/$NAME" url="https://github.com/$GITHUB_TOOLS_OWNER/$NAME.git"
  local actions="" notes="" attention="" fresh=false branch default before after stamp stampfile need_build=false link source command target dest output
  if [ ! -e "$dir" ] && [ -d "$GITHUB_TOOLS_PREVIOUS_DIR/$NAME/.git" ]; then
    mkdir -p "$GITHUB_TOOLS_DIR" && mv "$GITHUB_TOOLS_PREVIOUS_DIR/$NAME" "$dir" || { echo "$NAME: failed to move $GITHUB_TOOLS_PREVIOUS_DIR/$NAME to $dir"; return 1; }
    rmdir "$GITHUB_TOOLS_PREVIOUS_DIR" 2>/dev/null
    actions="moved from $GITHUB_TOOLS_PREVIOUS_DIR"
  fi
  if [ ! -e "$dir" ]; then
    mkdir -p "$GITHUB_TOOLS_DIR" && git clone --quiet "$url" "$dir" || { echo "$NAME: failed to clone $url"; return 1; }
    actions="cloned"; fresh=true
  elif [ ! -d "$dir/.git" ]; then
    echo "$NAME: failed: $dir exists but is not a git checkout; move it aside"; return 1
  else
    branch="$(git -C "$dir" symbolic-ref --quiet --short HEAD 2>/dev/null || echo "detached HEAD")"
    default="$(default_branch "$dir")"
    if [ "$branch" != "$default" ]; then
      notes="$notes; on $branch, not $default: not updated"
    elif [ -n "$(git -C "$dir" status --porcelain --untracked-files=no)" ]; then
      notes="$notes; uncommitted changes: not updated"
    elif ! git -C "$dir" fetch --quiet origin "$default"; then
      notes="$notes; fetch failed: not updated"
    else
      before="$(git -C "$dir" rev-parse HEAD)"; after="$(git -C "$dir" rev-parse FETCH_HEAD)"
      if [ "$before" != "$after" ]; then
        if git -C "$dir" merge --ff-only --quiet FETCH_HEAD; then actions="${actions:+$actions, }updated ${before:0:7}..${after:0:7}"
        else notes="$notes; local commits diverge from origin/$default: not updated"; fi
      fi
    fi
  fi

  if [ -n "$BUILD" ]; then
    # Rebuild only when the commit or the build command changed since the last good build,
    # or when a linked output is missing.
    stamp="$(git -C "$dir" rev-parse HEAD) $(printf '%s' "$BUILD" | cksum | cut -d' ' -f1)"
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
