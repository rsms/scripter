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

GITREV=$(git rev-parse HEAD)

# patch version of iframe src="https://rsms.me/scripter/?v=1"
node <<_JS_
let fs = require("fs")
let s = fs.readFileSync("build/figma-plugin/ui.html", "utf8")
s = s.replace(/(src="https:\\/\\/rsms\\.me\\/scripter\\/\?v=)([^"&]+)/g, "\$1$GITREV")
fs.writeFileSync("build/figma-plugin/ui.html", s, "utf8")
_JS_
