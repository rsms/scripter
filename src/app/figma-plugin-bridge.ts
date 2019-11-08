import {
  Msg,
  TransactionalMsg,
  RPCErrorResponseMsg,
  ClosePluginMsg,
  WindowConfigMsg,
  UIConfirmRequestMsg, UIConfirmResponseMsg,
  FetchRequestMsg, FetchResponseMsg,
  UIInputRequestMsg, UIInputResponseMsg, isUIRangeInputRequest,
} from "../common/messages"
import * as Eval from "./eval"
import { config } from "./config"
import { resolveOrigSourcePos } from "./srcpos"
import { dlog, print } from "./util"
import { editor } from "./editor"
import { InputViewZone } from "./viewzone"
import { UIInput } from "./ui-input"
import { UIRangeInput, UIRangeInputInit } from "./ui-range"


// const defaultApiVersion = "1.0.0" // used when there's no specific requested version

// // try to parse version from URL query string
// export const apiVersion = (() => {
//   if (document && document.location) {
//     let s = document.location.search
//     dlog(s)
//   }
//   return defaultApiVersion
// })()



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



export function init() {
  let runtime = new FigmaPluginEvalRuntime()
  let messageHandler = Eval.setRuntime(runtime)

  window.onmessage = ev => {
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
    dlog("ui received message", ev.data && ev.data.type, { origin: ev.origin, data: ev.data })
  }

  // hook up config event observation
  config.on("change", ev => {
    if (ev.key == "windowSize") {
      sendWindowConfigMsg()
    }
  })

  // signal to plugin that we are ready
  parent.postMessage({ type: "ui-init" }, '*')
  sendWindowConfigMsg()

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
