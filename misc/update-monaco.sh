#!/bin/bash -e
cd "$(dirname "$0")/.."

if [[ "$1" != "update" ]]; then
  if [[ "$1" != "" ]]; then
    echo "usage:"
    echo "  $0         -- Check for new version"
    echo "  $0 update  -- Download and update latest version"
    exit 0
  fi
  if [ -f src/monaco/monaco-editor/package.json ]; then
    echo "checking for new version"
    LATEST_VERSION=$(npm view monaco-editor version)
    LOCAL_VERSION=$(node -e \
      'process.stdout.write(require("./src/monaco/monaco-editor/package.json").version)')
    if [[ "$LATEST_VERSION" != "$LOCAL_VERSION" ]]; then
      echo "New version available: $LATEST_VERSION  (Local version: $LOCAL_VERSION)"
      echo "Run  $0 update  to upgrade."
    else
      echo "No new version available. Local version $LOCAL_VERSION is current."
      echo "Run  $0 update  to update anyways."
    fi
    exit 0
  fi
fi

# download and extract latest archive
ARCHIVE_URL=$(npm view monaco-editor dist.tarball)
rm -rf build/monaco-archive
mkdir -p build/monaco-archive
pushd build/monaco-archive >/dev/null
echo "HTTP GET $ARCHIVE_URL -> src/monaco/monaco-editor"
curl "-#" "$ARCHIVE_URL" | tar -xz
popd >/dev/null
# monaco-editor now extracted at build/monaco-archive/package/
rm -rf src/monaco/monaco-editor
mv build/monaco-archive/package src/monaco/monaco-editor
rm -rf build/monaco-archive

# Move type defs
rm -f src/monaco/monaco.d.ts
mv src/monaco/monaco-editor/monaco.d.ts src/monaco/monaco.d.ts

# Remove unused stuff
rm -rvf src/monaco/monaco-editor/dev \
        src/monaco/monaco-editor/min* \
        src/monaco/monaco-editor/CHANGELOG*

# Remove language source we don't need (no impact on build product; just on source)
for f in src/monaco/monaco-editor/esm/vs/basic-languages/*; do
  if [[ "$f" != *.* ]] && [[ "$f" != */typescript ]]; then
    rm -rf "$f"
  fi
done
for f in src/monaco/monaco-editor/esm/vs/language/*; do
  if [[ "$f" != *.* ]] && [[ "$f" != */typescript ]]; then
    rm -rf "$f"/*
    echo "function LanguageServiceDefaultsImpl(){}"  > "$f/monaco.contribution.js"
    echo "export { LanguageServiceDefaultsImpl }"   >> "$f/monaco.contribution.js"
  fi
done
contribJsFile=src/monaco/monaco-editor/esm/vs/basic-languages/monaco.contribution.js
echo "import '../editor/editor.api.js';"                  > "$contribJsFile"
echo "import './typescript/typescript.contribution.js';" >> "$contribJsFile"

# Patch lib
echo node misc/patch-monaco-editor.js
node misc/patch-monaco-editor.js

# build
bash misc/build-monaco.sh
