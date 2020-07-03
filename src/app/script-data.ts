import * as xdb from "./xdb"
import { Script, ScriptMeta } from "./script"
import { db as _db } from "./data"
import { EventEmitter } from "./event"
import { editor } from "./editor"
import exampleScripts from "./example-scripts"
import resources from "./resources"
import { dlog } from "./util"


interface ScriptsDataEvents {
  "change": undefined
}

class ScriptsData extends EventEmitter<ScriptsDataEvents> {
  db :xdb.Database

  readonly version = 0

  defaultSampleScript :Script
  exampleScripts :{[k:string]:Script[]} = {}
  referenceScripts :Script[] = []
  scripts :Script[] = []
  scriptsById   = new Map<number,Script>()  // same order as scripts
  scriptsByGUID = new Map<string,Script>()
  refreshPromise :Promise<void>|null = null
  readonly libLoadPromise :Promise<void>  // resolved when all libs have loaded

  constructor(db :xdb.Database) {
    super()
    this.db = db
    editor.on("modelchange", this.refresh)  // to include currentScript
    this.db.on("open", this.refresh)
    this.db.on("change", ev => {
      if (ev.store == "scripts") {
        // print(JSON.stringify(ev))
        if (ev.type == "update") {
          let newMeta = ev.value as ScriptMeta
          let s = this.scriptsById.get(newMeta.id)
          if (s) {
            if (newMeta.id <= 0 && ev.key) {
              // print("new script was saved")
              // new script was saved
              // patch id since key was generated
              if (typeof ev.key == "number") {
                newMeta.id = ev.key
              } else {
                console.error(`[ScriptsData] unexpected key type in db change event`, {key:ev.key})
              }
            }
            s.meta = newMeta
            this.finalizeChanges()
          } else {
            // probably a new unsaved script that was saved
            // if (editor.currentScript && newMeta === editor.currentScript.meta) {
            //   print("yup")
            // } else {
            //   print("nope...")
            // }
            this.refresh()
          }
        } else if (ev.type == "delete") {
          let id = ev.key as number
          for (let i = 0; i < this.scripts.length; i++) {
            let s = this.scripts[i]
            if (s.id === id) {
              this.scripts.splice(i, 1)
              break
            }
          }
          this.finalizeChanges()
        } else {
          this.refresh()
        }
      }
    })

    let seenExampleGUIDs = new Set<string>()
    let nextExampleID = -100000

    const mkExample = (guid :string, name :string, code :string, isROLib :boolean) => {
      if (seenExampleGUIDs.has(guid)) {
        throw new Error(`duplicate example script guid:${guid}`)
      }
      seenExampleGUIDs.add(guid)
      return Script.create({
        id: nextExampleID++,
        guid,
        name: name,
        modifiedAt: new Date("2000-01-01 00:00:00"),
      }, code, isROLib)
    }

    for (let category of Object.keys(exampleScripts)) {
      let cat = this.exampleScripts[category]
      if (!cat) {
        this.exampleScripts[category] = cat = []
      }
      for (let exampleScript of exampleScripts[category]) {
        let s = mkExample(
          exampleScript.guid,
          exampleScript.name,
          exampleScript.code,
          /*isROLib*/false
        )
        if (!this.defaultSampleScript) {
          this.defaultSampleScript = s
        }
        cat.push(s)
      }
    }

    if (this.db.isOpen) {
      this.refresh()
    } else {
      this.finalizeChanges()
    }

    this.libLoadPromise = Promise.all(resources.map(r => r.body)).then(bodyContents => {
      for (let i = 0; i < bodyContents.length; i++) {
        let r = resources[i]
        let s = mkExample(r.filename, r.name, bodyContents[i], /*isROLib*/true)
        this.referenceScripts.push(s)
      }
      this.finalizeChanges()
    })
  }


  async getScript(id :number) :Promise<Script> {
    if (DEBUG) {
      console.warn("legacy access to script-data/getScript")
    }
    let s = this.scriptsById.get(id)
    if (s) {
      if (!s.isMutable) {
        // return a copy of a demo script so it can be safely mutated
        s = s.mutableCopy()
      }
      await s.loadIfEmpty()
      return s
    }
    return Script.load(id)
  }


  async getScriptByGUID(guid :string) :Promise<Script|null> {
    let s = this.scriptsByGUID.get(guid)
    if (!s) {
      return null
    }
    if (!s.isMutable) {
      // return a copy of a demo script so it can be safely mutated
      s = s.mutableCopy()
    }
    await s.loadIfEmpty()
    return s
  }


  scriptBefore(id :number) :Script|null {
    for (let i = 0, z = this.scripts.length; i < z; i++) {
      if (this.scripts[i].id == id) {
        return this.scripts[i - 1] || null
      }
    }
    return null
  }


