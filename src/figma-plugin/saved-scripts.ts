import {
  Msg,
  UpdateSavedScriptsIndexMsg,
  SavedScriptIndexEntry,
  SavedScriptIndexData,
} from "../common/messages"
import * as consts from "./constants"
import * as rpc from "./rpc"
import { delayed, sortedObject } from "./util"
import { visit } from "./visit"


// const dlog = DEBUG ? function dlog(msg :string, ...v :any[]) {
//   console.log("[script-index]", msg, ...v)
// } : function(){}
const dlog = function(..._:any){}


interface Patch {
  type   :"update" | "remove"
  guid   :string
  entry  :SavedScriptIndexEntry  // ignored for type="remove"
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
      dlog(`init phase starting`)

      // load index from document
      dlog(`loading index from document`)
      await this.load()

      // scan document (slow)
      // delay scan by a little bit of time to really give all the CPU to booting up Monaco in the UI
      dlog(`initial scan starting`)
      await delayed(500, ()=> this.scanForChanges(ScanPriority.Low) )
      dlog(`initial scan completed`)

      // init is complete
      dlog(`init phase completed`)
      this._initPromiseResolve()

      // start background scan
      dlog(`background scan starting`)
      this.scanInBackground()
    } catch (err) {
      console.error(`PLEASE REPORT: Scripter SavedScriptIndex init failure: ${err.stack||err}`)
    }
  }


  patchIndex(patches :Patch[]) {
    dlog(`patch`, patches)
    let index = Object.assign({}, this.index)
    let changes = 0
    for (let p of patches) {
      if (p.type == "remove") {
        if (p.guid in index) {
          delete index[p.guid]
          changes++
        }
      } else if (p.type == "update") {
        let existing = index[p.guid]
        if (!existing || existing.nodeId != p.entry.nodeId) {
          index[p.guid] = { nodeId: p.entry.nodeId, name: p.entry.name }
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
    index = sortedObject(index)
    let guids = Object.keys(index)
    let indexJSON = JSON.stringify(index)
    if (this.guids.length == guids.length && indexJSON == JSON.stringify(this.index)) {
      // no change; avoid sending message to UI and avoid writing to Figma
      dlog(`setIndex no-op`)
      return
    }
    dlog(`setIndex index changed\n  prev: ${JSON.stringify(this.index)}\n  next: ${indexJSON}`)
    this.index = index
    this.guids = guids
    figma.currentPage.setPluginData(consts.dataPrivateIndexKey, indexJSON)
    rpc.sendMsg<UpdateSavedScriptsIndexMsg>({
      type: "update-save-scripts-index",
      index: this.index,
    })
  }


  async getNodeByGUID(guid :string) :Promise<BaseNode|null> {
    await this.initPromise
    let entry = this.index[guid]
    if (!entry) {
      return null
    }
    let n = figma.getNodeById(entry.nodeId)
    // validate
    if (!n) {
      delete this.index[guid]
      return null
    }
    let scriptGUID = n.getSharedPluginData(consts.dataNamespace, consts.dataScriptGUID)
    if (!scriptGUID || scriptGUID != guid) {
      // fixup index; move entry into proper GUID association
      delete this.index[guid]
      if (scriptGUID && scriptGUID != guid) {
        this.index[scriptGUID] = entry
      }
      return null
    }
    return n
  }


  async load() :Promise<void> {
    let index :SavedScriptIndexData = {}

    // loading a saved index
    let indexData = figma.currentPage.getPluginData(consts.dataPrivateIndexKey)
    if (indexData) {
      try {
        index = JSON.parse(indexData) as SavedScriptIndexData
        this.setIndex(index)
      } catch (err) {
        console.error("SavedScriptIndex.update failed to parse guidsData from plugin data")
      }
    }
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
    dlog(`scan start`)
    let index = await this.scanPage(figma.currentPage, priority)
    dlog(`scan finished`)
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

    await visit(page, maxdepth, maxtime, n => {
      if (n.type == "GROUP") {
        if (n.children.length == 1 && n.children[0].type == "FRAME") {
          return true  // let's visit this group
        }
        return false // ignore this group; definitely not a
      }
      if (n.type == "FRAME") {
        let scriptGUID = n.getSharedPluginData(consts.dataNamespace, consts.dataScriptGUID)
        if (scriptGUID) {
          // dlog(`found a script node (node ID ${n.id})`, scriptGUID)
          let entry = this.index[scriptGUID]
          if (!entry) {
            let name = n.getSharedPluginData(consts.dataNamespace, consts.dataScriptName)
            entry = { nodeId: n.id, name: name || "Untitled" }
          }
          index[scriptGUID] = entry
          return false // don't visit the insides of a script node
        }
      }
      return true // descend (only has effect if n is a container)
    })

    return index
  }
}
