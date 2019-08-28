#!/bin/bash -e
#
# Build release version of app
#
cd "$(dirname "$0")/.."
source misc/util.sh
rootdir=$PWD

rm -rf docs/app.* docs/resources.*

spawn_monaco_build "$rootdir/docs" && echo "monaco is up-to-date" || true

echo "building ./src/app -> ./docs"
pushd src/app > /dev/null
webpack --mode=production --progress --display=errors-only "--output-path=$rootdir/docs"

wait
popd > /dev/null
mv -f docs/resources.* docs/resources.js

# remove "resources" script tag added by webpack
node <<_JS_
let fs = require("fs")
let s = fs.readFileSync("docs/index.html", "utf8")
s = s.replace(/<script type="text\/javascript" src="resources\.[^\.]+\.js"><\/script>/, "")
fs.writeFileSync("docs/index.html", s, "utf8")
_JS_

echo "✓ done"
