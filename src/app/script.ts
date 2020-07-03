import { db } from "./data"
import { EventEmitter } from "./event"
import * as monaco from "../monaco/monaco"
import * as guid from "./guid"
import savedScripts from "./saved-scripts"
import { SaveScriptMsg } from "../common/messages"
import * as figma from "./figma-plugin-bridge"
import { print, dlog } from "./util"

// const defaultScriptBody = `
//   for (let n of figma.currentPage.selection) {
//     if (isText(n)) {
//       n.characters = n.characters.trim()
//     }
//   }
//   function isText(n :BaseNode) :n is TextNode {
//     return n.type == "TEXT"
//   }
// `.trim().replace(/\n  /mg, "\n") + "\n"


type EditorViewState = monaco.editor.ICodeEditorViewState


export interface ScriptMeta {
  id         :number  // <=0 for memory-only, >0 when saved in database.
  guid       :string
  name       :string
  tags       :string[]
  createdAt  :Date
  modifiedAt :Date
}

function createScriptMeta(meta :Partial<ScriptMeta>) :ScriptMeta {
  let m :ScriptMeta = {
    // defaults
    id:         0,
    guid:       "",
    name:       "Untitled",
    tags:       [],
    createdAt:  new Date(),
    modifiedAt: new Date(),

    // custom
    ...meta
  }
  return m
}


async function saveScriptMeta(s :ScriptMeta) {
  return db.put("scripts", s)
}


enum DirtyState {
  Clean,
  Dirty,
  DirtyImplicit,
}


interface ScriptEventMap {
  "save": Script
  "delete": Script
}

export class Script extends EventEmitter<ScriptEventMap> {
  meta :ScriptMeta
  isROLib :bool = false   // if true, can't be edited
  _body :string
  _editorViewState :EditorViewState|null = null

  _saveTimer :any = null
  _savedModelVersion :number = 0  // transient editor version
  _currModelVersion :number = 0

  _metaDirty :DirtyState = DirtyState.Clean
  _bodyDirty :DirtyState = DirtyState.Clean

  constructor(
    meta :ScriptMeta,
    body :string,
    editorViewState :EditorViewState|null,
    isROLib? :boolean,
  ) {
    super()
    this.meta = meta
    this._body = body
    this._editorViewState = editorViewState
    this.isROLib = !!isROLib
  }

  get id() :number { return this.meta.id }
  get guid() :string { return this.meta.guid }

  get createdAt() :Date { return this.meta.createdAt }
  get modifiedAt() :Date { return this.meta.modifiedAt }

  get modelVersion() :number { return this._currModelVersion }

  get isUserScript() :bool { return !this.isROLib && this.id >= 0 }
  get isMutable() :bool { return this.isUserScript }

  get body() :string { return this._body }
  set body(v :string) {
    this._body = v
    this._bodyDirty = DirtyState.Dirty
    this._currModelVersion = 0
    this._onAfterLoadBody()
    this.scheduleSave()
  }

  updateBody(text :string, modelVersion :number) {
    this._body = text
    this._currModelVersion = modelVersion
    this._bodyDirty = (
      this._currModelVersion != this._savedModelVersion ? DirtyState.Dirty :
                                                          DirtyState.Clean
    )
    this.scheduleSave()
  }

  updateBodyNoDirty(text :string, modelVersion :number) {
    this._body = text
    this._currModelVersion = modelVersion
  }

  get name() :string { return this.meta.name }
  set name(v :string) {
    v = v.trim()
    if (v == "") {
      v = "Untitled"
    }
    if (this.meta.name !== v) {
      this.meta.name = v
      this._metaDirty = DirtyState.Dirty
      this.scheduleSave()
    }
  }

  get editorViewState() :EditorViewState|null {
    return this._editorViewState
  }
  set editorViewState(v :EditorViewState|null) {
    this._editorViewState = v
    if (this.id > 0) {
      db.put("scriptViewState", v, this.id)
    }
  }
  async reloadEditorViewState() :Promise<EditorViewState|null> {
    return this._editorViewState = (
      await db.get("scriptViewState", this.id) as EditorViewState|null
    )
  }

