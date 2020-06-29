/// <reference path="./evalscript.d.ts" />
import {
  Msg,
  EvalRequestMsg,
  EvalCancellationMsg,
  EvalResponseMsg,
  ClosePluginMsg,
  SaveScriptMsg,
  LoadScriptMsg,
  ScriptMsg,
  WindowConfigMsg,
  WindowSize,
  UpdateSavedScriptsIndexMsg,
} from "../common/messages"
import * as windowSize from "../common/windowsize"
import * as rpc from "./rpc"
import * as scriptLibImpl from "./script-lib"
import { SavedScriptIndex } from "./saved-scripts"
import * as consts from "./constants"
import { createScriptNode, updateScriptNode } from "./scriptnode"

// scriptLib is a global declared in scripter-env.js
declare var scriptLib :{[k:string]:any}
scriptLib = scriptLibImpl


const initialWindowSize = WindowSize.MEDIUM


function main() {
  figma.showUI(__html__, {
    width: windowSize.width(initialWindowSize),
    height: windowSize.height(initialWindowSize),
    visible: false,
  })

  // load window size from figma.clientStorage
  restoreWindowConfig().then(ok => {
    if (ok) {
      figma.ui.show()
    }
  })

  // message dispatch
  figma.ui.onmessage = msg => {
    // dlog("plugin recv", JSON.stringify(msg, null, 2))
    switch (msg.type) {

    case "ui-init":
      // UI is ready. Send info about our figma plugin API version
      figma.ui.show()
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
      saveWindowConfig(msg as WindowConfigMsg)
      break

    case "save-script":
      saveScript(msg as SaveScriptMsg).catch(err => console.error(err.stack))
      break

    default:
      if (
        typeof msg.type != "string" ||
        typeof msg.id != "string" ||
        !rpc.handleTransactionResponse(msg)
      ) {
        dlog(`plugin received unexpected message`, msg)
      }
    }
  }

  // // check launch command (e.g. from clicking "Open Script")
  // dlog("figma.command", figma.command)
  // Note: There's currently a bug in Figma where figma.command is set even when the user
  // opened the plugin normally, so we can't rely on its value for knowing if the user clicked
  // the "relaunch" button.

  // update "saved script index"
  SavedScriptIndex.init()

  // attempt to load a script from selection
  loadScriptFromSelection()
}


const windowConfigStorageKey = "windowConfig"

async function restoreWindowConfig() :Promise<boolean> {
  let ok = false
  await figma.clientStorage.getAsync(windowConfigStorageKey)
    .then((data :WindowConfigMsg|undefined|null) => {
      dlog(`getAsync("windowSize") =>`, data)
      if (data) {
        try {
          windowConfig(data)
          ok = true
        } catch (err) {
          console.error(`windowConfig in restoreWindowConfig: ${err.stack||err}`)
        }
      }
    })
    .catch(err => {
      console.error(`getAsync("${windowConfigStorageKey}") => ${err.stack||err}`)
    })
  return ok
}


function saveWindowConfig(config :WindowConfigMsg) {
  figma.clientStorage.setAsync(windowConfigStorageKey, config).then(() => {
    dlog(`setAsync("${windowConfigStorageKey}") => OK`)
  }).catch(err => {
    console.error(`setAsync("${windowConfigStorageKey}") => ${err.stack||err}`)
  })
}


function loadScriptFromSelection() {
  // Note: There's a bug-like (but intentional) behaviro in Figma where the figma.command
  // "gets stuck"; is set even for normal plugin launches, so it's very likely that the user
  // just launched the plugin normally in this case.
  //
  // However, the resulting behavior is acceptable:
  // a) When the user clicks the "Open script" relaunch button, the selected script is opened.
  //    This is good.
  // b) When the user selects a script node and just runs Scripter normally, the selected script
  //    is opened. This is not ideal, but it's acceptable. When/if Figma changes the API so that
  //    relaunch data doesn't "get stcuck" this behavior will change to the better.
  // c) When the user selects something that is not a script node and runs Scripter, whatever the
  //    last script they were working on is opened. This is good.
  //
  let limit = 20
  for (let n of figma.currentPage.selection) {
    let script = loadScriptDataFromNode(n)
    if (script) {
      loadScript(script)
      break
    }
    if (--limit == 0) {
      break
    }
  }
}


function loadScriptDataFromNode(n :SceneNode) :ScriptMsg|null {
  if (n.type == "GROUP") {
    // Select the first child of groups.
    // Note that groups are never empty so this always succeeeds.
    n = n.children[0]
  }
  let guid = n.getSharedPluginData(consts.dataNamespace, consts.dataScriptGUID)
  if (!guid) {
    return null
  }
  let name = n.getSharedPluginData(consts.dataNamespace, consts.dataScriptName) || "Untitled"
  let body = n.getSharedPluginData(consts.dataNamespace, consts.dataScriptBody) || ""
  return { guid, name, body }
}


function loadScript(script :ScriptMsg) {
  if (!script.guid) { throw new Error(`script missing guid`) }
  if (typeof script.body != "string") { throw new Error(`script missing body`) }
  rpc.sendMsg<LoadScriptMsg>({ type: "load-script", script })
}


const scriptNodeFont :FontName = { family: "IBM Plex Mono", style: "Regular" }


async function saveScript(msg :SaveScriptMsg) {
  // setSharedPluginData(namespace: string, key: string, value: string): void
  // setRelaunchData(data: { [command: string]: /* description */ string }): void

  // attempt to lookup existing node for guid, and load font
  let [node,] = await Promise.all([
    SavedScriptIndex.getNodeByGUID(msg.script.guid) as Promise<SceneNode|null>,
    figma.loadFontAsync(scriptNodeFont),
  ])

  // update or create node
  if (node) {
    await updateScriptNode(node, msg.script)
  } else if (msg.create) {
    node = await createScriptNode(msg.script)
  }

  if (node) {
    if (msg.create) {
      // select node on canvas when "create if missing" was requested
      let n = node
      if (n.type == "FRAME" && n.parent && n.parent.type == "GROUP") {
        n = n.parent
      }
      figma.currentPage.selection = [ n ]
    }
    // update index
    SavedScriptIndex.patchIndex([{
      type: "update",
      guid: msg.script.guid,
      entry: { nodeId: node.id, name: msg.script.name }
    }])
  }
}


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
    let timeStarted = 0
    while (true) {
      try {
        timeStarted = Date.now()
        await this.tryEval()
      } catch (err) {
        if (maxRetries-- && await this.retry(err, triedToFixSnippets)) {
          continue
        }
        this.setError(err)
      }
      return Date.now() - timeStarted
    }
  }

  async tryEval() {
    let [p, c] = evalScript(this.id, this.code)
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
  figma.ui.resize(windowSize.width(c.width), windowSize.height(c.height))
}


main()
