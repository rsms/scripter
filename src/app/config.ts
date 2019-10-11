import * as xdb from "./xdb"
import { db } from "./data"
import * as monaco from "monaco-editor"
import { EventEmitter } from "./event"
import { print, dlog } from "./util"
import { WindowSize } from "../common/messages"


class Data {
  // values define new-user defaults
  lastOpenScript        :number = 0
  editorViewState       :monaco.editor.ICodeEditorViewState|null = null
  menuVisible           :bool = false
  fontSize?             :number = undefined
  showLineNumbers       :bool = false
  wordWrap              :bool = true
  monospaceFont         :bool = false
  codeFolding           :bool = false
  minimap               :bool = false
  quickSuggestions      :bool = true
  quickSuggestionsDelay :number = 500 // ms
  windowSize            :[WindowSize,WindowSize] = [WindowSize.MEDIUM,WindowSize.MEDIUM]
}

interface ConfigEvents {
  "change": {key:string}
}

class Config extends EventEmitter<ConfigEvents> {
  _dirtyProps = new Set<string>()
  _saveTimer :any = null

  version = 0  // increments (locally, in memory) whenever changes are made
  data = new Data()

  // -----------------------------------------------------------------
  // Data properties

  get editorViewState() :monaco.editor.ICodeEditorViewState|null {
    return this.data.editorViewState
  }
  set editorViewState(v :monaco.editor.ICodeEditorViewState|null) {
    this._set("editorViewState", v)
  }

  get lastOpenScript() :number { return this.data.lastOpenScript }
  set lastOpenScript(v :number) { if (v != 0) { this._set("lastOpenScript", v) } }

  get fontSize() :number|undefined { return this.data.fontSize }
  set fontSize(v :number|undefined) { this._set("fontSize", v) }

  get menuVisible() :bool { return this.data.menuVisible }
  set menuVisible(v :bool) { this._set("menuVisible", v) }

  get showLineNumbers() :bool { return this.data.showLineNumbers }
  set showLineNumbers(v :bool) { this._set("showLineNumbers", v) }

  get wordWrap() :bool { return this.data.wordWrap }
  set wordWrap(v :bool) { this._set("wordWrap", v) }

  get monospaceFont() :bool { return this.data.monospaceFont }
  set monospaceFont(v :bool) { this._set("monospaceFont", v) }

  get codeFolding() :bool { return this.data.codeFolding }
  set codeFolding(v :bool) { this._set("codeFolding", v) }

  get minimap() :bool { return this.data.minimap }
  set minimap(v :bool) { this._set("minimap", v) }

  get quickSuggestions() :bool { return this.data.quickSuggestions }
  set quickSuggestions(v :bool) { this._set("quickSuggestions", v) }

  get quickSuggestionsDelay() :number { return this.data.quickSuggestionsDelay }
  set quickSuggestionsDelay(v :number) { this._set("quickSuggestionsDelay", v) }

  get windowSize() :[WindowSize,WindowSize] { return this.data.windowSize }
  set windowSize(v :[WindowSize,WindowSize]) { this._set("windowSize", v) }


  // -----------------------------------------------------------------

  _set(key :keyof Data, value :any) {
    if (this.data[key] !== value) {
      ;(this.data as any)[key] = value
      this.dirty(key)
    }
  }

  dirty(prop :string) {
    // dlog("config dirty", prop)
    this._dirtyProps.add(prop)
    if (this._saveTimer === null) {
      this._saveTimer = setTimeout(() => { this.saveDirty() }, 200)
    }
    this.version++
    this.triggerEvent("change", { key: prop })
  }

  async load() {
    await db.read(["config"],
      ...Object.keys(this.data).map(k =>
        (s :xdb.ObjectStore) => s.get(k).then(v => {
          this.data[k] = v === undefined ? this.data[k] : v
        })
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
    dlog("[config] save", props, values)
    await db.modify(["config"], async s => {
      props.forEach((k, i) => s.put(values[i], k))
    })
  }
}

export const config = new Config()
