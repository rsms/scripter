import { EvalRequestMsg, EvalResponseMsg, EvalCancellationMsg, PrintMsg } from "../common/messages"
import { fmtValue } from "../common/fmtval"
import * as base64 from "../common/base64"
import * as warningMessage from "./warning-message"
import { editor } from "./editor"
import toolbar from "./toolbar"
import { print, dlog } from "./util"
import { resolveOrigSourcePos } from "./srcpos"
import { PrintViewZone } from "./viewzone"


export interface EvalPromise extends Promise<any> {
  // unique identifier of the underlying eval transaction
  readonly id :string

  // cancel aborts the evaluation. If reason is provided, the promise will be rejected
  // with that error. Otherwise the promies is resolved to undefined.
  // This may be useful for stopping run-away scripts.
  //
  cancel(reason? :Error) :void
}


export interface Runtime {
  // sending messages to the runtime
  send<T>(m :T) :void
}

export type RuntimeMsg = {
  type: "eval-response"
      | "print"
  [k :string] :any
}

export type RuntimeMessageHandler = (m:RuntimeMsg)=>void



class NullRuntime implements Runtime {
  send<T>(m :T) {}
}

let runtime :Runtime = new NullRuntime()



// setRuntime configures eval to use r for executing scripts.
// The returned function should be used by the runtime message reception
// mechanism to handle a message from the runtime.
//
export function setRuntime(r :Runtime) :RuntimeMessageHandler {
  runtime = r
  return handleRuntimeMessage
}


// run evaluates a script, resolving the promise when the script has completed running,
// including waiting for any timers run by the script.
//
export function run(js :string, sourceMapJSON :string) :EvalPromise {
  js = js.replace(/\n\/\/#\s*sourceMappingURL=.+/, "")
  let id = (nextEvalRequestId++).toString(36)
  let p = new Promise<any>(async (resolve, reject) => {
    liveEvalRequests.set(id, {resolve, reject, sourceMapJSON})
    dlog(`send eval request ${id}\n${js}`)
    runtime.send<EvalRequestMsg>({ type: "eval", id, js })
  }) as EvalPromise
  ;(p as any).id = id
  p.cancel = (reason? :Error) => cancel(id, reason)
  return p
}


export function cancel(id :string, reason? :Error) :bool {
  let tx = dequeueTransaction(id)
  if (!tx) {
    return false
  }
  runtime.send<EvalCancellationMsg>({ type: "eval-cancel", id })
  if (reason) {
    tx.reject(reason)
  } else {
    tx.resolve(undefined)
  }
  return true
}


interface EvalTransaction {
  resolve(res :any) :void
  reject(e :Error) :void
  sourceMapJSON :string // may be empty
}

var liveEvalRequests = new Map<string,EvalTransaction>()
var nextEvalRequestId = (new Date).getTime()


function dequeueTransaction(id :string) :EvalTransaction|undefined {
  let t = liveEvalRequests.get(id)
  if (t) {
    liveEvalRequests.delete(id)
  }
  return t
}


function handleRuntimeMessage(msg :RuntimeMsg) {
  switch (msg.type) {
  case "eval-response": handleResponseMsg(msg as EvalResponseMsg) ; break
  case "print":         handlePrintMsg(msg as PrintMsg) ; break
  default:
    console.warn(`eval received unexpected message ${msg.type} from runtime`)
  }
}


async function handleResponseMsg(msg :EvalResponseMsg) {
  let tx = dequeueTransaction(msg.id)
  if (!tx) {
    return
  }
  if (msg.error) {
    dlog("received error response:", msg)
    if (tx.sourceMapJSON && msg.srcPos) {
      for (let p of msg.srcPos) {
        // find and pick first matching source position as the error origin
        let pos = await resolveOrigSourcePos(p, msg.srcLineOffset, tx.sourceMapJSON)
        if (pos.line > 0) {
          editor.decorateError(pos, msg.error)
          break
        }
      }
    }
    warningMessage.show(msg.error)
    tx.reject(new Error(msg.error))
  } else {
    tx.resolve(msg.result)
  }
}


let tempEl :HTMLElement|null = null

function htmlEncode(text :string) :string {
  if (!tempEl) {
    tempEl = document.createElement("div")
  }
  tempEl.innerText = text
  return tempEl.innerHTML
}


export function getSourceMapForRequest(reqId :string) :string|null {
  let t = liveEvalRequests.get(reqId)
  if (!t) {
    return null
  }
  return t.sourceMapJSON
}


async function handlePrintMsg(msg :PrintMsg) {
  let t = liveEvalRequests.get(msg.reqId)
  if (!t) {
    return
  }

  let pos = msg.srcPos as SourcePos
  if (pos.line == 0 || !t.sourceMapJSON) {
    dlog("handlePrintMsg: ignoring print with zero srcPos", msg)
    return
  }

  pos = await resolveOrigSourcePos(pos, msg.srcLineOffset, t.sourceMapJSON)
  if (pos.line == 0) {
    return
  }

  // html to show in message zone before the text message
  let htmlPrefix = ""

  // format message
  let messageHtml = ""
  if (msg.args) {
    // extract images
    let args = []
    let prevWasText = false
    for (let arg of msg.args) {
      if (arg && typeof arg == "object" && "__scripter_image_marker__" in arg) {
        // the arg is an image
        let url = ""
        if (typeof arg.source == "string") {
          url = arg.source
        } else {
          let buf = (
            arg.source instanceof Uint8Array ? arg.source :
            new Uint8Array(arg.source)
          )
          url = "data:" + arg.type + ";base64," + base64.fromByteArray(buf)
        }
        messageHtml += `<img src="${url}" referrerpolicy="no-referrer"`
        let width = Math.max(0, arg.width || 0)
        let height = Math.max(0, arg.height || 0)
        if (width <= 0 && height <= 0) {
          let displayScale = window.devicePixelRatio || 1
          if (arg.pixelWidth <= 0 && arg.pixelHeight <= 0) {
            height = 32  // fallback
          } else {
            if (width <= 0 && arg.pixelWidth) {
              width = arg.pixelWidth / displayScale
            }
            if (height <= 0 && arg.pixelHeight) {
              height = arg.pixelHeight / displayScale
            }
          }
        }
        if (width) { messageHtml += ` width="${width}"` }
        if (height) { messageHtml += ` height="${height}"` }
        messageHtml += `>`
        prevWasText = false
      } else {
        if (prevWasText) {
          messageHtml += " "
        }
        messageHtml += htmlEncode(fmtValue(arg))
        prevWasText = true
      }
    }
  } else {
    messageHtml = htmlEncode(msg.message)
  }

  // TODO: find end of print statement and adjust line if it spans more than one line.
  // Example: Currently this is what happens:
  //
  //   print("single line")
  //   > single line
  //
  //   print("multiple",
  //   > multiple
  //   > lines
  //         "lines")
  //
  // It would be much nicer to have this:
  //
  //   print("multiple",
  //         "lines")
  //   > multiple
  //   > lines
  //

  editor.viewZones.set(new PrintViewZone(pos, messageHtml))
}
