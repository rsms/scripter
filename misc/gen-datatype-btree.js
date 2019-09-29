const fs = require("fs")
const Path = require("path")

// special value object property that is used for a code comment for the
// generated line.
const kComment = Symbol("comment")

// ANY represents "any byte"
const ANY = 0x100

var hadErrors = false

function err() {
  hadErrors = true
  console.error.apply(console, Array.prototype.slice.call(arguments))
}

const infoMap = new Map()
const inputMap = new Map()  // headerBytes => info

function internInfo(headerBytes, info) {
  let e = infoMap.get(info.type)
  if (e) {
    e.headerBytes.add(headerBytes)
    for (let k in info) {
      let v = info[k]
      if (v === undefined || v === null) {
        continue
      }
      if (Array.isArray(v)) {
        v = Array.from(new Set((e.info[k]||[]).concat(v)))
      }
      e.info[k] = v
    }
    return e.info
  }
  infoMap.set(info.type, { info, headerBytes: new Set([headerBytes]) })
  return info
}

fs.readFileSync(__dirname + "/file-types.txt", "utf8").trim().split(/[\r\n]+/).forEach(line => {
  line = line.trim().replace(/;.*$/g, "").trim()
  if (line == "") {
    return
  }

  // parse line
  let [header, type, extsStr, description] = line.split(/\s*\|\s*/)
  if (!header) { return err(`invalid line ${JSON.stringify(line)}: missing header`) }
  if (!type) { return err(`invalid line ${JSON.stringify(line)}: missing type`) }

  let exts = []
  if (extsStr) {
    // "gif,  GiF" => ["gif", "gif"] => ["gif"]
    exts = Array.from(new Set(extsStr.split(/[\s,]+/).filter(s => s.toLowerCase())))
  }

  // make headerBytes (key)
  let headerBytes = header.split(/\s+/).map(s => {
    if (s == "*" || s == "**") {
      return ANY
    }
    return parseInt(s, 16)
  })

  let info = internInfo(headerBytes, {
    type,
    exts,
    description,
    [kComment]: description,
  })

  // add to btree
  // console.log(headerBytes.map(v => v.toString(16)).join(" "), "=>", fmtjs(info))
  inputMap.set(headerBytes, info)
})

// console.log(inputMap)


class ConstData {
  constructor(name /*string*/) {
    this.name = name
    this.bytes = [] // byte[]
  }

  alloc(bytes /*ArrayLike<byte>*/) {
    const start = this.bytes.length
    const end = start + bytes.length
    this.bytes = this.bytes.concat(bytes)
    return `${this.name}.subarray(${start},${end})`
  }

  getInitJS(leader, trailer) {
    if (this.bytes.length == 0) {
      return ""
    }
    let bytesStr = ''
    let lineStart = 0
    for (const b of this.bytes) {
      const s = b.toString()
      if ((bytesStr.length + 1 + s.length) - lineStart >= 80) {
        lineStart = bytesStr.length
        bytesStr += '\n  '
      }
      bytesStr = bytesStr ? bytesStr + ',' + s : s
    }
    return (
      leader +
      `const ${this.name} = new Uint8Array([` +
        `${lineStart == 0 ? '' : '\n  '}${bytesStr}` +
      `]);` +
      trailer
    )
  }
}


class JSRef {
  constructor(name, value) {
    this.name = name
    this.value = value
  }
}


function bytecmp(a /*:ArrayLike<byte>*/, b /*:ArrayLike<byte>*/) /*:int*/ {
  const aL = a.length, bL = b.length, L = (aL < bL ? aL : bL)
  for (let i = 0; i != L; ++i) {
    if (a[i] < b[i]) { return -1 }
    if (b[i] < a[i]) { return 1 }
  }
  return (
    aL < bL ? -1 :
    bL < aL ? 1 :
    0
  )
}


function fmtjs(obj) {
  // this is slow, but we don't care
  if (obj && typeof obj == "object") {
    if (obj instanceof JSRef) {
      return obj.name
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map(v => fmtjs(v)).join(",") + "]"
    }
    let s = "{"
    for (let k of Object.keys(obj)) {
      let v = obj[k]
      if (v === undefined) {
        continue
      }
      try {
        if (k.replace(/[\s\r\n\t]+/g,"") != k) {
          throw 1
        }
        ;(0,eval)(`let x = {${k}:1}`)
        s += k
      } catch (_) {
        s += JSON.stringify(k)
      }
      s += `:${fmtjs(v)},`
    }
    if (s[s.length-1] == ",") {
      s = s.substr(0, s.length-1)
    }
    s += "}"
    return s
  }
  return JSON.stringify(obj)
}


