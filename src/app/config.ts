import * as xdb from "./xdb"
import { db } from "./data"
import * as monaco from "../monaco/monaco"
import { EventEmitter } from "./event"
import { print, dlog } from "./util"
import { WindowSize } from "../common/messages"


class Data {
  // values define new-user defaults
  //
  // function value means that on load, the actual stored value is passed through the function.
  // if said function returns undefined, the values is removed from local storage.
  //
  //                    DEFAULT VALUE
  lastOpenScript        :number = 0
  editorViewState       :monaco.editor.ICodeEditorViewState|null = null
  menuVisible           :bool = false
  uiScale               :number = 1
  showLineNumbers       :bool = false
  wordWrap              :bool = true
  monospaceFont         :bool = false
  codeFolding           :bool = false
  showWhitespace        :bool = false
  indentGuides          :bool = true
  minimap               :bool = false
  quickSuggestions      :bool = true
  quickSuggestionsDelay :number = 500 // ms
  hoverCards            :bool = true
  windowSize            :[WindowSize,WindowSize] = [WindowSize.MEDIUM,WindowSize.MEDIUM]

  // -------------------------------------------------
  // Deprecated data properties.
  //
  // When stored data for one of these properties is discovered on load, the corresponding
  // function is called _after_ all non-deprecated data values has been read.
  // The function can inspect and modify `data` to migrate information.

  fontSize = (data :Data, value :any) => {
    // convert fontSize to uiScale
    data.uiScale = (
      value > 22 ? 2 :
      value > 18 ? 1.75 :
      value > 16 ? 1.5 :
      value > 15 ? 1.4 :
      value > 13 ? 1.3 :
      value > 12 ? 1.2 :
      value > 11 ? 1.1 :
      1
    )
  }
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

  // @DEPRECATED -> uiScale
  get uiScale() :number { return this.data.uiScale }
  set uiScale(v :number) { this._set("uiScale", v) }

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

  get showWhitespace() :bool { return this.data.showWhitespace }
  set showWhitespace(v :bool) { this._set("showWhitespace", v) }

  get indentGuides() :bool { return this.data.indentGuides }
  set indentGuides(v :bool) { this._set("indentGuides", v) }

  get minimap() :bool { return this.data.minimap }
  set minimap(v :bool) { this._set("minimap", v) }

  get quickSuggestions() :bool { return this.data.quickSuggestions }
  set quickSuggestions(v :bool) { this._set("quickSuggestions", v) }

  get quickSuggestionsDelay() :number { return this.data.quickSuggestionsDelay }
  set quickSuggestionsDelay(v :number) { this._set("quickSuggestionsDelay", v) }

  get hoverCards() :bool { return this.data.hoverCards }
  set hoverCards(v :bool) { this._set("hoverCards", v) }

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
    let keys = Object.keys(this.data)
    let migrate :([string,()=>void])[] = []
    await db.read(["config"], ...keys.map(k =>
      // callback function for each value
      (s :xdb.ObjectStore) => s.get(k).then(v => {
        let handler = this.data[k]
        if (handler && typeof handler == "function") {
          if (v !== undefined) {
            migrate.push([k, () => handler(this.data, v)])
          }
        } else {
          this.data[k] = v === undefined ? this.data[k] : v
        }
      })
    ))
    // migrate old data?
    if (migrate.length > 0) {
      let keys = migrate.map(e => e[0])
      let rmkeys :string[] = []
      console.log(`[scripter] migrating config keys ${keys}`)
      for (let [key, fn] of migrate) {
        try {
          let value = fn()
          if (value === undefined) {
            rmkeys.push(key)
          } else {
            this.data[key] = value
          }
        } catch (err) {
          console.warn(`[scripter] migration for config "${key}" failed: ${err.stack|err}`)
        }
      }
      // clear deprecated data from db
      if (rmkeys.length > 0) {
        await db.modify(["config"], async s => {
          for (let k of rmkeys) {
            s.delete(k)
          }
        })
      }
    }
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
