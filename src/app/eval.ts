import { EvalRequestMsg, EvalResponseMsg, EvalCancellationMsg, PrintMsg } from "../common/messages"
import { SourceMapConsumer, SourceMapGenerator } from "../misc/source-map"
import * as warningMessage from "./warning-message"
import { editor } from "./editor"
import toolbar from "./toolbar"
import { print, dlog } from "./util"


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

  // format message
  let message = msg.message

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

  editor.msgZones.set(pos, message)
}


async function resolveOrigSourcePos(
  pos :SourcePos,
  lineOffset :number,
  sourceMapJSON :string,
) :Promise<SourcePos> {
  if (!sourceMapJSON) {
    return { line:0, column:0 }
  }

  ;(SourceMapConsumer as any).initialize({
    "lib/mappings.wasm": "source-map-" + SOURCE_MAP_VERSION + "-mappings.wasm",
  })

  // scripter:1.ts -> scripter:1.js
  let map1 = JSON.parse(sourceMapJSON)
  // map1.file = "script.js"
  // map1.sources = ["script.ts"]
  let sourceMap1 = await new SourceMapConsumer(map1)
  // print("map1:", JSON.stringify(map1, null, 2))
  if (lineOffset == 0) {
    let pos1 = sourceMap1.originalPositionFor(pos)
    sourceMap1.destroy()
    return pos1
  }

  // script.js -> wrapped-script.js
  let map2 = new SourceMapGenerator({ file: "script.js" })
  sourceMap1.eachMapping(m => {
    map2.addMapping({
      original: { line: m.originalLine, column: m.originalColumn },
      generated: { line: m.generatedLine + lineOffset, column: m.generatedColumn },
      source: m.source,
      name: m.name,
    })
  })
  // print("map2:", JSON.stringify(map2.toJSON(), null, 2));
  let sourceMap2 = await SourceMapConsumer.fromSourceMap(map2)

  // search for column when column is missing in pos
  let pos2 :SourcePos
  if (pos.column > 0) {
    pos2 = sourceMap2.originalPositionFor(pos) as SourcePos
  } else {
    let pos1 = {...pos}
    for (let col = 0; col < 50; col++) {
      pos1.column += col
      pos2 = sourceMap2.originalPositionFor(pos1) as SourcePos
      if (pos2.line !== null) {
        break
      }
    }
  }

  // dlog("originalPositionFor(" + JSON.stringify(pos) + ")", JSON.stringify(pos2, null, 2))

  sourceMap1.destroy()
  sourceMap2.destroy()

  return pos2
}

