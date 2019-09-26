import { fmtValue } from "../common/fmtval"
import {
  EvalRequestMsg,
  EvalCancellationMsg,
  EvalResponseMsg,
  ClosePluginMsg,
  WindowConfigMsg,
  WindowSize,
} from "../common/messages"


// defined by library ../common/scripter-env.js
type EvalCancelFun = (reason?:Error)=>void
interface EvalScriptFun {
  (reqid :string, valueFormatter :(v:any)=>string, js :string) :[Promise<any>,EvalCancelFun]
  readonly lineOffset :number
}
declare const evalScript :EvalScriptFun


// WindowSize => pixels
function windowWidth(ws :WindowSize) :number {
  switch (ws) {
  case WindowSize.SMALL:  return 300
  case WindowSize.MEDIUM: return 500
  case WindowSize.LARGE:  return 700
  default:
    console.error(`[plugin] unexpected windowWidth ${ws}`)
    return 500
  }
}
function windowHeight(ws :WindowSize) :number {
  switch (ws) {
  case WindowSize.SMALL:  return 300
  case WindowSize.MEDIUM: return 500
  case WindowSize.LARGE:  return 700
  default:
    console.error(`[plugin] unexpected windowHeight ${ws}`)
    return 500
  }
}


const initialWindowSize = WindowSize.MEDIUM

figma.showUI(__html__, {
  width: windowWidth(initialWindowSize),
  height: windowHeight(initialWindowSize),
  visible: false,
})


function fmtErrorResponse(err :Error, response :EvalResponseMsg) {
  response.error = err.message || String(err)
  response.srcLineOffset = evalScript.lineOffset
  let stack :string = (err as any).scripterStack || err.stack
  if (typeof stack == "string") {
    let frames = stack.split(/[\r\n]+/)
    let framePos :{line:number,column:number}[] = []
    for (let i = 1; i < frames.length; i++) {
      // Note: fig-js does not provide source column info
      let m = frames[i].match(/:(\d+)(:?:(\d+)|)\)$/)
      if (m) {
        let line = parseInt(m[1])
        let column = parseInt(m[2])
        framePos.push({
          line: isNaN(line) ? 0 : line,
          column: isNaN(column) ? 0 : column,
        })
      }
    }
    response.srcPos = framePos
  }
}


class EvalTransaction {
  id       :string
  code     :string
  response :EvalResponseMsg

  canceled :bool = false
  cancelFun :EvalCancelFun|null = null  // set by tryEval

  constructor(id :string, code :string) {
    this.id = id
    this.code = code
    this.response = { type: "eval-response", id }
  }

  setError(err :Error) {
    console.error("[script]", (err as any).scripterStack || err.stack || String(err))
    fmtErrorResponse(err, this.response)
  }

  cancel(reason? :Error) {
    if (this.canceled || !this.cancelFun) {
      return
    }
    this.canceled = true
    this.cancelFun(reason)
  }

  // returns time spent evaluating the script (in milliseconds)
  async eval(maxRetries :number = 10) :Promise<number> {  // never throws
    let triedToFixSnippets = new Set<string>()
    while (true) {
      try {
        let timeStarted = Date.now()
        await this.tryEval()
        return Date.now() - timeStarted
      } catch (err) {
        if (maxRetries-- && await this.retry(err, triedToFixSnippets)) {
          continue
        }
        this.setError(err)
        return -1
      }
    }
  }

  async tryEval() {
    let [p, c] = evalScript(this.id, fmtValue, this.code)
    this.cancelFun = c
    let result :any = p
    while (result instanceof Promise) {
      dlog("plugin awaiting promise from script...")
      result = await result
    }
    dlog("plugin resolved result from script:", result)
    this.response.result = result
    this.cancelFun = null
  }

  async retry(err :Error, triedToFixSnippets :Set<string>) :Promise<bool> {
    // try loading fonts automatically. This is such a common issue that it's worth doing this.
    // e.g. `Please call figma.loadFontAsync({ family: "Roboto", style: "Regular" })`
    let m = /Please call figma.loadFontAsync\((\{.+\})\)/.exec(err.message)
    if (!m || triedToFixSnippets.has(m[1])) {
      return false
    }
    triedToFixSnippets.add(m[1])
    dlog("script failed -- trying to rescue by loading fonts " + m[1])
    // @ts-ignore eval
    await figma.loadFontAsync(eval(`(function(){return ${m[1]} })()`) as FontName)
    return true
  }

  finalize() {
    try {
      figma.ui.postMessage(this.response)
    } catch (_) {
      // failed to encode result -- set to undefined
      this.response.result = undefined
      figma.ui.postMessage(this.response)
    }
  }
}


let activeRequests = new Map<string,EvalTransaction>()


async function evalCode(req :EvalRequestMsg) {
  dlog(`evaluating code for request ${req.id}`)

  let tx = new EvalTransaction(req.id, req.js)

  if (activeRequests.has(tx.id)) {
    console.error(`[scripter plugin] duplicate eval request ${tx.id}`)
    tx.finalize()
    return
  }

  activeRequests.set(tx.id, tx)
  let timeTaken = await tx.eval()
  activeRequests.delete(tx.id)
  tx.finalize()

  console.log(`script took ${timeTaken}ms`)
}


function cancelEval(msg :EvalCancellationMsg) {
  let tx = activeRequests.get(msg.id)
  if (!tx) {
    dlog(`[plugin/cancelEval] no active request ${msg.id}; ignoring`)
    return
  }
  tx.cancel()
}


function windowConfig(c :WindowConfigMsg) {
  figma.ui.resize(windowWidth(c.width), windowHeight(c.height))
}


figma.ui.onmessage = msg => {
  // dlog("plugin recv", JSON.stringify(msg, null, 2))
  switch (msg.type) {

  case "ui-init":
    // UI is ready. Send info about our figma plugin API version
    figma.ui.show()
    figma.ui.postMessage({ type: "set-figma-api-version", api: figma.apiVersion })
    break

  case "eval":
    evalCode(msg as EvalRequestMsg)
    break

  case "eval-cancel":
    cancelEval(msg as EvalCancellationMsg)
    break

  case "close-plugin":
    figma.closePlugin((msg as ClosePluginMsg).message)
    break

  case "window-config":
    windowConfig(msg as WindowConfigMsg)
    break

  default:
    dlog(`plugin received unexpected message`, msg)
  }
}
