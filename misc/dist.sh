#!/bin/bash -e
cd "$(dirname "$0")/.."
./misc/build-plugin.sh
./misc/build-app.sh

mkdir -p dist
GITREV=$(git rev-parse --short=16 HEAD)
pushd build/figma-plugin >/dev/null
zip -q -X -r "../../dist/scripter-figma-plugin-${GITREV}.zip" *
popd >/dev/null

git add docs
git status
echo "Ready to commit & push"
