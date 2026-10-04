#!/usr/bin/env bash
set -u
mode="${1:-configure}"
unset DEVELOPER_DIR
fail() { printf '%s\n' "$1" >&2; return 1; }
if [ "$(uname -s)" != Darwin ]; then printf 'not-applicable\n'; exit 0; fi
active=""
version=""
first_launch=0
sdk=""
compiler=""
license=0
needs_install=0
developer=""
healthy=0
inspect_state() {
  active="$(/usr/bin/xcode-select -p 2>/dev/null || true)"
  developer="$active"
  case "$developer" in */Contents/Developer) ;;
    *) developer="/Applications/Xcode.app/Contents/Developer";;
  esac
  [ -d "$developer" ] || developer=""
  if [ -n "$developer" ] && [ "$developer" = "$active" ]; then
    version="$(/usr/bin/xcodebuild -version 2>/dev/null || true)"
  else
    version=""
  fi
  first_launch=0
  /usr/bin/xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1 || first_launch=1
  sdk="$(/usr/bin/xcrun --sdk macosx --show-sdk-path 2>/dev/null || true)"
  compiler="$(/usr/bin/xcrun --find clang 2>/dev/null || true)"
  license=0
  if [ -n "$developer" ] && [ "$active" = "$developer" ]; then /usr/bin/xcodebuild -license check >/dev/null 2>&1 || license=1; fi
  needs_install=0
  [ -n "$developer" ] || needs_install=1
  healthy=1
  [[ "$version" =~ Xcode[[:space:]][0-9] ]] && [ "$active" = "$developer" ] && [ "$first_launch" -eq 0 ] && [ "$license" -eq 0 ] && [ -d "$sdk" ] && [ -x "$compiler" ] || healthy=0
  if [ "$healthy" -eq 1 ]; then printf '#include <stdio.h>\n' | /usr/bin/xcrun --sdk macosx clang -fsyntax-only -isysroot "$sdk" -x c - >/dev/null 2>&1 || healthy=0; fi
}
inspect_state
if [ "$mode" = inspect ]; then
  if [ "$healthy" -eq 1 ]; then printf 'healthy\n'; else printf 'needs-setup\n'; fi
  [ "$healthy" -eq 1 ] && exit 0 || exit 1
fi
if [ "$mode" = dry-run ]; then
  if [ "$healthy" -eq 1 ]; then printf 'Full Xcode is verified and ready.\n'; else printf 'Dry run: full Xcode requires setup (full Xcode app, active developer directory, license/first launch, macOS SDK and compiler); no changes made.\n'; fi
  exit 0
fi
while [ "$healthy" -ne 1 ]; do
  if [ "$needs_install" -eq 1 ]; then
    printf 'Full Xcode is required; Command Line Tools alone are not sufficient. Install Xcode from the Mac App Store, then return here. [O]pen App Store, [R]etry, [C]ancel: '
    IFS= read -r answer || answer=c
    case "$answer" in [Oo]) /usr/bin/open 'macappstore://itunes.apple.com/app/id497799835' || { fail 'Could not open the Mac App Store.'; exit 1; } ;;
      [Rr]) ;;
      *) fail 'Xcode setup cancelled; install full Xcode and rerun install.sh.'; exit 1;; esac
  else
    if [ "$active" != "$developer" ]; then
      printf 'Select full Xcode as the active developer directory? [Y/n] '; IFS= read -r answer || answer=y
      [[ "$answer" =~ ^[Nn] ]] && { fail 'Xcode developer-directory repair declined.'; exit 1; }
      sudo /usr/bin/xcode-select --switch "$developer" || { fail 'Could not select full Xcode developer directory.'; exit 1; }
      inspect_state
      [ "$healthy" -eq 1 ] && break
    fi
    if [ "$license" -ne 0 ]; then
      printf 'Accept the Xcode and Apple SDK license? [y/N] '; IFS= read -r answer || answer=n
      [[ "$answer" =~ ^[Yy] ]] || { fail 'Xcode license was not accepted.'; exit 1; }
      sudo /usr/bin/xcodebuild -license accept || { fail 'Xcode license acceptance failed.'; exit 1; }
    fi
    if [ "$first_launch" -ne 0 ]; then
      printf 'Run Xcode first-launch setup? [Y/n] '; IFS= read -r answer || answer=y
      [[ "$answer" =~ ^[Nn] ]] && { fail 'Xcode first-launch setup declined.'; exit 1; }
      sudo /usr/bin/xcodebuild -runFirstLaunch || { fail 'Xcode first-launch setup failed.'; exit 1; }
    fi
    inspect_state
    if [ "$healthy" -eq 0 ] && [ "$license" -eq 0 ] && [ "$first_launch" -eq 0 ] && [ "$needs_install" -eq 0 ]; then
      fail 'Xcode version, SDK, or compiler validation failed; repair the full Xcode installation and rerun.'
      exit 1
    fi
  fi
  inspect_state
done
printf 'Full Xcode verified and ready (%s).\n' "$(printf '%s\n' "$version" | tr '\n' ' ')"
