import * as xdb from "./xdb"
import { Script, ScriptMeta } from "./script"
import { db as _db } from "./data"
import { EventEmitter } from "./event"
import { editor } from "./editor"
import exampleScripts from "./example-scripts"
import resources from "./resources"
// import { print, dlog } from "./util"


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
  scriptsById = new Map<number,Script>()  // same order as scripts

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

    let seenExampleIds = new Set<number>()
    const mkExample = (id :number, name :string, code :string) => {
      if (id >= 0) {
        throw new Error(`invalid example script id ${id}`)
      }
      if (seenExampleIds.has(id)) {
        throw new Error(`duplicate example script id ${id}`)
      }
      seenExampleIds.add(id)
      return Script.create({
        id,
        name: name,
        modifiedAt: new Date("2000-01-01 00:00:00"),
      }, code)
    }

    for (let category of Object.keys(exampleScripts)) {
      let cat = this.exampleScripts[category]
      if (!cat) {
        this.exampleScripts[category] = cat = []
      }
      for (let exampleScript of exampleScripts[category]) {
        // id [-10000000..-20000000) is reserved for externalExampleFiles
        if (exampleScript.id <= -10000000 && exampleScript.id > -20000000) {
          throw new Error(`reserved example script id ${exampleScript.id}`)
        }
        let s = mkExample(exampleScript.id, exampleScript.name, exampleScript.code)
        if (!this.defaultSampleScript) {
          this.defaultSampleScript = s
        }
        cat.push(s)
      }
    }

    let externalExampleFiles :[number,string,string][] = [
      [-10000000, "figma.d.ts", "Figma API"],
      [-10000001, "scripter-env.d.ts", "Scripter API"],
    ]
    Promise.all(externalExampleFiles.map(name => resources[name[1]])).then(codes => {
      for (let i = 0; i < codes.length; i++) {
        let [id, , name] = externalExampleFiles[i]
        let s = mkExample(id, name, codes[i])
        s.readOnly = true
        this.referenceScripts.push(s)
      }
      this.finalizeChanges()
    })

    if (this.db.isOpen) {
      this.refresh()
    } else {
      this.finalizeChanges()
    }
  }


  async getScript(id :number) :Promise<Script> {
    let s = this.scriptsById.get(id)
    if (s) {
      if (s.id < 0) {
        // return a copy of a demo script so it can be safely mutated
        return s.clone()
      }
      await s.loadIfEmpty()
      return s
    }
    return Script.load(id)
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


  scriptAfterOrBefore(id :number) :Script|null {
    for (let i = 0, z = this.scripts.length; i < z; i++) {
      if (this.scripts[i].id == id) {
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


  refresh = async () => {
    let [mv] = await this.db.read(["scripts"], async scripts => {
      let modifiedAt = scripts.getIndex("modifiedAt")
      return modifiedAt.getAll()
    }) as [ScriptMeta[]]

    let currentScript = editor.currentScript
    if (currentScript && currentScript.id == 0) {
      // special case: list new unsaved script
      mv.push(currentScript.meta)
    }

    mv.reverse()

    let seenScriptIds = new Set<number>()
    this.scripts = mv.map(m => {
      let s = this.scriptsById.get(m.id)
      if (!s) {
        s = new Script(m, "", null)
        this.scriptsById.set(m.id, s)
      }
      seenScriptIds.add(m.id)
      s.meta = m
      return s
    })

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