let nextVarId = 0

function extractValues(inputMap /*Map*/) {  // [vars[], map2]
  let refmap = new Map()  // val => ref
  let map2 = new Map()
  let vars = []
  for (let [k, v] of inputMap.entries()) {
    let ref = refmap.get(v)
    if (!ref) {
      let varname = `v${(nextVarId++).toString(36)}`
      ref = new JSRef(varname, v)
      vars.push(`${varname} = ` + fmtjs(v))
      refmap.set(v, ref)
    }
    map2.set(k, ref)
  }
  return [ vars, map2 ]
}


function genBTree(cdat /*ConstData*/, m /*Map*/) {
  const jsIdRe = /^[a-zA-Z0-9_]+$/

  const indentation = '  '
  const pairs = []
  const sortedKeys = Array.from(m.keys())
  if (typeof sortedKeys[0] == "string") {
    // string keys. use built-in sort function
    sortedKeys.sort()
  } else {
    // array keys
    sortedKeys.sort(bytecmp)
  }

  for (let i = 0; i < sortedKeys.length; ++i) {
    const k = sortedKeys[i]
    pairs.push({ key: k, value: m.get(k)})
  }

  const genBranch = (pairs, indent) => {
    let pair, leftPairs, rightPairs

    if (pairs.length == 1) {
      pair = pairs[0]
    } else {
      const midIndex = Math.floor(pairs.length / 2)-1
      pair = pairs[midIndex]
      leftPairs = pairs.slice(0, midIndex)
      rightPairs = pairs.slice(midIndex + 1)
    }

    let k = pair.key
    let v = pair.value

    // let val = v instanceof JSRef ? v.value : v
    // let comment = val[kComment]
    let comment = v[kComment]
    if (comment !== undefined) {
      comment = ` // ${comment}`
    } else {
      comment = ""
    }

    // let s = `{ k: ${cdat.alloc(strbytes(k))}, v: ${fmtjs(v)},${comment}`
    let s = `{ k: ${fmtjs(strbytes(k))}, v: ${fmtjs(v)},${comment}`

    if (leftPairs && leftPairs.length) {
      s += `\n${indent}  L:${genBranch(leftPairs, indent + indentation)},`
    }
    if (rightPairs && rightPairs.length) {
      s += `\n${indent}  R:${genBranch(rightPairs, indent + indentation)},`
    }
    if (s[s.length-2] == "}" && s[s.length-1] == ",") {
      s = s.substr(0, s.length-1) + "}"
    } else if (!comment) {
      if (s[s.length-1] == ",") {
        s = s.substr(0, s.length-1) + "}"
      } else {
        s += `}`
      }
    } else {
      s += `\n${indent}}`
    }
    return s
  }

  return genBranch(pairs, indentation)
}

function strbytes(s) {
  return Array.isArray(s) ? s : Array.from(s).map(s => s.charCodeAt(0))
}

function makeExtMap(m) {  // : [k,v][]
  // create mappings from ext => info
  let extMap = {}
  for (let [k, v] of m.entries()) {
    let info = v instanceof JSRef ? v.value : v
    if (info.exts) for (let ext of info.exts) {
      let existing = extMap[ext]
      if (existing) {
        existing.add(v)
      } else {
        extMap[ext] = new Set([ v ])
      }
    }
  }
  return Object.keys(extMap).map(k => [ k, Array.from(extMap[k]) ])
}

const [ vars, inputMapWithRefs ] = extractValues(inputMap)

const cdat = new ConstData('cdat')
const btreeJs = genBTree(cdat, inputMapWithRefs)
const extMap = makeExtMap(inputMapWithRefs)

console.log(
  "// generated by " + Path.basename(__dirname) + "/" + Path.basename(__filename) + "\n" +
  "const [fileHeaders, fileExts] = (" +
  "function() :[BTree<FileTypeInfo>,Map<string,FileTypeInfo[]>] {\n" +
  "  const " + vars.join(",\n        ") + ";\n" +
     cdat.getInitJS('  ', '\n') +
  '  const headers = new BTree<FileTypeInfo>(\n' +
  '    ' + btreeJs.replace(/\n/g, "\n  ") + ')\n' +
  `  const exts = new Map<string,FileTypeInfo[]>([\n` +
  '    ' + extMap.map(v => fmtjs(v)).join(",\n    ") + "\n" +
  `  ]);\n` +
  `  return [headers, exts]\n` +
  `})()`
)

if (hadErrors) {
  process.exit(1)
}
