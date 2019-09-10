import * as xdb from "./xdb"
import { db } from "./data"
import * as monaco from "monaco-editor"

const print = console.log.bind(console)


class Data {
  lastOpenScript  :number = 0
  editorViewState :monaco.editor.ICodeEditorViewState|null = null
  menuVisible     :bool = true
  fontSize?       :number = undefined
}

class Config {
  _dirtyProps = new Set<string>()
  _saveTimer :any = null

  data = new Data()

  get lastOpenScript() :number { return this.data.lastOpenScript }
  set lastOpenScript(v :number) {
    if (this.data.lastOpenScript !== v && v != 0) {
      this.data.lastOpenScript = v
      this.dirty("lastOpenScript")
    }
  }

  get editorViewState() :monaco.editor.ICodeEditorViewState|null {
    return this.data.editorViewState
  }
  set editorViewState(v :monaco.editor.ICodeEditorViewState|null) {
    if (this.data.editorViewState !== v) {
      this.data.editorViewState = v
      this.dirty("editorViewState")
    }
  }

  get fontSize() :number|undefined { return this.data.fontSize }
  set fontSize(v :number|undefined) {
    if (this.data.fontSize !== v) {
      this.data.fontSize = v
      this.dirty("fontSize")
    }
  }

  get menuVisible() :bool { return this.data.menuVisible }
  set menuVisible(v :bool) {
    if (this.data.menuVisible !== v) {
      this.data.menuVisible = v
      this.dirty("menuVisible")
    }
  }



  dirty(prop :string) {
    // print("config dirty", prop)
    this._dirtyProps.add(prop)
    if (this._saveTimer === null) {
      this._saveTimer = setTimeout(() => { this.saveDirty() }, 200)
    }
  }

  async load() {
    await db.read(["config"],
      ...Object.keys(this.data).map(k =>
        (s :xdb.ObjectStore) => s.get(k).then(v => { this.data[k] = v })
      )
    )
  }

  async saveDirty() {
    let dirtyProps = Array.from(this._dirtyProps) ; this._dirtyProps.clear()
    return this.saveProps(dirtyProps)
  }

  async saveAll() {
    return this.saveProps(Object.keys(this.data))
  }

  async saveProps(props :string[]) {
    clearTimeout(this._saveTimer) ; this._saveTimer = null
    let values = props.map(k => this.data[k]) // copy since put is async
    print("[config] save", props, values)
    await db.modify(["config"], async s => {
      props.forEach((k, i) => s.put(values[i], k))
    })
  }
}

export const config = new Config()
