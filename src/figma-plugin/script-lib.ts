/// <reference path="./evalscript.d.ts" />
import * as M from "../common/messages"
import { fmtPrintArgs } from "../common/fmtval"
import * as base64 from "../common/base64"
import * as utf8 from "./utf8"
import { rpc } from "./rpc"
import { FetchResponse, FetchHeaders, FetchRequest } from "./fetch"
import { gifInfoBuf } from "../common/gif"
import { jpegInfoBuf } from "../common/jpeg"
import { pngInfoBuf } from "../common/png"
import * as filetype from "../common/filetype"
import * as Path from "../common/path"
import markerProps from "../common/marker-props"
import { LazyNumberSequence } from "../common/lazyseq"
import * as libgeometry from "./script-lib-geometry"


function sourcePosFromStackFrame(frame :string) :M.SourcePos {
  // Note: fig-js stack traces does not include source column information, so we
  // optionally parse the column if present.
  let m = frame.match(/:(\d+)(:?:(\d+)|)\)$/)
  if (!m) {
    return { line: 0, column: 0 }
  }
  let line = parseInt(m[1])
  let column = parseInt(m[2])
  return {
    line: isNaN(line) ? 0 : line,
    column: isNaN(column) ? 0 : column,
  }
}


function indexOfScriptMainStackFrame(frames :string[]) :number {
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].indexOf("__scripter_script_main ") != -1) {
      return i
      break
    }
  }
  // uh, no. fig-js does not contain source information for lambdas.
  // As a last resort, walk backwards and pick first frame that looks like
  // it comes from the plugin.
  for (let i = frames.length; i > 1; ) {
    if (frames[--i].indexOf("<input>:") != -1) {
      return i
    }
  }
  return -1
}


// getSourcePos finds SourcePos for call on current stack, relative to the leaf caller.
// stackOffset can be provided to pick a frame further up the call stack.
//
export function getSourcePos(stackOffset :number = 0) :M.SourcePos {
  let e; try { throw new Error() } catch(err) { e = err }  // workaround for fig-js bug
  let frames = e.stack.split("\n")
  return sourcePosFromStackFrame(frames[2 + stackOffset] || "")
}


// getFirstSourcePos is a speecial version of getSourcePos which returns the first
// location that is known, starting at the outermost (callee of this function) frame.
//
export function getFirstSourcePos(stackOffset :number = 0) :M.SourcePos {
  let e; try { throw new Error() } catch(err) { e = err }  // workaround for fig-js bug
  let frames = e.stack.split("\n")
  let pos :M.SourcePos = {line:0, column:0}
  let mainFrameIdx = indexOfScriptMainStackFrame(frames)
  let frameidx = 2 + stackOffset
  while (pos.line == 0 && frameidx <= mainFrameIdx) {
    pos = sourcePosFromStackFrame(frames[frameidx] || "")
    frameidx++
  }
  return pos
}


// getTopLevelSourcePos finds SourcePos for call on current, relative to top-level frame
// of the script. stackOffset can be provided to pick a frame further down the call stack.
//
// Example 1:
//
//   1  function foo() {
//   2    print(getTopLevelSourcePos())
//   3  }
//   4  function bar() {
//   5    foo()
//   6  }
//   7  bar()
//
// Output:
//   { line: 7, column: 1 }  // position of bar()
//
// ----------------------------------
// Example 2:
//
//   1  function foo() {
//   2    print(getTopLevelSourcePos(1))  // offset = 1
//   3  }
//   4  function bar() {
//   5    foo()
//   6  }
//   7  bar()
//
// Output:
//   { line: 5, column: 3 }  // position of foo()
//
export function getTopLevelSourcePos(stackOffset :number = 0) :M.SourcePos {
  let e; try { throw new Error() } catch(err) { e = err }  // workaround for fig-js bug
  let frames = e.stack.split("\n")
  let frameidx = indexOfScriptMainStackFrame(frames)
  frameidx -= stackOffset
  return sourcePosFromStackFrame(frames[frameidx] || "")
}



export function base64Encode(data :Uint8Array|ArrayBuffer|string) :string {
  return base64.fromByteArray(
    typeof data == "string" ? utf8.encode(data) :
    data instanceof ArrayBuffer ? new Uint8Array(data) :
    data
  )
}

