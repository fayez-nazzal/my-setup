#!/bin/bash

set -eu
PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"
export PATH

exec aerospace enable toggle