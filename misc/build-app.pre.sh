#!/bin/bash -e
cd "$(dirname "$0")/.."

outdir=docs
if [[ "$1" != "" ]]; then outdir=$1 ; fi

mkdir -p "$outdir"


echo "Generating $outdir/scripter-env.d.ts"
echo '/// <reference path="figma.d.ts" />' > "$outdir/scripter-env.d.ts"
cat src/common/scripter-env.d.ts >> "$outdir/scripter-env.d.ts"


bash misc/build-dom.d.ts.sh "$outdir" &

node misc/build-worker-template.js

# bash misc/build-jsdom.sh "$outdir"

wait
