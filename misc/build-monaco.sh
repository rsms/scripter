#!/bin/bash -e
cd "$(dirname "$0")/.."
source misc/util.sh

if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  echo "usage: $0 [-debug]"
  exit 1
fi

WEBPACK_ARGS=( --display=errors-only )
if [[ "$1" == "-debug" ]]; then
  shift
  WEBPACK_ARGS=( --debug )
fi

outdir="$PWD/docs"
if [[ "$1" != "" ]]; then
  outdir=$1
fi

echo "removing $outdir/monaco-*"
rm -rf "$outdir"/monaco-*

build_dir=$(print_monaco_build_dir "$outdir")
echo "building $build_dir"
pushd src/monaco >/dev/null
NODE_PATH="$PWD" webpack --mode=production "--output-path=$outdir" "${WEBPACK_ARGS[@]}"
echo "built $build_dir ok"
