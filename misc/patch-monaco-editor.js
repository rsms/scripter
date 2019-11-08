const fs = require("fs")
const Path = require("path")

process.chdir(__dirname + "/..")

const excludeLibPattern = /dom/
const tsdir = "node_modules/typescript"
const monacoEditorDir = "src/monaco/monaco-editor"

function visit(file, depth) {
  let s = fs.readFileSync(file, "utf8")

  s = s.replace(/\/\*\!((?!(\*\/)).)+\*\/\n/gsm, "")

  // ^((?!(abc|def)).)*$

  // Copyright

  if (depth < 20) {
    if (depth > 0) {
      // <reference no-default-lib="true"/>
      s = s.replace(/\/{3}\s*<reference\s+no-default-lib="true"\s*\/>\r?\n/, "")
    }
    // <reference lib="esnext" />
    s = s.replace(/\/{3}\s*<reference\s+lib="([^"]+)"\s*\/>\r?\n?/g, (substr, path) => {
      let file2path = path.endsWith(".d.ts") ? path : `lib.${path}.d.ts`
      if (excludeLibPattern.test(path)) {
        console.log(`  - ${file2path}`)
        return ""
      }
      console.log(`  + ${file2path}`)
      let file2 = Path.resolve(Path.dirname(file), file2path)
      return `//! ${file2path}\n` + visit(file2, depth + 1)
    })
  }

  s = s.replace(/^\/\/(?:[^\!][^\r\n]*|)\r?\n/gm, "")

  // console.log(s)
  return s
}

// source all libs
let libEntryFile = tsdir + "/lib/lib.esnext.full.d.ts"
console.log(`read ${libEntryFile}`)
let str = visit(libEntryFile, 0)

// collapse empty lines
str = str.replace(/^[\r\n]+/gm, "")

// prepend no-default-lib directive
str = '/// <reference no-default-lib="true"/>\n' + str

// finally, append thing declared in lib.dom.d.ts which are actually available in Figma plugins
str += "\n" + fs.readFileSync(__dirname + "/figma-extras.d.ts", "utf8")

// // write build/lib.scripter.d.ts
// fs.writeFileSync("build/lib.scripter.d.ts", str, "utf8")

let js = `export const lib_dts = ${JSON.stringify(str)};`
let scripterLibJsFile = monacoEditorDir + "/esm/vs/language/typescript/lib/scripter.js"
console.log(`write ${scripterLibJsFile}`)
fs.writeFileSync(scripterLibJsFile, js, "utf8")

// patch tsWorker.js
// ...
// - import { lib_dts, lib_es6_dts } from './lib/lib.js';
// + import { lib_dts, lib_dts as lib_es6_dts } from './lib/scripter.js';
// ...
const tsWorkerJsFile = monacoEditorDir + "/esm/vs/language/typescript/tsWorker.js"
let tsWorkerJs = fs.readFileSync(tsWorkerJsFile, "utf8")
tsWorkerJs = tsWorkerJs.replace(
  /import[^\r\n]+lib_dts[^\r\n]+/m,
  "import { lib_dts, lib_dts as lib_es6_dts } from './lib/scripter.js';"
)
console.log(`write ${tsWorkerJsFile}`)
fs.writeFileSync(tsWorkerJsFile, tsWorkerJs, "utf8")


// copy monaco.d.ts and modularize
//
// declare namespace editor {...} => ""
let monacoDtsFile = "src/monaco/monaco.d.ts"
let monacoDts = fs.readFileSync(monacoDtsFile, "utf8")
// declare namespace monaco {
monacoDts = monacoDts.replace(/declare\s+namespace\s+monaco\s*\{\n/gm, "")
//
// remove terminating "}"
let i = monacoDts.lastIndexOf("}", monacoDts.indexOf("declare namespace"))
monacoDts = monacoDts.substr(0, i) + monacoDts.substr(i+1)
//
// declare namespace monaco.editor {...} => declare namespace editor {...}
// declare namespace monaco.languages.html {
monacoDts = monacoDts.replace(
  /declare\s+namespace\s+monaco\.([^\s]+)\s*\{\n/gm,
  "declare namespace $1 {")
console.log(`write ${monacoDtsFile}`)
fs.writeFileSync(monacoDtsFile, monacoDts, "utf8")
