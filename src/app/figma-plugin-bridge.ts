import {
  Msg,
  TransactionalMsg,
  RPCErrorResponseMsg,
  ClosePluginMsg,
  WindowConfigMsg,
  UIConfirmRequestMsg, UIConfirmResponseMsg,
  FetchRequestMsg, FetchResponseMsg,
  UIInputRequestMsg, UIInputResponseMsg, isUIRangeInputRequest,
  LoadScriptMsg,
  UpdateSavedScriptsIndexMsg,
  WorkerCreateRequestMsg, WorkerCreateResponseMsg,
  WorkerMessageMsg, WorkerErrorMsg, WorkerCtrlMsg,
} from "../common/messages"
import * as Eval from "./eval"
import { config } from "./config"
import { resolveOrigSourcePos } from "./srcpos"
import { dlog, print } from "./util"
import { editor } from "./editor"
import { InputViewZone } from "./viewzone"
import { UIInput } from "./ui-input"
import { UIRangeInput, UIRangeInputInit } from "./ui-range"
import savedScripts from "./saved-scripts"
import * as workerTemplate from "./worker-template"


// const defaultApiVersion = "1.0.0" // used when there's no specific requested version

// // try to parse version from URL query string
// export const apiVersion = (() => {
//   if (document && document.location) {
//     let s = document.location.search
//     dlog(s)
//   }
//   return defaultApiVersion
// })()


export function sendMsg<T extends Msg>(msg :T, transfer? :Transferable[]) {
  parent.postMessage(msg, '*', transfer)
}



export class FigmaPluginEvalRuntime implements Eval.Runtime {
  send<T>(m :T) {
    parent.postMessage(m, '*')
  }
}


function sendWindowConfigMsg() {
  let msg :WindowConfigMsg = {
    type: "window-config",
    width: config.windowSize[0],
    height: config.windowSize[1],
  }
  parent.postMessage(msg, '*')
}


async function rpc_reply<T extends TransactionalMsg>(
  id :string,
  resType :T["type"],
  f :() => Promise<Omit<T, "id"|"type">>,
) {
  let reply = {}
  try {
    reply = await f()
    parent.postMessage({ type: resType, id, ...reply }, '*')
  } catch(e) {
    dlog(`rpc error: ${e.stack||e}`)
    let m :RPCErrorResponseMsg = {
      type: "rpc-error-response",
      responseType: resType,
      id,
      name: e.name || "Error",
      message: e.message || "error",
      stack: String(e.stack) || "error",
    }
    parent.postMessage(m, '*')
  }
}


function rpc_confirm(req :UIConfirmRequestMsg) {
  rpc_reply<UIConfirmResponseMsg>(req.id, "ui-confirm-response", async () => {
    let answer = confirm(req.question)
    return { answer }
  })
}


function rpc_fetch(req :FetchRequestMsg) {
  rpc_reply<FetchResponseMsg>(req.id, "fetch-response", async () => {
    let r = await fetch(req.input, req.init)

    let headers :Record<string,string> = {}
    r.headers.forEach((v, k) => {
      headers[k] = v
    })

    let body :Uint8Array|null = r.body ? new Uint8Array(await r.arrayBuffer()) : null

    let response = {
      headers,
      redirected: r.redirected,
      status:     r.status,
      statusText: r.statusText,
      resType:    r.type,
      url:        r.url,
      body,
    }
    dlog("fetch response", response)
    return response
  })
}


interface ScripterWorkerI {
  postMessage(message :any, transfer? :Transferable[]) :void
  terminate() :void
  onmessage      :(this: ScripterWorkerI, ev: MessageEvent) => any
  onmessageerror :(this: ScripterWorkerI, ev: MessageEvent) => any
  onerror        :(this: ScripterWorkerI, ev: ErrorEvent) => any
}


const iframeWorkers = new Map<MessageEventSource,IFrameWorker>()
let iframeWorkersInit = false

function worker_iframeInit() {
  if (iframeWorkersInit) {
    return
  }
  iframeWorkersInit = true

  window.addEventListener('message', ev => {
    let worker = iframeWorkers.get(ev.source)
    //dlog("iframe supervisor got message", ev, {worker})
    if (worker) {
      worker._onmessage(ev)
      ev.stopPropagation()
      ev.preventDefault()
    }
  })

  window.addEventListener('messageerror', ev => {
    let worker = iframeWorkers.get(ev.source)
    //dlog("iframe supervisor got messageerror", ev, {worker})
    if (worker) {
      worker.onmessageerror(ev)
      ev.stopPropagation()
      ev.preventDefault()
    }
  })
}


