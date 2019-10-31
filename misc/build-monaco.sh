#!/bin/bash -e
cd "$(dirname "$0")/.."
source misc/util.sh

outdir="$PWD/docs"
if [[ "$1" != "" ]]; then
  outdir=$1
fi

build_dir=$(print_monaco_build_dir "$outdir")
echo "building $build_dir"
NODE_PATH=$PWD/src/monaco
pushd src/monaco >/dev/null
NODE_PATH="$NODE_PATH" webpack --display=errors-only --mode=production "--output-path=$outdir"
echo "built $build_dir ok"
