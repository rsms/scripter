#!/bin/bash -e
#
# This script
# - builds dependencies
# - builds figma-plugin and app, rebuilding as sources change
# - starts a local web server at localhost:8009 with livereload
#
cd "$(dirname "$0")/.."
source misc/util.sh
rootdir=$PWD

if (which lsof >/dev/null); then
  SERVE_PID=$(lsof -sTCP:LISTEN -iTCP:8009 | tail -1 | awk '{print $2}')
  if [ "$SERVE_PID" != "" ]; then
    echo "It appears that a server is already listening on port 8009." >&2
    echo "You can stop it with: kill ${SERVE_PID}" >&2
    exit 1
  fi
fi

# kill ANY AND ALL processes which executables' are rooted in $rootdir
first_kill=true
while true; do
  should_wait=false
  for pid in $(ps xa | grep "$rootdir" | grep -v grep | awk '{print $1}'); do
    if $first_kill; then
      kill $pid
    else
      kill -9 $pid
    fi
    should_wait=true
  done
  if ! $should_wait; then
    break
  fi
  echo "waiting for old processes to shut down..."
  first_kill=false
  sleep 1
done

pids=()
function cleanup {
  # echo "Stopping subprocesses"
  for pid in ${pids[*]}; do
    kill $pid
    wait $pid
  done
}
trap cleanup EXIT

# build monaco if needed
# dep_pids=()
pids+=( $(spawn_monaco_build "$rootdir/build/dev") )
# spawn_monaco_build "$rootdir/build/dev" || true
# # wait for dep build processes to finish before continuing
# for pid in ${dep_pids[*]}; do wait $pid; done

# figma-plugin
figplug build -g -v -w src/figma-plugin/manifest.json:build/figma-plugin &
pids+=( $! )

# app
pushd src/app >/dev/null
webpack --mode=development --display=minimal --cache --watch &
pids+=( $! )
popd >/dev/null

# web server
mkdir -p "$rootdir/build/dev"
rm -f "$rootdir/build/dev/res"
ln -s ../../docs/res "$rootdir/build/dev/res"
node "$rootdir/misc/serve.js" "$rootdir/build/dev" 8009
