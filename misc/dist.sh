#!/bin/bash -e
cd "$(dirname "$0")/.."
./misc/build-plugin.sh
./misc/build-app.sh

mkdir -p dist
# GITREV=$(git rev-parse --short=16 HEAD)
VERSION=$(date '+%Y-%m-%d.%H%M%S')
pushd build/figma-plugin >/dev/null
zip -q -X -r "../../dist/scripter-figma-plugin-${VERSION}.zip" *
popd >/dev/null

git add docs
git status
echo "Ready to commit & push"