  isSavedInFigma() :bool {
    return this.guid && savedScripts.hasGUID(this.guid)
  }

  requireValidGUID() :string {
    if (!this.meta.guid) {
      this.meta.guid = guid.gen()
      this._metaDirty = DirtyState.Dirty
      this.scheduleSave()
    }
    return this.meta.guid
  }

  scheduleSave() {
    // (re)start save timer
    let e = new Error()
    clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      // print(`autosave script ${this}`)
      this.save()
    }, this.meta.id <= 0 ? 0 : 500) // immediate for first save
  }

  save() :Promise<void> {
    let p :Promise<void>

    clearTimeout(this._saveTimer)
    this._saveTimer = null
    this._savedModelVersion = this._currModelVersion

    dlog(`Script.save ID=${this.meta.id} GUID=${this.meta.guid}`, this)

    if (this.meta.id <= 0) {
      // create

      if (this._body == "") {
        // avoid creating files that are empty
        dlog("Script.save canceled because _body is empty")
        return Promise.resolve()
      }

      // check GUID
      if (!this.meta.guid) {
        console.warn(`unsaved script missing GUID; generating & assigning one`)
        this.meta.guid = guid.gen()
      }

      print(`save/create script ${JSON.stringify(this.meta.name)}`)

      // if (this.meta.id < 0) {
      //   // example
      //   this.meta.name = "Copy of " + this.meta.name
      // }

      this.meta.modifiedAt = new Date()
      this.meta.createdAt = this.meta.modifiedAt
      p = db.modify(["scripts", "scriptBody"], async (scripts, scriptBody) => {
        delete this.meta.id  // to allow key generator to generate us a new id
        let sp = scripts.add(this.meta)
        this.meta.id = 0  // assign zero id while save is in progress
        let id = await sp as number
        this.meta.id = id
        scriptBody.put(this._body, id)
      }) as any as Promise<void>
    } else if (this._bodyDirty == DirtyState.Clean && this._metaDirty == DirtyState.Clean) {
      // no changes
      return Promise.resolve()
    } else {
      // update

      // check GUID
      if (!this.meta.guid) {
        console.warn(`existing script#${this.meta.id} missing GUID; generating & assigning one`)
        this.meta.guid = guid.gen()
        this._metaDirty = DirtyState.DirtyImplicit
      }

      let metaDirty = this._metaDirty != DirtyState.Clean
      let bodyDirty = this._bodyDirty != DirtyState.Clean
      if (bodyDirty || metaDirty) {
        if (this._bodyDirty == DirtyState.Dirty || this._metaDirty == DirtyState.Dirty) {
          // update timestamp as dirty is from user action
          this.meta.modifiedAt = new Date()
          metaDirty = true
        }
        p = db.modify(["scripts", "scriptBody"], async (scripts, scriptBody) => {
          if (metaDirty) { scripts.put(this.meta) }
          if (bodyDirty) { scriptBody.put(this._body, this.id) }
        }) as any as Promise<void>
      } else {
        p = Promise.resolve()
      }

      // save to canvas if needed
      this.saveToFigma({ createIfMissing: false })
    }

    // clear dirty flags
    this._bodyDirty = DirtyState.Clean
    this._metaDirty = DirtyState.Clean

    return p.then(() => {
      this.triggerEvent("save", this)
    }).catch(err => {
      console.error(`failed to save ${this} in indexeddb: ${err.stack||err}`)
    })
  }


  saveToFigma(options :{ createIfMissing :bool }) {
    this.requireValidGUID()
    if (this.id == 0) {
      if (this._body.length == 0) {
        this._body = " " // force save
      }
      this.save()
      this._body = ""
    }
    figma.sendMsg<SaveScriptMsg>({
      type: "save-script",
      create: options.createIfMissing,
      script: {
        guid: this.guid,
        name: this.name,
        body: this.body,
      },
    })
  }

  _onAfterLoadBody() :void {
    if (!this._body || this.isROLib) {
      return
    }
    // dlog("Script patch body", this.name, {isROLib: this.isROLib}, this)
    const header = `(/*SCRIPTER*/async function __scripter_script_main(){\n`
    const footer = `\n})()/*SCRIPTER*/` // no ending newline
    if (!this._body.startsWith(header)) {
      this._body = header + this._body
    }
    if (!this._body.endsWith(footer)) {
      this._body = this._body + footer
    }
  }


  async load() :Promise<boolean> {
    let [meta, body, viewState] = await db.read(["scripts", "scriptBody", "scriptViewState"],
      (scripts, _1, _2)         => scripts.get(this.id),
      (_1, scriptBody, _2)      => scriptBody.get(this.id),
      (_1, _2, scriptViewState) => scriptViewState.get(this.id),
    )
    if (!meta) {
      return false
    }
    this.meta = meta as ScriptMeta
    this._body = body
    this._editorViewState = (viewState as EditorViewState|undefined) || null
    this._onAfterLoadBody()
    return true
  }


  async loadIfEmpty() :Promise<bool> {
    if (!this.meta || !this.meta.name) {
      return this.load()  // full load
    }
    if (this.body != "") {
      return true  // no load
    }
    let [body, viewState] = await db.read(["scriptBody", "scriptViewState"],
      (scriptBody, _)      => scriptBody.get(this.id),
      (_, scriptViewState) => scriptViewState.get(this.id),
    )
    this._body = body
    this._editorViewState = (viewState as EditorViewState|undefined) || null
    this._onAfterLoadBody()
    return true
  }


  async delete() {
    await db.modify(["scripts", "scriptBody", "scriptViewState"],
      async (scripts, scriptBody, scriptViewState) => {
        scripts.delete(this.id)
        scriptBody.delete(this.id)
        scriptViewState.delete(this.id)
      }
    )
    this.triggerEvent("delete", this)
    this.meta = createScriptMeta({})
    this._body = ""
    this._editorViewState = null
  }


  // returns an exact copy, with same id and guid
  mutableCopy() :Script {
    return new Script(
      {...this.meta, tags: [].concat(this.meta.tags)},
      this._body,
      this._editorViewState, // intentionally a ref. (immutable)
      this.isROLib,
    )
  }


  // returns a copy that has a zero id and a new guid
  duplicate(meta :Partial<ScriptMeta> = {}) :Script {
    return new Script(
      { ...this.meta, tags: [].concat(this.meta.tags),  // deep copy
        id: 0, guid: guid.gen(),  // default override
        ...meta,                  // caller override
      },
      this._body,
      this._editorViewState, // intentionally a ref. (immutable)
      this.isROLib,
    )
  }


  mergeApply(b :Script) {
    let a = this
    if (a.meta.modifiedAt > b.meta.modifiedAt) {
      return
    }
    // apply data of B
    a.body = b.body
    a.name = b.name
    if (a.meta.id == 0) {
      a.meta.id = b.meta.id
    }
  }


  toString() :string {
    return `script#${this.meta.id}` + (this.meta.guid ? `/${this.meta.guid}` : "")
  }

  // static createDefault() :Script {
  //   return this.create({}, defaultScriptBody)
  // }

  static create(meta :Partial<ScriptMeta> = {}, body :string = "", isROLib? :boolean) :Script {
    if (!meta.guid) {
      // since July 2020 all scripts must have a GUID
      meta = { ...meta, guid: guid.gen() }
    }
    const s = new Script(createScriptMeta(meta), body, null, isROLib)
    s._onAfterLoadBody()
    return s
  }

  static async load(id :number) :Promise<Script|null> {
    let s = new Script({ id } as ScriptMeta, "", null)
    return (await s.load()) ? s : null
  }
}
