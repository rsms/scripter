#!/bin/bash -e
cd "$(dirname "$0")/.."

outdir=docs
if [[ "$1" != "" ]]; then outdir=$1 ; fi

mkdir -p "$outdir"

node misc/build-tslibs.js "$outdir" &
node misc/build-worker-template.js
wait