class IFrameWorker implements ScripterWorkerI {
  readonly workerId :string
  readonly frame :HTMLIFrameElement
  readonly recvq :{ message :any, transfer? :Transferable[] }[] = []

  onmessage      :(this: ScripterWorkerI, ev: MessageEvent) => any
  onmessageerror :(this: ScripterWorkerI, ev: MessageEvent) => any
  onerror        :(this: ScripterWorkerI, ev: ErrorEvent) => any

  ready = false
  closed = false

  constructor(workerId :string, scriptBody :string) {
    this.workerId = workerId
    this.frame = document.createElement("iframe")
    const frame = this.frame

    worker_iframeInit()

    frame.setAttribute("sandbox", "allow-scripts")
    frame.onerror = err => {
      this.onerror(err as any as ErrorEvent) // FIXME
    }

    const S = frame.style
    S.position = "fixed"
    S.zIndex = "-1"
    S.left = "10px"
    S.top = "10px"
    S.width = "800px"
    S.height = "600px"
    S.visibility = "hidden"
    S.pointerEvents = "none"
    document.body.appendChild(frame)

    iframeWorkers.set(frame.contentWindow, this)

    let blobParts = [
      `<html><head></head><body><script type='text/javascript'>`,
      workerTemplate.frame[0],  // generated from worker-frame-template.js
      workerTemplate.worker[0], // generated from worker-template.js
      scriptBody,
      workerTemplate.worker[1],
      workerTemplate.frame[1],,
      `</script></body></html>`,
    ]
    let url = URL.createObjectURL(new Blob(blobParts, {type: "text/html;charset=utf8"} ))
    frame.src = url
    setTimeout(() => { URL.revokeObjectURL(url) }, 1)
  }

  onReady() {
    dlog("iframe ready. recvq:", this.recvq)
    this.ready = true
    for (let { message, transfer } of this.recvq) {
      this.postMessage(message, transfer)
    }
    this.recvq.length = 0
  }

  _onmessage(ev :MessageEvent) {
    if (ev.data === "__scripter_iframe_ready") {
      this.ready || this.onReady()
    } else if (ev.data === "__scripter_iframe_close") {
      this.terminate()
    } else {
      this.onmessage(ev)
    }
  }

  postMessage(message :any, transfer? :Transferable[]) :void {
    dlog("postmessage to iframe", message)
    if (this.ready) {
      this.frame.contentWindow.postMessage(message, "*", transfer)
    } else {
      this.recvq.push({ message, transfer })
    }
  }

  terminate() :void {
    if (this.closed) {
      return
    }
    this.closed = true
    iframeWorkers.delete(this.frame.contentWindow)
    this.frame.parentElement.removeChild(this.frame)
    this.frame.src = "about:blank"
    ;(this as any).frame = null
  }
}


function worker_createWebWorker(workerId :string, scriptBody :string) :ScripterWorkerI {
  let blobParts = [
    workerTemplate.worker[0], // generated from worker-template.js
    scriptBody,
    workerTemplate.worker[1]
  ]
  let workerURL = URL.createObjectURL(new Blob(blobParts, {type: "application/javascript"} ))
  let worker = new Worker(workerURL)
  URL.revokeObjectURL(workerURL)
  return worker as any as ScripterWorkerI
}


let workerIdGen = 0
let workers = new Map<string,ScripterWorkerI>()

