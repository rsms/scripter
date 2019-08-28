#!/bin/bash -e
cd "$(dirname "$0")/.."
NMDIR=$PWD/node_modules

function optimize {
  echo "optimizing $1"
  "$NMDIR/.bin/uglifyjs" \
    --compress \
    --toplevel \
    --ecma 7 \
    "--beautify=beautify=true,preserve_line=false,comments=false" \
    -o "$1" \
    -- "$1"
}

# ----------------------------------------------------------------------------
# source-map

OUTFILE=src/misc/source-map.js
cat <<_JS_ > "$OUTFILE"
export const {
  SourceMapConsumer,
  BasicSourceMapConsumer,
  IndexedSourceMapConsumer,
  SourceMapGenerator,
  SourceNode,
} = (function(module, exports){
  $(cat "$NMDIR/source-map/dist/source-map.js")
  return module.exports
})({exports:{}}, {});
_JS_

# cat <<_JS_ > "$OUTFILE"
# const _sourcemap_module = {exports:{}};
# (function(module, exports){
# $(cat "$NMDIR/source-map/dist/source-map.js")
# })(_sourcemap_module, _sourcemap_module.exports);
# export const SourceMapGenerator = _sourcemap_module.exports.SourceMapGenerator;
# export const SourceMapConsumer = _sourcemap_module.exports.SourceMapConsumer;
# export const SourceNode = _sourcemap_module.exports.SourceNode;
# export default {
#   SourceMapGenerator: _sourcemap_module.exports.SourceMapGenerator,
#   SourceMapConsumer: _sourcemap_module.exports.SourceMapConsumer,
#   SourceNode: _sourcemap_module.exports.SourceNode,
#   VERSION: "$VERSION"
# }
# _JS_

# patch source map to strip out `require()` calls.
# source-map.js checks for nodejs vs not at runtime, meaning it includes calls to require().
# That would mess with our webpack setup, so we strip those out.
node <<_JS_
let fs = require("fs")
let s = fs.readFileSync("$OUTFILE", "utf8")

// patch require
s = s.replace(/require\([^\)]+\)/g, "{}")

// patch broken wasm function
//s = s.replace(/module\.exports\s*=\s*function\s+wasm\(\)\s*\{/,
//  "module.exports = function wasm() { return Promise.resolve({}) }; function _dead_wasm(){")

fs.writeFileSync("$OUTFILE", s, "utf8")
_JS_

optimize "$OUTFILE"
cp "$NMDIR/source-map/source-map.d.ts" "src/misc/source-map.d.ts"
