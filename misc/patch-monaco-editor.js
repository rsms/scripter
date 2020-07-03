const fs = require("fs")
const Path = require("path")

process.chdir(__dirname + "/..")

const excludeLibPattern = /dom/
const tsdir = "node_modules/typescript"
const monacoEditorDir = "src/monaco/monaco-editor"


function stripNoDefaultLib(s) {
  // <reference no-default-lib="true"/>
  return s.replace(/\/{3}\s*<reference\s+no-default-lib="true"\s*\/>\r?\n/, "")
}


function stripBlockComments(s) {
  return s.replace(/\/\*\!((?!(\*\/)).)+\*\/\n/gsm, "")
}


function stripLineComments(s) {
  return s.replace(/^\/\/(?:[^\!][^\r\n]*|)\r?\n/gm, "")
}


function visit(file, depth) {
  let s = fs.readFileSync(file, "utf8")

  s = stripBlockComments(s)

  // ^((?!(abc|def)).)*$

  // Copyright

  if (depth < 20) {
    if (depth > 0) {
      // <reference no-default-lib="true"/>
      s = stripNoDefaultLib(s)
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

  s = stripLineComments(s)

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

// // append DOM, namespaced as WebDOM
// let dom_dts = fs.readFileSync(tsdir + "/lib/lib.dom.d.ts", "utf8")
// dom_dts += "\n" + fs.readFileSync(tsdir + "/lib/lib.dom.iterable.d.ts", "utf8")
// dom_dts = stripBlockComments(dom_dts)
// dom_dts = stripNoDefaultLib(dom_dts)
// dom_dts = stripLineComments(dom_dts)
// str += "\nnamespace WebDOM {\n" + dom_dts + "\n} // namespace WebDOM\n"

// finally, append stuff declared in lib.dom.d.ts which are actually available in
// Figma plugins, like Console.
str += "\n" + fs.readFileSync(__dirname + "/figma-extras.d.ts", "utf8")

// // write build/lib.scripter.d.ts
// fs.writeFileSync("build/lib.scripter.d.ts", str, "utf8")

let js = `export const lib_dts = ${JSON.stringify(str)};`
let scripterLibJsFile = monacoEditorDir + "/esm/vs/language/typescript/lib/scripter.js"
console.log(`write ${scripterLibJsFile}`)
fs.writeFileSync(scripterLibJsFile, js, "utf8")


patch("esm/vs/language/typescript/tsWorker.js", js => {
  // ...
  // - import { lib_dts, lib_es6_dts } from './lib/lib.js';
  // + import { lib_dts, lib_dts as lib_es6_dts } from './lib/scripter.js';
  // ...
  js = js.replace(
    /import[^\r\n]+lib_dts[^\r\n]+/m,
    "import { lib_dts, lib_dts as lib_es6_dts } from './lib/scripter.js';"
  )
  // ...
  // - text = model.getValue();
  // + text = model.getValue() + "\nexport {};\n";
  // ...
  // This makes all files modules
  js = js.replace(
    /text\s*=\s*model\.getValue\(\)\s*;/,
    "text = model.getValue() + '\\nexport {};\\n';"
  )
  return js
})

patch("esm/vs/base/common/labels.js", (js, p) => {
  js = p.addImport(js, "import * as scripter from '../../editor/scripter.js'")
  js = js.replace(
    /(function\s+getBaseLabel\([^\)]*\)\s+\{)/,
    "$1\n    let s = scripter.getBaseLabel(resource); if (s) { return s }"
  )
  return js
})

patch("esm/vs/base/common/resources.js", (js, p) => {
  js = p.addImport(js, "import * as scripter from '../../editor/scripter.js'")
  js = js.replace(
    /(function\s+basenameOrAuthority\([^\)]*\)\s+\{)/,
    "$1\n    let s = scripter.basenameOrAuthority(resource);if (s) { return s }"
  )
  return js
})


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



function patch(filename, f) {
  filename = Path.resolve(monacoEditorDir, filename)
  let js = fs.readFileSync(filename, "utf8")
  const p = {
    addImport(js, importjs) {
      let i = js.lastIndexOf("\nimport")
      i = i == -1 ? 0 : Math.max(js.indexOf("\n", i + 6), i + 7)
      return (
        js.substr(0, i) +
        "\n" + importjs +
        js.substr(i)
      )
    },
  }
  js = f(js, p)
  console.log(`patch ${filename}`)
  fs.writeFileSync(filename, js, "utf8")
}
