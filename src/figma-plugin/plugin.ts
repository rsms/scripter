import { EvalRequestMsg, EvalResponseMsg } from "../common/messages"

// defined by library ../common/scripter-env.js
interface EvalScriptFun {
  (reqid :string, js :string) :any
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


async function evalCode(req :EvalRequestMsg) {
  dlog(`evaluating code for request ${req.id}`)
  let response :EvalResponseMsg = { type: "eval-response", id: req.id }
  let onerr = (err :Error) => {
    console.error(err.stack||String(err))
    fmtErrorResponse(err, response)
    figma.ui.postMessage(response)
  }
  let triedToFixSnippets = new Set<string>()
  let maxRetries = 5
  while (true) {
    try {
      let r = evalScript(req.id, req.js)
      while (r instanceof Promise) {
        dlog("plugin awaiting promise from script...")
        r = await r
      }
      dlog("plugin resolved result from script.", r)
      response.result = r
      try {
        figma.ui.postMessage(response)
      } catch (_) {
        // failed to encode result -- set to undefined
        response.result = undefined
        figma.ui.postMessage(response)
      }
    } catch (e) {
      if (maxRetries) {
        maxRetries--
        // try loading fonts automatically. This is such a common issue that it's worth doing this.
        // e.g. `Please call figma.loadFontAsync({ family: "Roboto", style: "Regular" })`
        let m = /Please call figma.loadFontAsync\((\{.+\})\)/.exec(e.message)
        if (m && !triedToFixSnippets.has(m[1])) {
          triedToFixSnippets.add(m[1])
          dlog("script failed -- trying to rescue by loading fonts " + m[1])
          // @ts-ignore eval
          await figma.loadFontAsync(eval(`(function(){return ${m[1]} })()`) as FontName)
          continue
        }
      }
      onerr(e)
    }
    break
  }
}

figma.ui.onmessage = msg => {
  if (msg.type === 'ui-init') {
    // UI is ready. Send info about our figma plugin API version
    figma.ui.postMessage({ type: "set-figma-api-version", api: figma.apiVersion })
  } else if (msg.type === 'eval') {
    evalCode(msg as EvalRequestMsg)
  } else dlog(`plugin received unexpected message`, msg)
}