function rpc_worker_create(req :WorkerCreateRequestMsg) {
  // WorkerCreateRequestMsg, WorkerCreateResponseMsg,
  rpc_reply<WorkerCreateResponseMsg>(req.id, "worker-create-res", async () => {
    dlog("App todo create worker", req)

    let workerId = (workerIdGen++).toString(36)
    let worker = (
      // launch an iframe-based worker
      req.jsdom ? new IFrameWorker(workerId, req.js) :
      worker_createWebWorker(workerId, req.js)
    )

    workers.set(workerId, worker)

    // forward messages to the plugin process
    worker.onmessage = ev => {
      dlog(`app got message from worker#${workerId}`, ev.data)
      let d = ev.data.data
      if (!d) {
        return
      }
      if (d.type == "__scripter_close") {
        return worker_onclose(workerId)
      } else if (d.type == "__scripter_toplevel_err") {
        worker.terminate()
        sendMsg<WorkerErrorMsg>({ type: "worker-error", workerId, error: {
          error:   d.message,
          message: d.stack || d.message,
        } })
        return worker_onclose(workerId)
      }
      sendMsg<WorkerMessageMsg>({
        type: "worker-message",
        evtype: "message",
        workerId,
        data: ev.data.data,
        transfer: ev.data.transfer,
      }, ev.data.transfer)
    }

    worker.onmessageerror = (ev :MessageEvent) => {
      sendMsg<WorkerMessageMsg>({
        type: "worker-message",
        evtype: "messageerror",
        workerId,
        data: ev.data,
      })
    }

    worker.onerror = (ev :ErrorEvent) => {
      console.error("worker error event", ev)
      worker.terminate()
      sendMsg<WorkerErrorMsg>({ type: "worker-error", workerId, error: {
        colno:    ev.colno,
        error:    String(ev.error),
        filename: ev.filename,
        lineno:   ev.lineno,
        message:  ev.message,
      } })
      worker_onclose(workerId)
    }

    return {
      workerId,
    }
  })
}


function worker_onclose(workerId :string) {
  dlog("worker_onclose", workerId)
  if (workers.has(workerId)) {
    dlog("worker_onclose", workerId, "FOUND")
    workers.delete(workerId)
    sendMsg<WorkerCtrlMsg>({
      type: "worker-ctrl",
      workerId,
      signal: "close",
    })
  }
}


function worker_get(msg :{ workerId :string }) : ScripterWorkerI | null {
  let worker = workers.get(msg.workerId)
  if (!worker) {
    // this happens naturally for close & terminate messages, as close & terminate
    // are naturally racey.
    dlog(`ignoring message for non-existing worker#${msg.workerId||""}`, {msg})
    return null
  }
  return worker
}


function worker_postMessage(msg :WorkerMessageMsg) {
  let worker = worker_get(msg)
  if (!worker) { return }
  worker.postMessage(msg.data, msg.transfer)
}


function worker_ctrl(msg :WorkerCtrlMsg) {
  // "terminate" is currently the only supported signal
  if (msg.signal != "terminate") {
    console.warn(`worker_ctrl unexpected signal ${msg.signal}`)
    return
  }
  let worker = worker_get(msg)
  if (!worker) { return }
  worker.terminate()
  worker_onclose(msg.workerId)
}


function createUIInput(msg :UIInputRequestMsg) :UIInput {
  if (isUIRangeInputRequest(msg)) {
    if (msg.init && "value" in msg.init) {
      let v = msg.init.value
      if (typeof v != "number") {
        v = parseFloat(v)
        if (isNaN(v)) {
          delete msg.init.value
        } else {
          msg.init.value = v
        }
      }
    }
    return new UIRangeInput(msg.init)
  } else {
    throw new Error(`unknown input type "${msg.controllerType}"`)
  }
}


let uiInputInstances = new Map<string,InputViewZone>()


function rpc_ui_input(msg :UIInputRequestMsg) {
  rpc_reply<UIInputResponseMsg>(msg.id, "ui-input-response", async () => {
    let viewZone = uiInputInstances.get(msg.instanceId)
    if (!viewZone) {

      let pos = msg.srcPos as SourcePos
      if (pos.line == 0) {
        dlog("[rpc ui-input-response]: ignoring; zero srcPos", msg)
        return { value: 0, done: true }
      }

      let sourceMapJson = Eval.getSourceMapForRequest(msg.scriptReqId)
      if (!sourceMapJson) {
        throw new Error("no source map found for script invocation #" + msg.scriptReqId)
      }

      pos = await resolveOrigSourcePos(pos, msg.srcLineOffset, sourceMapJson)
      if (!pos.line) {
        return { value: 0, done: true }
      }

      // DISABLED: replacing view zone can lead to infinite loops
      // viewZone = editor.viewZones.get(pos) as InputViewZone|null
      // if (viewZone && !((viewZone as any) instanceof InputViewZone)) {
      //   // replace other view zone on same line
      //   viewZone.removeFromEditor()
      //   viewZone = null
      // }

      let input = createUIInput(msg)
      viewZone = new InputViewZone(pos.line, input)
      if (editor.viewZones.add(viewZone) == "") {
        // existing view zone conflict
        return { value: input.value, done: true }
      }

      // associate instanceId with the new viewZone
      uiInputInstances.set(msg.instanceId, viewZone)
      viewZone.addListener("remove", () => {
        // Note: view zone cleans up all listeners after the remove event,
        // so no need for us to removeListener here.
        uiInputInstances.delete(msg.instanceId)
      })
    }
    // else if (viewZone.nextResolver) {
    //   console.warn("[scripter/rpc_ui_input] enqueueResolver while this.nextResolver != null", {
    //     instanceId: msg.instanceId,
    //   })
    // }

    return new Promise(resolve => {
      viewZone.enqueueResolver(resolve)
    })
  })
}



