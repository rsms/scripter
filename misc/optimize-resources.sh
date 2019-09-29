#!/bin/sh
set -e
cd "$(dirname "$0")/.."

if ! (which pngcrush >/dev/null); then
  echo 'pngcrush not found in $PATH' >&2
  MISSING_UTILS+=( pngcrush )
fi

pushd docs >/dev/null

# crunch /docs/*.png
for f in *.png; do
  TMPNAME=.$f.tmp
  (pngcrush -q "$f" "$TMPNAME" && mv -f "$TMPNAME" "$f") &
done

popd >/dev/null

# wait for all background processes to exit
wait
