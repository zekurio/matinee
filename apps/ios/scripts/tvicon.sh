#!/bin/sh
# The Apple TV app's layered icon and Top Shelf images are the brand's
# (brand/README.md, "Apple TV"): brand/tvos.py draws them into brand/tvos,
# and brand/render.sh renders their PNGs straight into the committed
# MatineeTV/Resources/TVAppIcon.xcassets, as it does the web app's icons.
# This runs render.sh, which renders the rest of the brand too; those
# files come out the same unless their sources changed. Commit what it
# writes.
set -eu
exec "$(cd "$(dirname "$0")/../../.." && pwd)/brand/render.sh"
