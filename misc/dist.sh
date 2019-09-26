#!/bin/bash -e
cd "$(dirname "$0")/.."
./misc/build-plugin.sh
./misc/build-app.sh
git add docs
git status

echo "Ready to commit & push"
