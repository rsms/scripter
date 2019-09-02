export function fmtValue(v :any) :string {
  return _fmtValue(v, "\n", new Set<any>())
}

const jsPropNameRe = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/

function _fmtValue(v :any, ln :string, seen :Set<any>) :string {
  let t = typeof v

  if (v === null) {
    return "null"
  }
  if (v === undefined) {
    return "undefined"
  }

  let ln2 = ln + "  "

  if (t == "object" || t == "function") {
    if (seen.has(v)) {
      return "[cyclic]"
    }
    seen.add(v)
  }

  if (t == "object") {
    if (Array.isArray(v)) {
      if (v.length > 10) {
        return "[" + v.map(v => ln2 + _fmtValue(v, ln2, seen)).join(",") + "]"
      }
      return "[" + v.map(v => _fmtValue(v, ln2, seen)).join(", ") + "]"
    }

    // let it = v[]
    if (Symbol.iterator in v) {
      let isMap = v instanceof Map
      let a = Array.from(v) as any[]
      let isLong = a.length > 10

      let s = v.constructor.name + "{"
      if (a.length == 0) {
        return s + "}"
      }

      for (let i = 0; i < a.length; i++) {
        let v = a[i] as any
        if (i > 0) {
          s += ","
        }
        if (isLong) {
          s += ln2
        } else {
          s += " "
        }
        if (isMap) {
          s += _fmtValue(v[0], ln2, seen) + " => " + _fmtValue(v[1], ln2, seen)
        } else {
          s += _fmtValue(v, ln2, seen)
        }
      }
      return s + (isLong ? ln : " ") + "}"
    }

    if (v instanceof Date) {
      return String(v)
    }

    if (v instanceof ArrayBuffer) {
      return "ArrayBuffer{ byteLength: " + v.byteLength + " }"
    }

    return "{" + Object.keys(v).map(k => {
      if (!jsPropNameRe.test(k)) {
        k = JSON.stringify(k)
      }
      return k + ": " + _fmtValue(v[k], ln2, seen)
    }).join("," + ln2) + "}"
  }

  if (t == "function") {
    return "[Function" + (v.name ? " " + v.name : "") + "]"
  }

  return String(v)
}
