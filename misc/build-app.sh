#!/bin/bash -e
#
# Build release version of app
#
cd "$(dirname "$0")/.."
source misc/util.sh
rootdir=$PWD

rm -rf docs/app.* docs/resources.*

spawn_monaco_build "$rootdir/docs" && echo "monaco is up-to-date" || true

echo "building ./src/app -> ./docs"
cd src/app
webpack --mode=production --progress --display=errors-only "--output-path=$rootdir/docs"

wait
echo "✓ done"