export function start() {
  // signal to plugin that we are ready
  parent.postMessage({ type: "ui-init" }, '*')
  sendWindowConfigMsg()
}


export function init() {
  let runtime = new FigmaPluginEvalRuntime()
  let messageHandler = Eval.setRuntime(runtime)

  window.onmessage = ev => {
    if (ev.source !== parent) {
      // message is not from the Figma plugin
      return
    }
    let msg = ev.data
    if (msg && typeof msg == "object") {
      switch (msg.type) {

      case "eval-response":
      case "print":
        messageHandler(msg)
        break

      case "ui-confirm":
        rpc_confirm(msg as UIConfirmRequestMsg)
        break

      case "fetch-request":
        rpc_fetch(msg as FetchRequestMsg)
        break

      case "ui-input-request":
        rpc_ui_input(msg as UIInputRequestMsg)
        // return  // return to avoid logging these high-frequency messages
        break

      case "worker-create-req":
        rpc_worker_create(msg as WorkerCreateRequestMsg)
        break

      case "worker-message":
        worker_postMessage(msg as WorkerMessageMsg)
        break

      case "worker-ctrl":
        worker_ctrl(msg as WorkerCtrlMsg)
        break

      case "load-script":
        editor.loadScriptFromFigma(msg as LoadScriptMsg)
        break

      case "update-save-scripts-index":
        savedScripts.updateFromPlugin((msg as UpdateSavedScriptsIndexMsg).index)
        break

      }
    }

    // if (DEBUG) {
    //   let data2 :any = ev.data
    //   if (ev.data && typeof ev.data == "object") {
    //     data2 = {}
    //     for (let k of Object.keys(ev.data)) {
    //       let v = ev.data[k]
    //       if (v && typeof v == "object" && v.buffer instanceof ArrayBuffer) {
    //         v = `[${v.constructor.name} ${v.length}]`
    //       } else if (v instanceof ArrayBuffer) {
    //         v = `[ArrayBuffer ${v.byteLength}]`
    //       }
    //       data2[k] = v
    //     }
    //   }
    //   dlog("ui received message", JSON.stringify({ origin: ev.origin, data: data2 }, null,"  "))
    // }

    // Note: Unknown messages are legitimate as they are sent by other parts of the
    // app, like for instance Monaco. It's important we let them be and let them bubble.
    dlog("ui received message", ev.data && ev.data.type, { origin: ev.origin, data: ev.data })
  }

  // hook up config event observation
  config.on("change", ev => {
    if (ev.key == "windowSize") {
      sendWindowConfigMsg()
    }
  })

  // handle ESC-ESC to close
  let lastEscapeKeypress = 0

  // escapeToCloseThreshold
  // When ESC is pressed at least twice within this time window, the plugin closes.
  const escapeToCloseThreshold = 150

  let isClosing = false

  function closePlugin() {
    if (isClosing) {
      return
    }
    isClosing = true
    let sendCloseSignal = () => {
      runtime.send<ClosePluginMsg>({type:"close-plugin"})
    }
    if (editor.isScriptRunning()) {
      // stop the running script and give it a few milliseconds to finish
      editor.stopCurrentScript()
      setTimeout(sendCloseSignal, 50)
    } else {
      sendCloseSignal()
    }
  }

  function onKeydown(ev :KeyboardEvent, key :string) :bool|undefined {
    if (key == "Escape") {
      if (!ev.metaKey && !ev.ctrlKey && !ev.altKey && !ev.shiftKey) {
        if (ev.timeStamp - lastEscapeKeypress <= escapeToCloseThreshold) {
          closePlugin()
          return true
        }
        lastEscapeKeypress = ev.timeStamp
      }
    } else if (ev.keyCode == 80 /*P*/ && (ev.metaKey || ev.ctrlKey) && ev.altKey) {
      // meta-alt-P
      closePlugin()
      return true
    }
  }

  window.addEventListener("keydown", ev => {
    if (onKeydown(ev, ev.key)) {
      ev.preventDefault()
      ev.stopPropagation()
    }
  }, { capture: true, passive: false })
}
