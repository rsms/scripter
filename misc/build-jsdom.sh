#!/bin/bash -e
cd "$(dirname "$0")/.."

if [[ "node_modules/jsdom/package.json" -nt "build/jsdom.js" ]]; then
  ./node_modules/.bin/browserify -r jsdom -o build/jsdom1.js

  # patch things up so it works in more browsers
  cat << __PREAMBLE > build/jsdom.js
if (typeof BigInt == "undefined") {
  BigInt = function BigInt() {}
}
if (typeof SharedArrayBuffer == "undefined") {
  SharedArrayBuffer = function SharedArrayBuffer() {}
  SharedArrayBuffer.prototype.byteLength = 0
}
__PREAMBLE
  echo -n "var " >> build/jsdom.js
  cat build/jsdom1.js >> build/jsdom.js
  echo "; self.jsdom = require('jsdom');" >> build/jsdom.js
  rm build/jsdom1.js
fi

if [[ build/jsdom.js -nt docs/jsdom.js ]]; then
  ./node_modules/.bin/esbuild --bundle --outfile=docs/jsdom.js --minify build/jsdom.js
fi

if [[ docs/jsdom.js -nt src/app/jsdom_info.ts ]]; then
  node <<__JS > src/app/jsdom_info.ts
const crypto = require("crypto")
const fs = require("fs")
const hash = crypto.createHash("sha1")
const input = fs.createReadStream("docs/jsdom.js")
input.on("readable", () => {
  const data = input.read()
  if (data) {
    hash.update(data)
  } else {
    let version = hash.digest("base64").replace(/=+/g, "")
    console.log("export default " + JSON.stringify({
      url: "https://scripter.rsms.me/jsdom.js?v=" + version
    }, null, 2))
  }
});
__JS
fi