export function base64Decode(encoded :string) :Uint8Array {
  return base64.toByteArray(encoded)
}


export function confirm(question :string) :Promise<bool> {
  return rpc<M.UIConfirmRequestMsg,M.UIConfirmResponseMsg>(
    "ui-confirm", "ui-confirm-response", { question }
  ).then(r => r.answer)
}


export function fetch(input :any, init? :object) :Promise<FetchResponse> {
  return rpc<M.FetchRequestMsg,M.FetchResponseMsg>(
    "fetch-request", "fetch-response", { input, init }
  ).then(r => new FetchResponse(r))
}

export {
  markerProps,
  fmtPrintArgs,
  Path,
  FetchHeaders as Headers,
  FetchResponse as Response,
  FetchRequest as Request,
  LazyNumberSequence,
  libgeometry,
}

export function fileType(nameOrData :ArrayLike<byte>|ArrayBuffer|string) :filetype.Info|null {
  if (typeof nameOrData == "string") {
    let ext = Path.ext(nameOrData)
    if (!ext) {
      return null
    }
    return filetype.lookupExt(ext)
  }
  return filetype.lookupHeader(nameOrData)
}


interface IImg { // synced with scripter-env.d.ts
  __scripter_image_marker__ :1

  url         :string
  type        :string  // mime type
  width       :number  // 0 means "unknown"
  height      :number  // 0 means "unknown"
  pixelWidth  :number  // 0 means "unknown"
  pixelHeight :number  // 0 means "unknown"
  source      :string|Uint8Array
  data        :Uint8Array|null  // same as source when loaded
  meta        :{[k:string]:any}  // type-specific metadata

  _guessFromData() :void
}
interface ImgOptions { // synced with scripter-env.d.ts
  type?   :string  // mime type
  width?  :number
  height? :number
}

export function Img(
  this: IImg,
  source :string|ArrayBufferLike|Uint8Array|ArrayLike<number>,
  optionsOrWidth? :ImgOptions|number,
) :void {
  if (!(this instanceof Img)) {
    return new Img(source, optionsOrWidth)
  }
  this.__scripter_image_marker__ = 1
  this.type = ""
  this.width = 0
  this.height = 0
  this.pixelWidth = 0
  this.pixelHeight = 0
  this.source = ""
  this.data = null
  this.meta = {}
  if (optionsOrWidth) {
    if (typeof optionsOrWidth == "object") {
      let o = optionsOrWidth
      this.type = o.type || this.type
      this.width = o.width || this.width
      this.height = o.height || this.height
    } else {
      this.width = optionsOrWidth
    }
  }
  if (this.type == "") {
    let info = fileType(source)
    if (info) {
      this.type = info.type
    }
  }
  if (typeof source == "string") {
    this.source = source
  } else {
    // ArrayBuffer|Uint8Array => Uint8Array
    this.source = (
      source instanceof Uint8Array ? source :
      new Uint8Array(source)
    )
    this.data = this.source
    this._guessFromData()
  }
}


Img.prototype._guessFromData = function() {
  let buf = this.data // Uint8Array
  let fi = filetype.lookupHeader(buf)
  if (!fi) {
    return
  }
  this.type = fi.type

  let meta = {width:0,height:0}
  try {
    switch (fi.type) {
    case "image/png":
      meta = pngInfoBuf(buf)
      break
    case "image/gif":
      meta = gifInfoBuf(buf)
      break
    case "image/jpeg":
      meta = jpegInfoBuf(buf)
      break
    }
    this.meta = meta
    this.pixelWidth = meta.width
    this.pixelHeight = meta.height
  } catch (e) {
    if (DEBUG) {
      console.warn("Img._guessFromData:", e.stack || String(e))
    }
  }
}


const kPromise = Symbol("promise")


Img.prototype.load = function() :Promise<IImg> {
  let p = this[kPromise]
  if (p) {
    return p
  }
  if (typeof this.source == "string") {
    p = fetch(this.source).then(r => r.arrayBuffer()).then(b => {
      this.data = new Uint8Array(b)
      this._guessFromData()
      return this
    })
  } else {
    p = Promise.resolve(this)
  }
  this[kPromise] = p
  return p
}


interface TypedArrayLike {
  buffer     :ArrayBufferLike
  byteOffset :number
  byteLength :number
}

