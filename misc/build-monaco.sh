#!/bin/bash -e
cd "$(dirname "$0")/.."
source misc/util.sh

if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  echo "usage: $0 [-debug]"
  exit 1
fi

OPT_DEBUG=false
WEBPACK_ARGS=( --display=errors-only )
if [[ "$1" == "-debug" ]]; then
  shift
  OPT_DEBUG=true
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
set +e
NODE_PATH="$PWD" webpack --mode=production "--output-path=$outdir" "${WEBPACK_ARGS[@]}"
WP_STATUS=$?
if [ "$WP_STATUS" != "0" ]; then
  if ! $OPT_DEBUG; then
    echo "webpack failed with status $WP_STATUS" >&2
    echo "Run '$0 -debug' for details" >&2
  fi
  exit $WP_STATUS
fi
echo "built $build_dir ok"
