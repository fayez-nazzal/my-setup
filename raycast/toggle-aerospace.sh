#!/bin/sh
# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle AeroSpace
# @raycast.mode silent
# Optional parameters:
# @raycast.packageName Window Management
# @raycast.description Pause or resume AeroSpace window management.

set -eu
PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"
export PATH

exec aerospace enable toggle
