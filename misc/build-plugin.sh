#!/bin/bash -e
cd "$(dirname "$0")/.."
source misc/util.sh

if [ "$1" == "-dev" ]; then
  echo "building figma-plugin in debug mode"
  figplug build -v -g src/figma-plugin:build/figma-plugin
else
  echo "building figma-plugin in release mode"
  rm -rf build/figma-plugin
  figplug build -v -O src/figma-plugin:build/figma-plugin
fi
