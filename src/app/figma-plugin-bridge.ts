import { ClosePluginMsg, WindowConfigMsg } from "../common/messages"
import * as Eval from "./eval"
import { config } from "./config"
import { dlog, print } from "./util"



// let pluginApiVersion :string = defaultPluginApiVersion

function setFigmaApiVersion(version :string) {
  // TODO: see if we have a resource for the .d.ts file and update editor if we do.
  // print(`TODO: setFigmaApiVersion "${version}" (current: "${pluginApiVersion}")`)
  // if (version !== "0.0.0") {
  //   pluginApiVersion = version
  // }
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


export function init() {
  let runtime = new FigmaPluginEvalRuntime()
  let messageHandler = Eval.setRuntime(runtime)

  window.onmessage = ev => {
    // print("ui received message",
    //   JSON.stringify({ origin: ev.origin, data: ev.data }, null, "  ")
    // )
    let msg = ev.data
    if (msg && typeof msg == "object") {
      switch (msg.type) {

      case "set-figma-api-version":
        setFigmaApiVersion(msg.api as string)
        break

      case "eval-response":
      case "print":
        messageHandler(msg)
        break

      }
    }
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

  function closePlugin() {
    runtime.send<ClosePluginMsg>({type:"close-plugin"})
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