  scriptAfter(id :number) :Script|null {
    for (let i = 0, z = this.scripts.length; i < z; i++) {
      if (this.scripts[i].id == id) {
        let s = this.scripts[i + 1]
        if (s) {
          return s
        }
        break
      }
    }
    return this.firstNonUserScript()
  }


  scriptAfterOrBefore(guid :string) :Script|null {
    for (let i = 0, z = this.scripts.length; i < z; i++) {
      if (this.scripts[i].guid == guid) {
        let s = this.scripts[i + 1] || this.scripts[i - 1]
        if (s) {
          return s
        }
        break
      }
    }
    return this.firstNonUserScript()
  }


  firstNonUserScript() :Script|null {
    return this.defaultSampleScript || this.referenceScripts[0] || null
  }


  refresh = () => {
    if (!this.refreshPromise) {
      this.refreshPromise = new Promise((resolve, reject) => {
        let fin = () => {
          this.refreshPromise = null
        }
        this._refresh()
          .then(() => { fin(); resolve() })
          .catch(err => { fin(); reject(err) })
      })
    }
    return this.refreshPromise
  }

  _refresh = async () => {
    let [mv] = await this.db.read(["scripts"], async scripts => {
      let modifiedAt = scripts.getIndex("modifiedAt")
      return modifiedAt.getAll()
    }) as [ScriptMeta[]]

    let currentScript = editor.currentScript
    if (currentScript && currentScript.id == 0) {
      // special case: list new unsaved script
      mv.push(currentScript.meta)
      this.scriptsById.set(0, currentScript)  // important for figma-loaded scripts
    }

    mv.reverse()
    let byGUID = new Map<string,Script>()
    let byID = new Map<number,Script>()
    let scripts :Script[] = []

    for (let m of mv) {

      let s = this.scriptsById.get(m.id)
      if (!s) {
        // Allocate new Script object for metadata.
        // This happens when the in-memory storage of scripts differ from the
        // database storage.
        s = new Script(m, "", null)
        this.scriptsById.set(m.id, s)
      }
      s.meta = m

      if (s.meta.guid) {
        let a = byGUID.get(s.meta.guid)
        if (a) {
          let b = s
          console.debug && console.debug(`[script-data] detected duplicate GUID`,
            { "script A meta":a.meta, "script B meta":b.meta }, "(merging)")
          a.mergeApply(b)
          a.save()
          // b.delete()
          continue
        }
        byGUID.set(s.meta.guid, s)
      } else {
        s.requireValidGUID()
      }

      let a = byID.get(s.meta.id)
      if (a) {
        console.warn(`[script-data] detected duplicate local ID`,
          { "script meta 1":a.meta, "script meta 2":m })
        continue // skip
      }
      byID.set(s.meta.id, s)

      scripts.push(s)

      // // simulate GUID collision
      // if (DEBUG && s.meta.guid == "3QF1IZWGhdmUqzvHdDTliW") {
      //   dlog("SIMULATE GUID COLLISION")
      //   let a = byGUID.get("5kQR5mJyYlK2gEhhEgHUuh")
      //   if (a) {
      //     let b = s
      //     console.warn(`[script-data] detected duplicate GUID`,
      //       { "script A meta":a.meta, "script B meta":b.meta }, "(merging)")
      //     a.mergeApply(b)
      //     continue
      //   }
      // }
    }

    this.scripts = scripts

    // note: no sorting needed as mv was sorted by virtue of database index order
    this.finalizeChanges(/*sort=*/false)
  }


  finalizeChanges(sort :boolean = true) {
    if (sort) {
      this.scripts.sort((a, b) =>
        a.modifiedAt < b.modifiedAt ? 1 :
        b.modifiedAt < a.modifiedAt ? -1 :
        0
      )
    }
    // sort scriptsById (also filters out deleted scripts)
    let scripts = this.scripts.slice()
    for (let cat of Object.keys(this.exampleScripts)) {
      scripts = scripts.concat(this.exampleScripts[cat])
    }
    scripts = scripts.concat(this.referenceScripts)
    this.scriptsById = new Map(scripts.map(s => [s.id, s]))
    this.scriptsByGUID = new Map<string,Script>()
    for (let s of scripts) {
      if (s.guid) {
        this.scriptsByGUID.set(s.guid, s)
      }
    }

    ;(this as any).version++
    this.triggerEvent("change")
  }


  nextNewScriptName() :string {
    let n = -1
    for (let s of this.scripts) {
      if (s.name.startsWith("Untitled")) {
        let n2 = 0
        let m = /Untitled\s*(\d+)\s*$/.exec(s.name)
        if (m) {
          n2 = parseInt(m[1])
        }
        if (!isNaN(n2)) {
          n = Math.max(n, n2)
        }
      }
    }
    return n == -1 ? "Untitled" : `Untitled ${n + 1}`
  }
}

export const scriptsData = new ScriptsData(_db)
