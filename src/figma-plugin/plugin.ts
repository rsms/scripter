import { fmtValue } from "../common/fmtval"
import {
  EvalRequestMsg,
  EvalCancellationMsg,
  EvalResponseMsg,
  ClosePluginMsg,
} from "../common/messages"

// defined by library ../common/scripter-env.js
type EvalCancelFun = (reason?:Error)=>void
interface EvalScriptFun {
  (reqid :string, valueFormatter :(v:any)=>string, js :string) :[Promise<any>,EvalCancelFun]
  readonly lineOffset :number
}
declare const evalScript :EvalScriptFun


figma.showUI(__html__, {
  width: 500,
  height: 500,
})


function fmtErrorResponse(err :Error, response :EvalResponseMsg) {
  response.error = err.message || String(err)
  if (typeof err.stack == "string") {
    let frames = err.stack.split(/[\r\n]+/)
    if (frames.length > 1) {
      let m = frames[1].match(/:(\d+):(\d+)\)$/)
      if (m) {
        let line = parseInt(m[1])
        let column = parseInt(m[2])
        response.srcLineOffset = evalScript.lineOffset
        response.srcPos = {
          line: isNaN(line) ? 0 : line,
          column: isNaN(column) ? 0 : column,
        }
      }
    }
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
    console.error(err.stack||String(err))
    fmtErrorResponse(err, this.response)
  }

  cancel(reason? :Error) {
    if (this.canceled || !this.cancelFun) {
      return
    }
    this.canceled = true
    this.cancelFun(reason)
  }

  async eval(maxRetries :number = 10) :Promise<void> {  // never throws
    let triedToFixSnippets = new Set<string>()
    while (true) {
      try {
        await this.tryEval()
        return
      } catch (err) {
        if (maxRetries-- && await this.retry(err, triedToFixSnippets)) {
          continue
        }
        this.setError(err)
        return undefined
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
  await tx.eval()
  activeRequests.delete(tx.id)
  tx.finalize()
}


function cancelEval(msg :EvalCancellationMsg) {
  let tx = activeRequests.get(msg.id)
  if (!tx) {
    dlog(`[plugin/cancelEval] no active request ${msg.id}; ignoring`)
    return
  }
  tx.cancel()
}


figma.ui.onmessage = msg => {
  dlog("plugin recv", JSON.stringify(msg, null, 2))
  switch (msg.type) {

  case "ui-init":
    // UI is ready. Send info about our figma plugin API version
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

  default:
    dlog(`plugin received unexpected message`, msg)
  }
}
