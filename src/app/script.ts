import { db } from "./data"
import { EventEmitter } from "./event"
import * as monaco from "monaco-editor"

const print = console.log.bind(console)

const defaultScriptBody = `
  for (let n of figma.currentPage.selection) {
    if (isText(n)) {
      n.characters = n.characters.trim()
    }
  }
  function isText(n :BaseNode) :n is TextNode {
    return n.type == "TEXT"
  }
`.trim().replace(/\n  /mg, "\n") + "\n"


type EditorViewState = monaco.editor.ICodeEditorViewState


export interface ScriptMeta {
  id         :number  // <=0 for memory-only, >0 when saved in database.
  name       :string
  tags       :string[]
  createdAt  :Date
  modifiedAt :Date
}

function createScriptMeta() :ScriptMeta {
  return {
    id:         0,
    name:       "Untitled",
    tags:       [],
    createdAt:  new Date(),
    modifiedAt: new Date(),
  }
}

interface ScriptEventMap {
  "save": Script
}

export class Script extends EventEmitter<ScriptEventMap> {
  meta :ScriptMeta
  _body :string
  _editorViewState :EditorViewState|null = null

  _saveTimer :any = null
  _savedModelVersion :number = 0  // transient editor version
  _currModelVersion :number = 0

  _metaDirty = false
  _bodyDirty = false

  constructor(meta :ScriptMeta, body :string, editorViewState :EditorViewState|null) {
    super()
    this.meta = meta
    this._body = body
    this._editorViewState = editorViewState
  }

  get id() :number { return this.meta.id }

  get createdAt() :Date { return this.meta.createdAt }
  get modifiedAt() :Date { return this.meta.modifiedAt }

  get body() :string { return this._body }
  set body(v :string) {
    this._body = v
    this._bodyDirty = true
    this.scheduleSave()
  }

  updateBody(text :string, modelVersion :number) {
    this._body = text
    this._currModelVersion = modelVersion
    this._bodyDirty = this._currModelVersion != this._savedModelVersion
    this.scheduleSave()
  }

  get name() :string { return this.meta.name }
  set name(v :string) {
    if (this.meta.name !== v) {
      this.meta.name = v
      this._metaDirty = true
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

  scheduleSave() {
    // (re)start save timer
    clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      // print(`autosave script ${this}`)
      this._saveTimer = null
      this._savedModelVersion = this._currModelVersion
      this.save()
    }, 500)
  }

  save() :Promise<void> {
    this.meta.modifiedAt = new Date()
    let p :Promise<void>

    if (this.meta.id <= 0) {
      // create

      if (this._body.trim() == "") {
        // avoid creating files that are empty
        return Promise.resolve()
      }

      this.meta.createdAt = this.meta.modifiedAt
      p = db.modify(["scripts", "scriptBody"], async (scripts, scriptBody) => {
        delete this.meta.id  // to allow key generator to generate us a new id
        let sp = scripts.add(this.meta)
        this.meta.id = 0  // assign zero id while save is in progress
        let id = await sp as number
        this.meta.id = id
        scriptBody.put(this._body, id)
      }) as any as Promise<void>
    } else if (!this._bodyDirty && !this._metaDirty) {
      // no changes
      return Promise.resolve()
    } else {
      // update
      let metaDirty = this._metaDirty
      let bodyDirty = this._bodyDirty
      p = db.modify(["scripts", "scriptBody"], async (scripts, scriptBody) => {
        if (metaDirty) { scripts.put(this.meta) }
        if (bodyDirty) { scriptBody.put(this._body, this.id) }
      }) as any as Promise<void>
    }

    // clear dirty flags
    this._bodyDirty = false
    this._metaDirty = false

    return p.then(() => {
      this.emitEvent("save", this)
    }).catch(err => {
      console.error(`failed to save ${this} in indexeddb: ${err.stack||err}`)
    })
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
    return true
  }


  toString() :string {
    return `script#${this.meta.id}`
  }

  static createDefault() :Script {
    return new Script(createScriptMeta(), defaultScriptBody, null)
  }

  static createEmpty() :Script {
    return new Script(createScriptMeta(), "", null)
  }

  static async load(id :number) :Promise<Script|null> {
    let s = new Script({ id } as ScriptMeta, "", null)
    return (await s.load()) ? s : null
  }
}
