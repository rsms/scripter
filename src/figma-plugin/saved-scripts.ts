import { Msg, UpdateSavedScriptsIndexMsg } from "../common/messages"
import * as consts from "./constants"
import * as rpc from "./rpc"
import { delayed } from "./util"
import { visit } from "./visit"


const pluginDataIndexKey = "saved_script_index"


interface SavedScriptIndexData {
  [guid:string] :string  // Scripter GUID => Figma node ID
}


interface Patch {
  type   :"set" | "remove"
  guid   :string
  nodeId :string  // ignored for type="remove"
}


enum ScanPriority {
  Background,
  Low,
  High,
}


// SavedScriptIndex maintains mappings between script GUIDs and Figma nodes representing them
// on canvas. When the index changes or is refreshed, a UpdateSavedScriptsIndexMsg is sent to
// the UI.
//
export const SavedScriptIndex = new class {
  index :SavedScriptIndexData = {}
  guids :string[] = ["_INIT_"]  // _INIT_ makes guids as uninitialized for setIndex
  initPromise :Promise<void>  // resolved when init completes
  _initPromiseResolve :()=>void
  _backgroundScanTimer :any = null
  _backgroundScanPromise :Promise<void>|null = null


  constructor() {
    this.initPromise = new Promise<void>(resolve => {
      this._initPromiseResolve = resolve
    })
  }


  async init() {
    try {
      await this.update()
      this._initPromiseResolve()
      this.scanInBackground()
    } catch (err) {
      console.error(`PLEASE REPORT: Scripter SavedScriptIndex init failure: ${err.stack||err}`)
    }
  }


  patchIndex(patches :Patch[]) {
    let index = Object.assign({}, this.index)
    let changes = 0
    for (let p of patches) {
      if (p.type == "remove") {
        if (p.guid in index) {
          delete index[p.guid]
          changes++
        }
      } else if (p.type == "set") {
        if (index[p.guid] != p.nodeId) {
          index[p.guid] = p.nodeId
          changes++
        }
      } else {
        throw new Error(`unexpected patch type ${p.type}`)
      }
    }
    if (changes > 0) {
      this.setIndex(index)
    }
  }


  setIndex(index :SavedScriptIndexData) {
    let guids = Object.keys(index)
    let indexJSON = JSON.stringify(index)
    if (this.guids.length == guids.length && indexJSON == JSON.stringify(this.index)) {
      // no change; avoid sending message to UI and avoid writing to Figma
      return
    }
    this.index = index
    this.guids = guids
    figma.currentPage.setPluginData(pluginDataIndexKey, indexJSON)
    rpc.sendMsg<UpdateSavedScriptsIndexMsg>({
      type: "update-save-scripts-index",
      guids,
    })
  }


  async getNodeByGUID(guid :string) :Promise<BaseNode|null> {
    await this.initPromise
    let nodeId = this.index[guid]
    if (!nodeId) {
      return null
    }
    let n = figma.getNodeById(nodeId)
    // validate
    if (!n) {
      delete this.index[guid]
      return null
    }
    let scriptGUID = n.getSharedPluginData(consts.sharedPluginDataNamespace, "scriptGUID")
    if (!scriptGUID || scriptGUID != guid) {
      // fixup index
      delete this.index[guid]
      if (scriptGUID && scriptGUID != guid) {
        this.index[scriptGUID] = n.id
      }
      return null
    }
    return n
  }


  async update() :Promise<void> {
    let index :SavedScriptIndexData = {}

    // loading a saved index
    let indexData = figma.currentPage.getPluginData(pluginDataIndexKey)
    if (indexData) {
      try {
        index = JSON.parse(indexData) as SavedScriptIndexData
        this.setIndex(index)
      } catch (err) {
        console.error("SavedScriptIndex.update failed to parse guidsData from plugin data")
      }
    }

    // scan document (slow)
    // delay scan by a little bit of time to really give all the CPU to booting up Monaco in the UI
    return delayed(500, ()=> this.scanForChanges(ScanPriority.Low) )
  }


  async scanInBackground() :Promise<void> {
    if (!this._backgroundScanPromise) {
      this._backgroundScanPromise = new Promise<void>((resovle, reject) => {
        clearTimeout(this._backgroundScanTimer)
        this._backgroundScanTimer = setTimeout(async () => {
          // let timeStarted = Date.now() ; dlog("[plugin] begin background scan")
          await this.scanForChanges(ScanPriority.Background)
          // dlog(`[plugin] end background scan (${Date.now()-timeStarted}ms)`)
          this._backgroundScanPromise = null
          resovle()
          this.scanInBackground()
        }, 1000)
      })
    }
    return this._backgroundScanPromise
  }


  async scanForChanges(priority :ScanPriority) :Promise<void> {
    let index = await this.scanPage(figma.currentPage, priority)
    // TODO: scan all pages and merge index
    this.setIndex(index)
  }


  async scanPage(page :PageNode, priority :ScanPriority) :Promise<SavedScriptIndexData> {
    let index :SavedScriptIndexData = {} // Scripter GUID => node id
    // maxdepth controls how far we go in searching the document for script nodes.
    // This number needs to be small so that opening Scripter in large files is not slowing
    // the world down too much.
    // 1 = check inside top level containers but no further.
    const maxdepth = 1

    // maxtime controls how often the process will yield to Figma for allowing UI updates
    const maxtime = (
      priority == ScanPriority.High       ? 200 :
      priority == ScanPriority.Low        ? 50 :
      priority == ScanPriority.Background ? 10 :
      200
    )

    visit(page, maxdepth, maxtime, n => {
      if (n.type == "TEXT") {
        let scriptGUID = n.getSharedPluginData(consts.sharedPluginDataNamespace, "scriptGUID")
        if (scriptGUID) {
          // dlog(`found a script node (node ID ${n.id})`, scriptGUID)
          index[scriptGUID] = n.id
        }
      }
    })
    return index
  }
}
