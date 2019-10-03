import { isTypedArray } from "./typed-array"
import { LazyNumberSequence } from "../common/lazyseq"
import markerProps from "./marker-props"


export function fmtPrintArgs(args :any[]) :string {
  let message = ""
  let prevWasLinebreak = false
  for (let i = 0, endindex = args.length - 1; i <= endindex; i++) {
    let s = fmtValue(args[i])
    if (s && s[s.length-1] == "\n") {
      if (message.length && message[message.length-1] == " ") {
        message = message.substr(0, message.length-1)
      }
      prevWasLinebreak = true
    } else if (prevWasLinebreak) {
      prevWasLinebreak = false
    } else if (i != endindex) {
      s += " "
    }
    message += s
  }
  return message
}

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

    if (v instanceof ArrayBuffer) {
      return "<ArrayBuffer " + v.byteLength + ">"
    }

    if (isTypedArray(v)) {
      let maxlen = 32 / v.BYTES_PER_ELEMENT
      let v2 = v.length > maxlen ? v.subarray(0, maxlen) : v
      return (
        "<" + v.constructor.name + " " + v.length + (
          v.length == 0 ? ">" :
          " [" + Array.from(v2).map(v => v.toString(16)).join(" ") +
          (v2 === v ? "]>" : " ...]>")
        )
      )
    }

    if (Array.isArray(v)) {
      if (v.length > 10) {
        return "[" + v.map(v => ln2 + _fmtValue(v, ln2, seen)).join(",") + "]"
      }
      return "[" + v.map(v => _fmtValue(v, ln2, seen)).join(", ") + "]"
    }

    if ("__scripter_lazy_seq__" in v) {
      v.__proto__ = LazyNumberSequence.prototype
      return "LazySeq[" + v.toString() + "]"
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

    let pairs :string[] = []
    for (let k of Object.keys(v)) {
      if (!(k in markerProps)) {
        let ks = jsPropNameRe.test(k) ? k : JSON.stringify(k)
        pairs.push(ks + ": " + _fmtValue(v[k], ln2, seen))
      }
    }
    return "{" + pairs.join("," + ln2) + "}"
  }

  if (t == "function") {
    return "[Function" + (v.name ? " " + v.name : "") + "]"
  }

  return String(v)
}