// new(arrayOrArrayBuffer: ArrayLike<number> | ArrayBufferLike): Uint8Array;
// new(buffer: ArrayBufferLike, byteOffset: number, length?: number): Uint8Array;

type ByteSource = string
                | TypedArrayLike
                | ArrayBufferLike
                | ArrayLike<byte>
                | Iterable<byte>

export function Bytes(input :ByteSource) :Uint8Array {
  if (typeof input == "string") {
    // "Fe 0x24" => [254, 36]
    return new Uint8Array(input.trim().split(/[\s\r\n]+/).map(s => {
      let c1 = s.charCodeAt(1)
      if (c1 == 88 || c1 == 120) {
        // strip leading 0X or 0x
        s = s.substr(2)
      }
      return parseInt(s, 16)
    }))
  }
  if ((input as any).buffer instanceof ArrayBuffer) {
    let a = input as TypedArrayLike
    if (a instanceof Uint8Array) {
      return a
    }
    return new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  }
  let inp :ArrayBufferLike|ArrayLike<byte>/*|Iterable<byte>*/ = input as any
  return new Uint8Array(inp)
}

/*
Argument of type
  'ArrayBuffer | Iterable<number> | ArrayLike<number> | SharedArrayBuffer | TypedArrayLike'
is not assignable to parameter of type
'ArrayBuffer | ArrayLike<number> | SharedArrayBuffer'.

Type 'Iterable<number>' is not assignable to type
  'ArrayBuffer | ArrayLike<number> | SharedArrayBuffer'.
Type 'Iterable<number>' is missing the following properties from type 'SharedArrayBuffer':
  byteLength, length, slice, [Symbol.species], [Symbol.toStringTag]
*/

// ----------------------------------------------------------------------------------------

// libui
//
const libui_base = {
  confirm(question :string) :Promise<bool> {
    return confirm(question)
  },

  notify: (figma as any).notify,  // TODO: update figplug
}
//
// Some of its functions makes use of script request ID and thus this returns
// a new object based on libui_base with additional functions with a closure
// around scriptReqId.
//
export function create_libui(scriptReqId :string) { return {
  // Note: Spread "...other" is not supported in the plugin code (fig-js)
  __proto__: libui_base,

  rangeInput(init? :M.UIRangeInputInit): AsyncIterable<number> {
    if (init) {
      let step = "step" in init ? init.step as number : 1
      let min  = "min" in init ? init.min as number : 0
      let max  = "max" in init ? init.max as number : 1
      if (step == 0) { throw new Error("zero step") }
      if (step > 0 && max < min) { throw new Error("max < min") }
      if (step < 0 && max > min) { throw new Error("max > min") }
    }
    let srcPos = getTopLevelSourcePos()
    return {
      [Symbol.asyncIterator]() {
        return new UIInputIterator<M.UIRangeInputRequestMsg>(srcPos, scriptReqId, "range", init)
      }
    }
  },

}}


let nextInstanceId = 0


class UIInputIterator<ReqT extends M.UIInputRequestMsg = M.UIInputRequestMsg> {
  readonly srcPos      :M.SourcePos
  readonly scriptReqId :string
  readonly init?       :ReqT["init"]
  readonly type        :ReqT["controllerType"]
  readonly instanceId  :string

  // state
  value = 0
  done = false

  constructor(
    srcPos :M.SourcePos,
    scriptReqId :string,
    type :ReqT["controllerType"],
    init? :ReqT["init"],
  ) {
    this.srcPos = srcPos
    this.scriptReqId = scriptReqId
    this.init = init
    this.type = type
    this.instanceId = "instance-" + (nextInstanceId++).toString(36)
  }

  async next(...args: []): Promise<IteratorResult<number>> {
    if (this.done) {
      return { value: this.value, done: true }
    }

    dlog("UIInputIterator send request")

    let r = await rpc<ReqT, M.UIInputResponseMsg>("ui-input-request", "ui-input-response", {
      instanceId: this.instanceId,
      srcPos: this.srcPos,
      srcLineOffset: evalScript.lineOffset,
      scriptReqId: this.scriptReqId,
      controllerType: this.type,
      init: this.init,
    } as ReqT)

    if (r.done) {
      this.done = true
      if (this.value == r.value) {
        // no tail value
        return { value: this.value, done: true }
      }
    }

    this.value = r.value

    return { value: this.value, done: false }
  }

}

