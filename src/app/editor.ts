import * as monaco from "../monaco/monaco"
import "./editor-themes"  // for side-effects
import { Script, ScriptMeta } from "./script"
import { EventEmitter } from "./event"
import { db } from "./data"
import { config } from "./config"
import { scriptsData } from "./script-data"
import { ViewZones } from "./viewzones"
import * as Eval from "./eval"
import * as warningMessage from "./warning-message"
import toolbar from "./toolbar"
import { print, dlog, isMac } from "./util"
import { menu } from "./menu"
import { LoadScriptMsg } from "../common/messages"
import resources from "./resources"
import { NavigationHistory, HistoryEntry, NavigationHistorySnapshot } from "./history"
import app from "./app"

const ts = monaco.languages.typescript

// some extensions to monaco, defined in src/monaco/monaco-editor/esm/vs/editor/scripter.js
declare var __scripterMonaco : {
  patchEditorService(
    openCodeEditor:(input :OpenCodeEditorInput, editor :MonacoEditor)=>Promise<MonacoEditor|null>
  ) :void
  patchEditorModelResolverService(
    findModel:(editor :MonacoEditor, resource :monaco.Uri) => EditorModel|null
  ) :void
  patchUriLabelService(
    // returns a label for a resource.
    // Shows up as a tool tip and small text next to the filename
    getUriLabel:(resource :monaco.Uri, options? :{relative?:boolean}) => string
  ) :void
  patchBasenameOrAuthority(f? :(resource :monaco.Uri) => string|null|undefined)
}
interface OpenCodeEditorInput {
  resource? :monaco.Uri
  options? : {
    selection :monaco.IRange,
  }
}


type EditorModel = monaco.editor.ITextModel
type EditorOptions = monaco.editor.IEditorOptions
type MonacoEditor = monaco.editor.IStandaloneCodeEditor


interface ScriptProgram {
  code      :string
  sourceMap :string
}

interface EditorHistoryEntry extends HistoryEntry {
  readonly scriptGUID :string
}


const kLocked = Symbol("Locked")
const kOnUnlock = Symbol("OnUnlock")


const defaultFontSize = 12  // sync with --editorFontSize in app.css

const varspaceFontFamily  = "iaw-quattro-var, iaw-quattro, monospace, 'Inter var'"
const monospaceFontFamily = "jbmono, monospace, 'Inter var'"

// default monaco editor options
const defaultOptions :EditorOptions = {
  // automaticLayout: true,

  lineDecorationsWidth: 16, // margin on left side, in pixels

  lineNumbers: "off",
  lineNumbersMinChars: 3,

  wordWrap: "off", // off | on | bounded | wordWrapColumn
  wrappingIndent: "same", // none | same | indent | deepIndent

  scrollBeyondLastLine: false,
  scrollBeyondLastColumn: 2,
  smoothScrolling: true, // animate scrolling to a position
  useTabStops: true,

  // fontLigatures: true,
  showUnused: false,  // fade out unused variables
  folding: false,  // must be off since July 2020 (messes with hidden wrapper)
  cursorBlinking: "smooth", // solid | blink | smooth | phase
  renderLineHighlight: "none",
  renderWhitespace: "selection", // none | boundary | selection | all (default: none)
  renderControlCharacters: false,
  multiCursorModifier: isMac ? 'ctrlCmd' : 'alt',
  dragAndDrop: true,

  fontSize: defaultFontSize,
  fontFamily: varspaceFontFamily,
  disableMonospaceOptimizations: false, // required for non-monospace fonts

  extraEditorClassName: 'scripter-light',

  // disable links since they can't be clicked in Figma anyways
  links: false,

  // disable code lens, which is not well documented, but a way to add stuff inline.
  codeLens: false,

  // not sure what this is, but we probably don't need it
  lightbulb: { enabled: false },

  quickSuggestions: true,
  quickSuggestionsDelay: 800, // ms
  acceptSuggestionOnEnter: "smart",
  suggestSelection: "recentlyUsedByPrefix", // first | recentlyUsed | recentlyUsedByPrefix

  tabCompletion: "on",

  // "hover" configures the hover cards shown on pointer hover
  hover: {
    enabled: true, // Defaults to true.

    // Delay for showing the hover.
    delay: 1000,

    // Is the hover sticky such that it can be clicked and its contents selected?
    // sticky?: boolean; // Defaults to true.
  },

  suggest: {
    // Enable graceful matching. Defaults to true.
    // filterGraceful?: boolean;

    // Prevent quick suggestions when a snippet is active. Defaults to true.
    // snippetsPreventQuickSuggestions?: boolean;

    // Favours words that appear close to the cursor.
    localityBonus: true,

    // Enable using global storage for remembering suggestions.
    shareSuggestSelections: true,

    // Enable or disable icons in suggestions. Defaults to true.
    // showIcons: false,

    // Max suggestions to show in suggestions. Defaults to 12.
    // maxVisibleSuggestions: 9,

    // Names of suggestion types to filter.
    // filteredTypes?: Record<string, boolean>;

    hideStatusBar: false,
  },

  scrollbar: {
    useShadows: false,
    verticalScrollbarSize: 9,
    verticalSliderSize: 5,
    horizontalScrollbarSize: 9,
    horizontalSliderSize: 5,
  },
  minimap: {
    enabled: false,
  },
}


const typescriptCompilerOptions = {
  // Note: When we set compiler options, we _override_ the default ones.
  // This is why we need to set allowNonTsExtensions.
  allowNonTsExtensions: true, // make "in-memory source" work
  target: ts.ScriptTarget.ES2019,
  allowUnreachableCode: true,
  allowUnusedLabels: true,
  removeComments: true,
  module: ts.ModuleKind.ES2015,
  sourceMap: true, // note: inlineSourceMap must not be true (we rely on this in eval)
  strictNullChecks: true,
  newLine: ts.NewLineKind.LineFeed, // scripter-env.js relies on this

  jsx: ts.JsxEmit.React,
  jsxFactory: "DOM.createElement",

  // Note on source maps: Since we use eval, and eval in chrome does not interpret sourcemaps,
  // we disable sourcemaps for now (since it's pointless).
  // However, we could use the sourcemap lib to decorate error stack traces a la
  // evanw's sourcemap-support. The plugin could do this, so that the stack trace in Figma's
  // console is updated as well as what we display in the Scripter UI. Upon error, the plugin
  // process could request sourcemap from Scripter, so that we only have to transmit it on error.
  // inlineSourceMap: true,
}


export enum ModelChangeFlags { // bitflags
  NONE             = 0,
  ADD_LINE         = 1 << 0,
  REMOVE_LINE      = 1 << 1,
  LAST_LINE_INTACT = 1 << 2,
}
export function ModelChangeFlagsString(flags :ModelChangeFlags) :string {
  let s = []
  if (flags & ModelChangeFlags.ADD_LINE) { s.push("ADD_LINE") }
  if (flags & ModelChangeFlags.REMOVE_LINE) { s.push("REMOVE_LINE") }
  if (flags & ModelChangeFlags.LAST_LINE_INTACT) { s.push("LAST_LINE_INTACT") }
  return s.length == 0 ? "NONE" : s.join("|")
}


type DecoratedTextChangedCallback = (d :monaco.editor.IModelDecoration) => void


interface EditorStateEvents {
  "init": undefined
  "modelchange": undefined
  "decorationchange": undefined
}

const kScript = Symbol("script")


export class EditorState extends EventEmitter<EditorStateEvents> {
  readonly defaultFontSize = defaultFontSize

  editor :MonacoEditor
  options :EditorOptions = {...defaultOptions}

  editorPromise :Promise<MonacoEditor>
  _editorPromiseResolve: (e:MonacoEditor)=>void

  viewZones = new ViewZones(this)

  _currentModel    :EditorModel
  _currentScript   :Script
  _currentScriptId :number|null = -1
  _nextModelId = 0
  _saveViewStateTimer :any = null
  _lineNumberOffset = 0 // for hiddenAreas

  readonly hiddenAreas :ReadonlyArray<monaco.Range> = []  // maintained by updateHiddenAreas

  editorDecorationIds = []
  decorationCallbacks = new Map<string,DecoratedTextChangedCallback>()

  changeObservationEnabled = false
  changeObservationActive = false
  changeObservationLastLineCount = 0

  isInitialized = false


  constructor() {
    super()
    this.editorPromise = new Promise<MonacoEditor>(resolve => {
      this._editorPromiseResolve = resolve
    })
  }


  fmtLineNumber(lineNumber: number) :string {
    // offset by 1 because of the hidden
    return (lineNumber - this._lineNumberOffset).toString(10)
  }


  // ----------------------------------------------------------------------------------
  // Managing scripts

  get currentModel() :EditorModel { return this._currentModel }
  get currentScript() :Script { return this._currentScript }
  get currentScriptId() :number { return this._currentScript ? this._currentScript.id : -1 }


  onCurrentScriptSave = (_ :Script) => {
    dlog("script saved")
    this._currentScriptId = this._currentScript.id  // may have been assigned one
    config.lastOpenScriptGUID = this._currentScript.guid  // in case GUID changed
    // menu.updateScriptList()

    if (this._currentScript.modelVersion == 0) {
      // change caused not by the editor but by something else. Update editor when ready.
      let scriptId = this._currentScriptId
      this.editorPromise.then(() => {
        if (scriptId == this._currentScriptId) {
          this._currentModel.setValue(this._currentScript.body)
        }
      })
    }
  }

  //models = new Map<Script,EditorModel>()

  getModel(script :Script) :EditorModel {
    if (this._currentScript === script) {
      return this._currentModel
    }
    let uri = this.modelURIForScript(script)
    let model = monaco.editor.getModel(uri)
    if (model) {
      dlog(`editor/getModel: using exising model for ${uri}`)
      return model
    }
    dlog(`editor/getModel: creating new model for ${uri}`)
    model = monaco.editor.createModel(script.body, "typescript", uri)
    model.updateOptions({
      tabSize: config.tabSize,
      indentSize: config.tabSize,
      insertSpaces: !config.useTabs,
      trimAutoWhitespace: true,
    })
    model[kScript] = script

    let onDeleteScript = (script :Script) => {
      this.disposeModel(script)
      script.removeListener("delete", onDeleteScript)
    }
    script.on("delete", onDeleteScript)

    // init new model right away so that we receive events for things like TS feedback
    this.initEditorModel(model)
    return model
  }

  disposeModel(script :Script) {
    // monaco.editor.getModels()
    let uri = this.modelURIForScript(script)
    let model = monaco.editor.getModel(uri)
    if (!model) {
      console.warn(`editor/disposeModel ${script}: no active model`)
      return
    }
    if (this._currentModel === model) {
      console.warn(`editor/disposeModel attempting to dispose active model (ignoring)`)
      return
    }
    dlog(`editor/disposeModel ${script}`)
    model.dispose()
  }

  modelURIForScript(script :Script) :monaco.Uri {
    let filename = script.guid
    if (!filename.endsWith(".d.ts")) {
      filename = "scripter." + filename + ".tsx"
    }
    return monaco.Uri.file(filename)
    // return monaco.Uri.from({scheme:"scripter", path:filename})
  }

  setCurrentScriptFromUserAction(script :Script) {
    this.setCurrentScript(script)
    this.historyPush()
  }

  setCurrentScript(script :Script) :EditorModel {
    let model = this.getModel(script)
    if (model === this._currentModel) {
      return model
    }

    if (!script.isLoaded) {
      console.warn("editor/setCurrentScript with not-yet-loaded script", script)
    }

    if (this._currentScript) {
      this._currentScript.removeListener("save", this.onCurrentScriptSave)
    }

    this._currentModel = model

    if (this.editor) {
      // path taken in all cases except during app initialization
      this.clearAllMetaInfo()
      this.setModel(model)
      this.updateOptions({
        readOnly: script.isROLib,
      })
      let layoutAndFocus = () => {
        this.editor.layout()
        this.editor.focus()
      }
      layoutAndFocus()
      requestAnimationFrame(() => {
        layoutAndFocus()
        this.restoreViewState()
        setTimeout(layoutAndFocus, 1)
        setTimeout(layoutAndFocus, 100)
        this.updateHiddenAreas()
      })

      this.updateHiddenAreas()
    }

    this._currentScript = script
    this._currentScriptId = script.id
    this._currentScript.on("save", this.onCurrentScriptSave)
    // config.lastOpenScript = script.id
    config.lastOpenScriptGUID = script.guid

    return model
  }


  setModel(model :EditorModel) {
    let prevModel = this.editor.getModel()
    if (prevModel !== model) {
      // // Note: Monaco only has a single TypeScript instance, so we can't have multiple
      // // models in Scripter as they would share scope, which causes errors like
      // // "can not redeclare x". So, we dispose any previous model before setting a new one.
      // // Disposing of a model causes the TypeScript instance to "forget".
      // if (prevModel) {
      //   prevModel.dispose()
      // }
      this.editor.setModel(model)
    }
    this._currentModel = model
    if (this.editor) {
      this.updateHiddenAreas()
    }
  }


  _isSwitchingModel = false // used to avoid recording edits to scripts


  async switchToScript(script :Script) :Promise<Script> {
    let editor = await this.editorPromise  // wait for editor to initialize
    this.stopCurrentScript()
    this.setCurrentScriptFromUserAction(script)
    return this._currentScript
  }


  async newScript(meta? :Partial<ScriptMeta>, body :string = "") :Promise<Script> {
    let script = Script.create(meta, body)
    return this.switchToScript(script)
  }


  // Attempts to open script.
  // Returns null if another open action won the natural race condition.
  async openScript(script :Script) :Promise<Script|null> {
    if (this._currentScript.guid == script.guid || this._currentScriptId == script.id) {
      this.editor.focus()
      return this._currentScript
    }
    dlog(`open script ${script}`)
    this._currentScriptId = script.id
    this.stopCurrentScript()
    if (this._currentScriptId != script.id) {
      // another openScript call was made -- discard
      return null
    }
    return this.switchToScript(script)
  }


  async openScriptByID(id :number) :Promise<Script|null> {
    if (DEBUG) {
      console.warn("legacy access to editor/openScriptByID")
    }
    if (this._currentScript && this._currentScript.id == id) {
      this.editor.focus()
      return this._currentScript
    }
    let script = await scriptsData.getScript(id)
    if (!script) {
      // TODO: move error reporting to callers
      console.error(`openScriptByID(${id}) failed (not found)`)
      return null
    }
    return this.openScript(script)
  }


  async openScriptByGUID(guid :string) :Promise<Script|null> {
    if (!guid) {
      return null
    }
    if (typeof guid != "string") {
      throw new Error("invalid guid")
    }
    if (this._currentScript && this._currentScript.guid == guid) {
      this.editor.focus()
      return this._currentScript
    }
    let script = await scriptsData.getScriptByGUID(guid)
    if (!script) {
      return null
    }
    return this.openScript(script)
  }


  // save current script to Figma canvas in a new node
  async saveScriptToFigma() {
    this.currentScript.saveToFigma({ createIfMissing: true })
    editor.focus()
    requestAnimationFrame(() => editor.focus())
  }


  async loadScriptFromFigma(msg :LoadScriptMsg) {
    let s = msg.script
    dlog("editor.loadScriptFromFigma", s.guid, s.name)
    let script = await this.openScriptByGUID(s.guid)
    if (script) {
      dlog("editor.loadScriptFromFigma found local version of script")
      // a script with the same GUID was found in local database
      if (script.body != s.body && script.body.trim() != s.body.trim()) {
        // Body of local version != body of script on canvas.
        // Unless the local version is empty, ask user what to do and if acceptable,
        // update local script body.
        if (script.body.trim() == "" || confirm(
          "Replace script?\n" +
          "The script in the Figma file differs from the script stored locally. " +
          "Would you like to update your local version with the script?")
        ) {
          script.body = s.body  // will trigger save
        }
      }
    } else {
      dlog("editor.loadScriptFromFigma no local version; creating new")
      script = await this.newScript({ guid: s.guid, name: s.name }, s.body)
    }
  }


  // ----------------------------------------------------------------------------------
  // Editor configuration

  restoreViewState() {
    let viewState = this._currentScript.editorViewState
    if (viewState) {
      this.editor.restoreViewState(viewState)
      // setTimeout(() => { this.editor.restoreViewState(viewState) }, 0)
    }

    // // workaround for a bug in monaco:
    // //   Flipping disableMonospaceOptimizations fixes bug with variable-width fonts
    // //   where line length is incorrectly computed.
    // //   The wordWrap change causes Monaco to shrink its viewport to fit the content.
    // //   For some reason the Monaco viewport never shrinks, even when editing.
    // if (this.options.disableMonospaceOptimizations) {
    //   let wordWrap = this.options.wordWrap
    //   this.updateOptions({ disableMonospaceOptimizations: false, wordWrap: "on" })
    //   setTimeout(() => {
    //     this.updateOptions({ disableMonospaceOptimizations: true, wordWrap })
    //   }, 1)
    //   // Note: requestAnimationFrame doesn't seem to work.
    // }
  }

  saveViewState() {
    clearTimeout(this._saveViewStateTimer as number)
    this._saveViewStateTimer = null
    this._currentScript.editorViewState = this.editor.saveViewState()
  }

  setNeedsSaveViewState() {
    if (this._saveViewStateTimer === null) {
      this._saveViewStateTimer = setTimeout(() => this.saveViewState(), 200)
    }
  }

  getEffectiveOptions() :EditorOptions {
    let options :EditorOptions = {
      lineNumbers:             config.showLineNumbers ? this.fmtLineNumber.bind(this) : "off",
      wordWrap:                config.wordWrap ? "on" : "off",
      quickSuggestions:        config.quickSuggestions,
      quickSuggestionsDelay:   config.quickSuggestionsDelay,
      //folding:                 config.codeFolding,
      renderWhitespace:        config.showWhitespace ? "all" : "selection",
      renderControlCharacters: config.showWhitespace,
      renderIndentGuides:      config.indentGuides,
      fontSize:                defaultFontSize * config.uiScale,
    }
    options.minimap = {...this.options.minimap, enabled: config.minimap }
    options.hover = {...this.options.hover, enabled: config.hoverCards }
    if (config.monospaceFont) {
      options.fontFamily = monospaceFontFamily
      options.disableMonospaceOptimizations = false
      document.body.classList.toggle("font-ligatures", config.fontLigatures)
    } else {
      options.fontFamily = varspaceFontFamily
      options.disableMonospaceOptimizations = true
      document.body.classList.add("font-ligatures")
    }
    return options
  }

  updateOptionsFromConfig() {
    this.updateOptions(this.getEffectiveOptions())
    this.currentModel.updateOptions({
      tabSize: config.tabSize,
      indentSize: config.tabSize,
      insertSpaces: !config.useTabs,
    })
  }

  updateOptions(options :EditorOptions) :boolean {
    let updated = false
    for (let k in options) {
      let v = options[k]
      if (k == "extraEditorClassName") {
        // prefix with current theme
        v = `scripter-light ${v}`.trim()
      }
      if (this.options[k] !== v) {
        this.options[k] = v
        updated = true
      }
    }
    if (updated && this.editor) {
      this.editor.updateOptions(this.options)
    }
    return updated
  }

  // focuses keyboard input
  focus() {
    this.editor.focus()
  }


  // ----------------------------------------------------------------------------------
  // Running scripts

  runDebounceTimer :any = null
  currentEvalPromise :Eval.EvalPromise|null = null  // non-null while script is running


  async runCurrentScript() :Promise<void> {
    if (this.runDebounceTimer !== null) { return }
    this.runDebounceTimer = setTimeout(()=>{ this.runDebounceTimer = null }, 100)

    if (this._currentScript.isROLib) {
      return
    }

    // stop any currently-running script
    this.stopCurrentScript()

    this.clearAllMetaInfo()

    let stopCallback = () => {
      this.stopCurrentScript()
    }
    toolbar.addStopCallback(stopCallback)

    // let runqItem = runqueue.push()

    let prog = await this.compileCurrentScript()

    if (prog.code.length > 0) {
      try {
        this.currentEvalPromise = Eval.run(prog.code, prog.sourceMap)
        await this.currentEvalPromise
        // runqItem.clearWithStatus("ok")
      } catch (err) {
        // runqItem.clearWithStatus("error")
      }
      this.currentEvalPromise = null
      this.viewZones.clearAllUIInputs()
    }

    toolbar.removeStopCallback(stopCallback)

    clearTimeout(this.runDebounceTimer)
    this.runDebounceTimer = null

    this.editor.focus()
  }


  isScriptRunning() :bool {
    return !!this.currentEvalPromise
  }


  stopCurrentScript() {
    dlog("stopCurrentScript")
    if (this.currentEvalPromise) {
      this.currentEvalPromise.cancel()
    }
    this.viewZones.clearAllUIInputs()
    // Note: Intentionally not calling clearHoverCards()
  }


  async compileCurrentScript() :Promise<ScriptProgram> {
    interface EmitOutput {
      outputFiles: {
        name: string;
        writeByteOrderMark: boolean;
        text: string;
      }[];
      emitSkipped: boolean;
    }
    // interface OutputFile {
    //   name: string;
    //   writeByteOrderMark: boolean;
    //   text: string;
    // }

    let result :EmitOutput
    let model = this.currentModel

    try {
      lockModel(model)
      let tsworkerForModel = await monaco.languages.typescript.getTypeScriptWorker()
      let tsclient = await tsworkerForModel(model.uri)
      result = await tsclient.getEmitOutput(model.uri.toString()) as EmitOutput
    } finally {
      unlockModel(model)
    }

    let prog :ScriptProgram = { code: "", sourceMap: "" }

    if (result.outputFiles && result.outputFiles.length) {
      for (let f of result.outputFiles) {
        if (/\.map$/.test(f.name)) {
          prog.sourceMap = f.text
        } else {
          prog.code = f.text
        }
      }
    }

    return prog
  }


  // ----------------------------------------------------------------------------------
  // Decorations


  clearAllMetaInfo() {
    warningMessage.hide()
    this.clearAllDecorations()
    this.viewZones.clearAll()
    this.clearHoverCards()
  }

  clearMessages() {
    this.clearAllDecorations()
    this.viewZones.clearAll()
    this.editor.focus()
  }

  clearHoverCards() {
    if (this.options.hover.enabled) {
      let options = { ...this.options, hover: { enabled: false } }
      this.editor.updateOptions(options)
      requestAnimationFrame(() => this.editor.updateOptions(this.options))
    }
  }

  clearAllDecorations() {
    this.decorationCallbacks.clear()
    this.editor.deltaDecorations(this.editorDecorationIds, [])
    this.editorDecorationIds = []
    this.triggerEvent("decorationchange")
  }

  removeDecorations(ids :string[]) {
    let idset = new Set(ids)
    this.editorDecorationIds = this.editorDecorationIds.filter(id => !idset.has(id))
    for (let id of ids) {
      this.decorationCallbacks.delete(id)
    }
    this.editor.deltaDecorations(ids, [])
    this.triggerEvent("decorationchange")
  }

  addDecorations(
    decorations :monaco.editor.IModelDeltaDecoration[],
    callback? :DecoratedTextChangedCallback,
  ) {
    let ids = this.editor.deltaDecorations([], decorations)
    if (this.editorDecorationIds.length > 0) {
      this.editorDecorationIds = this.editorDecorationIds.concat(ids)
    } else {
      this.editorDecorationIds = ids
      this.startObservingChanges()
    }
    if (callback) {
      for (let id of ids) {
        this.decorationCallbacks.set(id, callback)
      }
    }
    this.triggerEvent("decorationchange")
  }

  decorateError(pos :SourcePos, message :string) {
    setTimeout(() => {
      this.editor.revealLineInCenterIfOutsideViewport(pos.line, monaco.editor.ScrollType.Smooth)
    }, 1)
    this.addDecorations([{
      range: new monaco.Range(
        pos.line, pos.column + 1,
        pos.line, pos.column + 999
      ),
      options: {
        className: 'runtimeErrorDecoration',
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        hoverMessage: { // markdown
          value: "**Runtime error:** `" + message + "`",
          isTrusted: true,
        },
        overviewRuler: {
          position: monaco.editor.OverviewRulerLane.Full,
          color: "rgba(255,200,0,0.5)",
        },
        // isWholeLine: true,
        // glyphMarginClassName: 'errorGlyphMargin',
      }
    }], (d :monaco.editor.IModelDecoration) => {
      // decorated text changed
      this.removeDecorations([d.id])
      warningMessage.hide()
    })
  }



  // ----------------------------------------------------------------------------------
  // Observing changes to the script code

  _changeObservationRefCount = 0

  stopObservingChanges() {
    if (this._changeObservationRefCount == 0) {
      throw new Error("unbalanced call to stopObservingChanges")
    }
    this._changeObservationRefCount--
    if (this._changeObservationRefCount == 0) {
      this.changeObservationActive = false
      this.changeObservationLastLineCount = 0
    }
  }

  startObservingChanges() {
    this._changeObservationRefCount++
    if (this._changeObservationRefCount > 1) {
      return
    }

    if (!this.changeObservationActive) {
      this.changeObservationActive = true
      this.changeObservationLastLineCount = this.currentModel.getLineCount()
    }

    if (this.changeObservationEnabled) {
      return
    }
    this.changeObservationEnabled = true
    this.editor.onDidChangeModelContent((e: monaco.editor.IModelContentChangedEvent) => {
      this.updateHiddenAreas()

      if (e.isFlush) {
        // is reset
        this.clearAllMetaInfo()
        return
      }

      if (!this.changeObservationActive) {
        // inactive
        return
      }

      // compute line delta (effective number of lines added or removed)
      let lineCount = this.currentModel.getLineCount()
      let lineDelta = lineCount - this.changeObservationLastLineCount
      this.changeObservationLastLineCount = lineCount

      // compute maxium line range of all changes
      let startLine = Infinity
      let startColumn = 0
      let endLine = 0
      let endColumn = 999999
      for (let c of e.changes) {
        if (c.range.startLineNumber < startLine) {
          startLine = c.range.startLineNumber
          startColumn = c.range.startColumn
        }
        if (c.range.endLineNumber > endLine) {
          endLine = c.range.endLineNumber
          endColumn = c.range.endColumn
        }
      }

      let flags :ModelChangeFlags = ModelChangeFlags.NONE

      // single simple change?
      if (e.changes.length == 1) {
        let c = e.changes[0]
        let r = c.range

        if (c.text == "") {
          // Deletion
          // TODO: check for actual line removal and set ModelChangeFlags.REMOVE_LINE
          // Currently we don't use REMOVE_LINE apart from in conjunction with LAST_LINE_INTACT,
          // but maybe on day we will.
          if (endColumn == 1) {
            // dlog("removed line(s) at the beginning of a line")
            // reduce change to lastLine -1
            flags |= ModelChangeFlags.REMOVE_LINE
            flags |= ModelChangeFlags.LAST_LINE_INTACT
            if (endLine == startLine) {
              console.warn("[scripter] unexpected condition: endLine == startLine")
            }
          }
        } else /*if (c.rangeLength == 0)*/ {
          // let endLineEndCol = this.currentModel.getLineLength(endLine)
          // dlog("endLineEndCol", endLineEndCol)
          // if (endColumn == 1) {
            let lastch = c.text.charCodeAt(c.text.length - 1)
            if (lastch == 0x0A || lastch == 0x0D) { // \n || \r
              flags |= ModelChangeFlags.ADD_LINE
              if (endColumn == 1) {
                // dlog("added line(s) at the beginning")
                flags |= ModelChangeFlags.LAST_LINE_INTACT
              }
            }
          // }
          // Note: We don't track adding lines at the end
        }
      }

      // dlog("change flags", ModelChangeFlagsString(flags))

      // update zones
      this.viewZones.updateAfterEdit(startLine, startColumn, endLine, endColumn, lineDelta, flags)

      // update decorations
      for (let c of e.changes) {
        // expand change range to whole line
        let range = {
          startLineNumber: c.range.startLineNumber,
          startColumn: 0,
          endLineNumber: c.range.endLineNumber,
          endColumn: 99999,
        }
        let decorations = this.currentModel.getDecorationsInRange(range)
        // let decorations = this.editor.getLineDecorations(e.changes[0].range.startLineNumber)
        for (let d of decorations) {
          let callback = this.decorationCallbacks.get(d.id)
          if (callback) {
            callback(d)
          }
        }
      }
    })
  }



  // --------------------------------------------------------------------------------------------
  // Diagnostics

  _semdiag = new Map<EditorModel,any[]>()

  async getSemanticDiagnostics(model :EditorModel) :Promise<any[]> {
    let d = this._semdiag.get(model)
    if (!d) {
      try {
        lockModel(model)
        // request diagnostics from TypeScript.
        // This usually takes a few milliseconds unfortunatently, leading to a
        // "blinking" effect of error markers.
        let tsworker = await monaco.languages.typescript.getTypeScriptWorker()
        let tsclient = await tsworker(model.uri)
        d = await tsclient.getSemanticDiagnostics(model.uri.toString())
        this._semdiag.set(model, d)
      } finally {
        unlockModel(model)
      }
    }
    return d
  }

  async invalidateDiagnostics(model :EditorModel) {
    this._semdiag.delete(model)
  }


  // --------------------------------------------------------------------------------------------
  // Helper functions

  _measureEl :HTMLElement|null = null

  // measureHTMLElement places el into a hidden element of the editor that is as large as the
  // editor itself with absolute positioning.
  // Returns the effective clientWidth and clientHeight of el.
  //
  // You can set el.style.width or el.style.height before calling this if you want to constrain
  // one of the axes.
  //
  measureHTMLElement(el :HTMLElement) :{width:number, height:number} {
    let measureEl = this._measureEl
    if (!measureEl) {
      measureEl = document.createElement("div")
      measureEl.style.position = "absolute"
      measureEl.style.visibility = "hidden"
      measureEl.style.pointerEvents = "none"
      document.getElementById("editor").appendChild(measureEl)
      this._measureEl = measureEl
    }
    if (measureEl.children.length > 0) {
      measureEl.innerText = ""
    }
    let position = el.style.position
    el.style.position = "absolute"
    measureEl.appendChild(el)
    let size = { width: el.clientWidth, height: el.clientHeight }
    measureEl.removeChild(el)
    el.style.position = position
    return size
  }


  // --------------------------------------------------------------------------------------------
  // history & file navigation

  readonly navigationHistory = new NavigationHistory<EditorHistoryEntry>()
  historyLoadVersion = 0  // used to avoid races to unloaded scripts

  async initHistory() {
    // load preexisting history
    type Snapshot = NavigationHistorySnapshot<EditorHistoryEntry>
    const snap = await db.get<Snapshot>("history", "navigationHistory")
    if (snap) {
      dlog("editor restoring navigationHistory", snap)
      this.navigationHistory.restoreSnapshot(snap)
    }

    // save history
    let storeTimer :any = null
    let storeNow = () => {
      clearTimeout(storeTimer)
      storeTimer = null
      const snap = this.navigationHistory.createSnapshot()
      db.put("history", snap, "navigationHistory").then(() => {
        dlog("editor saved navigationHistory")
      })
    }
    app.on("close", storeNow)
    this.navigationHistory.on("change", () => {
      if (storeTimer === null) {
        storeTimer = setTimeout(storeNow, 300)
      }
    })

    // // when built in debug mode, visualize the history stack as it changes
    // if (DEBUG) this.navigationHistory.on("change", () => {
    //   dlog(`current history stack: (cursor=${this.navigationHistory.cursor})\n` +
    //     this.navigationHistory.stack.map((e, i) => {
    //     let s = i == this.navigationHistory.cursor ? ">" : " "
    //     return `${s} stack[${i}] = ${e.scriptGUID}`
    //   }).join("\n"))
    // })
  }

  historySwitchToScript(guid :string) :boolean {
    let script = scriptsData.scriptsByGUID.get(guid)
    if (!script) {
      return false
    }
    let v = ++this.historyLoadVersion
    script.whenLoaded(() => {
      if (this.historyLoadVersion == v) {
        this.setCurrentScript(script)
      }
    })
    return true
  }

  historyBack() {
    if (!this.navigationHistory.canGoBack()) {
      return
    }
    while (1) {
      let e = this.navigationHistory.goBack()
      dlog("editor/historyBack; this.navigationHistory.goBack() =>", e)
      if (!e) {
        break
      }
      if (this.historySwitchToScript(e.scriptGUID)) {
        break
      }
      // else "keep going back" until there's is back entry with a valid script
    }
  }

  historyForward() {
    if (!this.navigationHistory.canGoForward()) {
      return
    }
    while (1) {
      let e = this.navigationHistory.goForward()
      dlog("editor/historyForward; this.navigationHistory.goForward() =>", e)
      if (!e) {
        break
      }
      if (this.historySwitchToScript(e.scriptGUID)) {
        break
      }
      // else "keep going forward" until there's is back entry with a valid script
    }
  }

  historyPush() {
    let e = this.navigationHistory.currentEntry
    if (!e || e.scriptGUID != this._currentScript.guid) {
      e = { scriptGUID: this._currentScript.guid }
      dlog("editor/historyPush =>", e)
      this.navigationHistory.push(e)
    } else {
      dlog("editor/historyPush ignore (script already current)")
    }
  }


  async monacoOpenCodeEditor(
    input :OpenCodeEditorInput,
    editor :MonacoEditor,
  ) :Promise<MonacoEditor|null> {
    // This function is called by the Monaco EditorService when a user requests to switch
    // to a file, for example via "Jump to Definition".

    if (editor !== this.editor) {
      dlog("monacoOpenCodeEditor got unexpected editor object (!== this.editor)", editor)
      return null
    }
    //dlog("onOpenCodeEditor", input, editor)
    if (!input.resource) {
      return null
    }

    let model = monaco.editor.getModel(input.resource)
    if (!model) {
      return null
    }

    let script = model[kScript] as Script|undefined
    if (!script) {
      return null
    }

    this.setCurrentScriptFromUserAction(script)

    // this block lifted from monaco's StandaloneCodeEditorServiceImpl:
    let selection = (input.options && input.options.selection) || null
    if (selection) {
      // dlog("set selection in model", model.uri.toString())
      let setSelection = () => {
        if (typeof selection.endLineNumber === 'number' &&
            typeof selection.endColumn === 'number'
        ) {
          editor.setSelection(selection);
          editor.revealRangeInCenter(selection, monaco.editor.ScrollType.Immediate);
        } else {
          let pos = {
            lineNumber: selection.startLineNumber,
            column: selection.startColumn
          }
          editor.setPosition(pos);
          editor.revealPositionInCenter(pos, monaco.editor.ScrollType.Immediate)
        }
      }
      setSelection()
      // workaround for bug in monaco where if the position of a model has been set
      // recently without edits, then "Immediate" mode setPosition has no effect in same
      // runloop frame. Oh, web technology...
      setTimeout(setSelection, 1)
    }

    return editor
  }


  // --------------------------------------------------------------------------------------------
  // editor initialization


  async init() {
    this.initTypescript()  // intentionally not awaiting
    const initHistoryPromise = this.initHistory()

    // load past code buffer
    let script = await loadLastOpenedScript()
    let model = this.setCurrentScript(script)

    // add the script to history. Note that this has no effect if the current script
    // is already at the top of the history stack.
    initHistoryPromise.then(() => this.historyPush())

    // setup options from config
    this.updateOptionsFromConfig()

    // Monaco is created to be a stand-alone single editor, but really it is VSCode, a
    // full-featured multi-file editor. Patch the StaticServices.codeEditorService component of
    // monaco.
    // Note: With Monaco v0.20.0 there appears to be a bug in the meachnics underlying the
    // third argument "override" to editor.create. Internally (StaticServices.init) a Map is used
    // instead of an object with keys that are wrapped in functions with a toString method.
    // That implementation assumes the toString method is called implicitly by the map container,
    // but the new Map object keys on any object! This means that services can not be overridden.
    // Thus, we patch the prototype of the editor service instead of using service overrides.
    __scripterMonaco.patchEditorService(this.monacoOpenCodeEditor.bind(this))
    // This patch enables "Find All References"
    __scripterMonaco.patchEditorModelResolverService((editor, uri) => {
      return monaco.editor.getModel(uri)
    })
    // returns a label for a resource.
    // Shows up as a tool tip and small text next to the filename
    __scripterMonaco.patchUriLabelService((uri, options) => {
      let model = monaco.editor.getModel(uri)
      if (model) {
        let script = model[kScript] as Script|undefined
        if (script) {
          return script.name
        }
      }
      if (uri.scheme === 'file') {
        return uri.fsPath
      }
      return uri.path
    })
    // Show script names instead of their filenames
    __scripterMonaco.patchBasenameOrAuthority(uri => {
      if (uri && uri.path.indexOf("scripter.") != -1) {
        let model = monaco.editor.getModel(uri)
        let script = model[kScript] as Script|undefined
        if (script) {
          return script.name
        }
      }
    })

    // create editor
    this.editor = monaco.editor.create(document.getElementById('editor')!, {
      model,
      theme: 'scripter-light',
      ...this.options,
      readOnly: script.isROLib,
    })

    this.updateHiddenAreas()

    this.initEditorActions()

    // restore editor view state
    this.restoreViewState()

    // initialize model
    this.initEditorModel(model)

    // layout and focus
    const layoutAndFocus = () => {
      monaco.editor.remeasureFonts()
      this.editor.layout()
      this.editor.focus()
    }
    layoutAndFocus() // OH COME ON MONACO...
    setTimeout(layoutAndFocus, 100)
    setTimeout(layoutAndFocus, 500)

    // initialize event handlers
    this.initEditorEventHandlers()

    // load libs
    await scriptsData.libLoadPromise
    for (let s of scriptsData.referenceScripts) {
      this.getModel(s)
    }

    // // if we made a new script for the first time, save it immediately
    // if (this._currentScript.id == 0) {
    //   this._currentScript.save()
    // }

    // hook up config
    config.on("change", () => {
      this.updateOptionsFromConfig()
    })

    menu.menuUIMountPromise.then(() => {
      menu.scrollToActiveItem()
      requestAnimationFrame(() => { menu.scrollToActiveItem() })
    })

    // // DEBUG print compiled JS code
    // compileCurrentScript().then(r => print(r.outputFiles[0].text))

    // // DEBUG ts
    // ;(async () => {
    //   let model = this.editor.getModel()
    //   let tsworker = await monaco.languages.typescript.getTypeScriptWorker()
    //   let tsclient = await tsworker(model.uri)
    //   print("tsworker", tsworker)
    //   print("tsclient", tsclient)

    //   let uri = model.uri.toString()
    //   print("tsclient.getCompilerOptionsDiagnostics()",
    //     await tsclient.getCompilerOptionsDiagnostics(uri))

    //   print("tsclient.getSemanticDiagnostics()", await tsclient.getSemanticDiagnostics(uri))
    //   // print("tsclient.getCompilationSettings()", await tsclient.getCompilationSettings(uri))
    // })()

    this.isInitialized = true
    this.triggerEvent("init")
    this.triggerEvent("modelchange")

    this._editorPromiseResolve(this.editor)
    ;(this as any)._editorPromiseResolve = null
  } // init()


  updateHiddenAreas() {
    // Sad hack to work around isolating scripts.
    // Many many hours went into finding a better solution than this.
    // Ultimately this is the simples and most reliable approach. Monaco synchronizes
    // state with the TS worker, so simply patching the code in the TS worker would cause
    // the editor to go bananas.
    //
    // IMPORTANT: This function MUST NOT MODIFY THE MODEL CONTENTS.
    //            If it does, it would cause an infinite loop.
    //            If this is ever needed, change onDidChangeModelContent as appropriate.
    //
    if (DEBUG) {
      if (!(this.editor as any).setHiddenAreas) {
        console.error("MONACO issue: editor.setHiddenAreas not found!")
      }
    }
    let hiddenAreas :monaco.Range[] = []
    this._lineNumberOffset = 0
    if (!this._currentScript.isROLib) {
      let model = this._currentModel
      let lastLine = model.getLineCount()
      hiddenAreas = [
        // Range(startLineNumber, startColumn, endLineNumber, endColumn)
        new monaco.Range(1, 1, 1, 1),
        new monaco.Range(lastLine, 1, lastLine, 1),
      ]
      this._lineNumberOffset = 1
    }
    ;(this as any).hiddenAreas = hiddenAreas  // since readonly for outside
    ;(this.editor as any).setHiddenAreas(hiddenAreas)
    this.adjustSelection()
  }


  initEditorActions() {
    this.editor.addAction({
      id: 'scripter-run-script',
      label: 'Run Script',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      ],
      contextMenuGroupId: "navigation", // 1_modification
      contextMenuOrder: 0,
      run: editor => {
        this.runCurrentScript()
        return null
      }
    })

    // // var myCondition1 = this.editor.createContextKey('editorHasCompletionItemProvider', false)
    // // var myCondition2 = this.editor.createContextKey('editorReadonly', false)
    // // this.editor.createContextKey('textInputFocus', false)
    // this.editor.addCommand(monaco.KeyCode.Escape, (ctx :any) => {
    //   // services available in `ctx`
    //   console.log('my command is executing!', {ctx})
    //   // editor.getSupportedActions()
    // }, 'editorHasCompletionItemProvider && !editorReadonly && textInputFocus')

    // monaco.languages.registerCompletionItemProvider('typescript', {
    //   provideCompletionItems(model, position, context, token) {
    //     token.onCancellationRequested(e => {
    //       dlog("CANCEL")
    //     })
    //     dlog("SUGGEST", model)
    //     return new Promise(r => {})
    //   }
    // })

    // this.editor.addAction({
    //   id: "scripter-stop-script",
    //   label: "Stop Script",
    //   // precondition: "scripter-script-running", // TODO: figure out how this works
    //   keybindings: [
    //     // Note: There's a bug in monaco where the following causes cmd-X to stop working:
    //     // monaco.KeyMod.CtrlCmd | monaco.KeyCode.Shift | monaco.KeyCode.KEY_X,
    //   ],
    //   contextMenuGroupId: "navigation",
    //   contextMenuOrder: 0,
    //   run: editor => {
    //     this.stopCurrentScript()
    //     return null
    //   }
    // })
  }


  adjustSelection() {
    const hiddenAreas = this.hiddenAreas
    if (hiddenAreas.length == 0 || !this.editor) {
      return
    }
    // Note: This assumes hiddenAreas.length == 2

    let sels = this.editor.getSelections() // Selection[] | null;
    if (!sels || sels.length == 0) {
      return
    }

    let [header, footer] = hiddenAreas
    let changed = false
    for (let i = 0; i < sels.length; i++) {
      let sel = sels[i]

      if (sel.startLineNumber <= header.endLineNumber) {
        // inside header
        sels[i] = sel = sel.setStartPosition(header.endLineNumber + 1, 1)
        changed = true
      }

      if (sel.endLineNumber >= footer.startLineNumber) {
        // inside footer
        sels[i] = sel = sel.setEndPosition(footer.startLineNumber - 1, 1)
        changed = true
      }
    }

    if (changed) {
      dlog("patch selection to leave out header and footer", sels)
      this.editor.setSelections(sels)
    }

    hiddenAreas[0].containsRange({} as any as monaco.IRange)
  }


  initEditorEventHandlers() {
    const editor = this.editor

    let isRestoringViewState = false
    let isRestoringModel = false

    editor.onDidChangeModelContent((e: monaco.editor.IModelContentChangedEvent) :void => {
      // Note: getAlternativeVersionId is a version number that tracks undo/redo.
      // i.e. version=1; edit -> version=2; undo -> version=1.
      if (!isRestoringModel && !this._isSwitchingModel) {
        const script = this._currentScript
        if (script.isUserScript) {
          script.updateBody(
            this._currentModel.getValue(),
            this._currentModel.getAlternativeVersionId()
          )
        } else {
          // create a new script that is a duplicate
          let s2 = script.duplicate({
            name: "Copy of " + script.name
          })

          // apply the edit to the new user script copy, but use the "no dirty" variant of
          // the updateBody function. This has the effect that a new _unsaved_ script is added
          // containing the edits that triggered this code here to run.
          s2.updateBodyNoDirty(
            this._currentModel.getValue(),
            this._currentModel.getAlternativeVersionId()
          )

          // undo the edit in the example script model
          isRestoringModel = true
          editor.trigger('', 'undo', {})
          isRestoringModel = false

          // set the new duplicate script
          this.setCurrentScriptFromUserAction(s2)
        }
      }
      if (e.isFlush) {
        this.updateHiddenAreas()
      }
    })

    editor.onDidChangeCursorSelection((e: monaco.editor.ICursorSelectionChangedEvent) :void => {
      // possibly correct for hiddenAreas
      this.adjustSelection()
      if (!isRestoringViewState && !isRestoringModel) {
        this.setNeedsSaveViewState()
      }
    })

    editor.onDidChangeModel((e: monaco.editor.IModelChangedEvent) :void => {
      if (e.newModelUrl) {
        this.triggerEvent("modelchange")
      }
      // this.stopObservingChanges()
    })

    // some key presses causes the toolbar to fade out (only when menu is closed)
    const ignoreKeyPresses = {
      [monaco.KeyCode.Alt]:1,
      [monaco.KeyCode.Shift]:1,
      [monaco.KeyCode.Ctrl]:1,
      [monaco.KeyCode.Meta]:1,
      [monaco.KeyCode.ContextMenu]:1,
    }
    editor.onKeyDown((e: monaco.IKeyboardEvent) => {
      // fade out toolbar
      if (!(e.keyCode in ignoreKeyPresses)) {
        toolbar.fadeOut()
      }
    })

    // setTimeout(() => {
    // dlog("editor.getSupportedActions():", editor.getSupportedActions())
    // },1000)

    // shift-cmd-P / shift-ctrl-P for quick command in addition to F1
    editor.addCommand(
        monaco.KeyMod.CtrlCmd
      | monaco.KeyMod.Shift
      | monaco.KeyCode.KEY_P,
      (ctx :any) => { editor.trigger('', 'editor.action.quickCommand', {}) }
    )

    editor.addCommand(
      monaco.KeyCode.F12,
      (ctx :any) => { editor.trigger('', 'editor.action.revealDefinition', {}) }
    )

    // handle changes to the database that were made by another tab
    db.on("remotechange", async ev => {
      if (ev.type == "update") {
        if (ev.store == "scriptViewState" && ev.key == this._currentScript.id) {
          // view state of currently-open script changed in another tab
          let viewState = await this._currentScript.reloadEditorViewState()
          isRestoringViewState = true
          editor.restoreViewState(viewState)
          isRestoringViewState = false
        } else if (ev.store == "scriptBody" && ev.key == this._currentScript.id) {
          // script data of currently-open script changed
          await this._currentScript.load()
          isRestoringModel = true
          isRestoringViewState = true
          this._currentModel.setValue(this._currentScript.body)
          editor.restoreViewState(this._currentScript.editorViewState)
          isRestoringModel = false
          isRestoringViewState = false
        } else if (ev.store == "scripts") {
          // script index changed. e.g. a script was added or removed
          scriptsData.refresh()
        }
      }
    })

    window.addEventListener("resize", () => {
      this.editor.layout()
      setTimeout(() => this.editor.layout(), 100)
    })
  }


  async initTypescript() {
    let ts = monaco.languages.typescript.typescriptDefaults
    ts.setMaximumWorkerIdleTime(1000 * 60 * 60 * 24) // kill worker after 1 day
    ts.setCompilerOptions(typescriptCompilerOptions)
    // ts.setDiagnosticsOptions({noSemanticValidation:true})
    ts.setEagerModelSync(true)
    // ts.onDidChange(e => {
    //   dlog("ts onDidChange", e)
    // })
  }


  initEditorModel(model :EditorModel) {
    // filter out some errors
    let lastSeenMarkers :monaco.editor.IMarker[] = []
    let onDidChangeDecorationsCallbackRunning = false

    model.onWillDispose(() => {
      model.onDidChangeDecorations(() => {})
      model.onWillDispose(() => {})
      editor.invalidateDiagnostics(model)
    })

    model.onDidChangeDecorations(async ev => {
      if (onDidChangeDecorationsCallbackRunning) {
        // print("onDidChangeDecorations: onDidChangeDecorationsCallbackRunning -- ignore")
        return
      }
      onDidChangeDecorationsCallbackRunning = true
      try {

      // print("model.onDidChangeDecorations", ev)
      // let decs = model.getAllDecorations(0/* 0 = owner id of primary editor */)
      // if (decs.length == 0) {
      //   return
      // }
      // print("decs", decs)

      // check if markers have changed
      let markers = monaco.editor.getModelMarkers({ owner: "typescript" })
      if (markers.length == 0 || markers === lastSeenMarkers) {
        return
      }
      if (markers.length == lastSeenMarkers.length) {
        let diff = false
        for (let i = 0; i < markers.length; i++) {
          if (markers[i] !== lastSeenMarkers[i]) {
            diff = true
            break
          }
        }
        if (!diff) {
          // print("no change to markers")
          return
        }
      }
      lastSeenMarkers = markers

      // okay, markers did change.
      // filter out certain diagnostics

      const filterRe = /['"]?return['"]? statement can only be used within a function body/i

      let initialLen = markers.length
      let semdiag :any[]|null = null
      let origIndex = 0
      for (let i = 0; i < markers.length; origIndex++) {
        let m = markers[i]
        if (filterRe.test(m.message)) {
          markers.splice(i, 1)
          continue
        }

        // await at top level is tricky to identify as the same TS code is used for both
        // top-level and function-level, the latter which is a valid error in Scripter.
        if (m.message.indexOf("'await'") != -1) {
          if (semdiag === null) {
            // request diagnostics from TypeScript
            semdiag = await editor.getSemanticDiagnostics(model)
          }
          // here, we rely on the fact that markers in Monaco are ordered the same as
          // semantic diagnostics in TypeScript, which _might_ not be true.
          let diag :any
          for (let d of semdiag) {
            if (d.messageText == m.message) {
              diag = d
              break
            }
          }
          if (diag && diag.code == 1308 && !diag.relatedInformation) {
            // TS1308 is "'await' expression is only allowed within an async function."
            // when this is at the top-level, there's no related information.
            markers.splice(i, 1)
            continue
          }
        } else if (m.message.indexOf("'for-await-of'") != -1) {
          // top-level for-await-of e.g. "for await (let r of asyncIterable()) { ... }"
          markers.splice(i, 1)
          continue
        }

        // keep
        i++
      }
      // print("markers", markers, initialLen != markers.length)
      if (initialLen != markers.length) {
        monaco.editor.setModelMarkers(model, "typescript", markers)
      }

      // TODO: consider enriching the hover thingy.
      // The following _adds_ information to a hover card.
      // monaco.languages.registerHoverProvider('typescript', {
      //   provideHover: function (model, position) {
      //     // note: can return a promise
      //     // return null
      //     dlog("position", position)
      //     return {
      //       range: new monaco.Range(
      //         position.lineNumber, position.column,
      //         position.lineNumber, position.column + 999,
      //         // 1, 1,
      //         // model.getLineCount(), model.getLineMaxColumn(model.getLineCount())
      //       ),
      //       contents: [
      //         { value: '**SOURCE**' },
      //         { value: '```html\nHELLO <WORLD>\n```' }
      //       ]
      //     }
      //   }
      // })

      } finally {
        onDidChangeDecorationsCallbackRunning = false
      }
    }) // onDidChangeDecorations
  } // initEditorModel()

}

export const editor = new EditorState()



async function loadLastOpenedScript() :Promise<Script> {
  let script :Script|null = null

  let guid = config.lastOpenScriptGUID
  try {
    if (guid != "") {
      script = await scriptsData.getScriptByGUID(guid)
    } else if (config.lastOpenScript != 0) {
      // try legacy numeric id
      script = await scriptsData.getScript(config.lastOpenScript)
    }
  } catch (err) {
    console.error(`failed to reopen last open script:`, err.stack)
  }

  if (!script) {
    if (scriptsData.scripts.length) {
      let id = 0
      for (let s of scriptsData.scripts) {
        if (s.id != 0) {
          id = s.id
          break
        }
      }
      if (id != 0) {
        script = await scriptsData.getScript(id)
      }
    }
  }
  if (!script) {
    script = scriptsData.defaultSampleScript
    // script = Script.createDefault()
  }
  return script
}


// prevents model from being disposed. Must be balanced with a later call to unlockModel().
function lockModel(m :EditorModel) {
  // dlog(`lockModel ${m.id}`)
  // ;(m as any)[kLocked] = true
  // ;(m as any)[kOnUnlock] = []
}

// function awaitUnlockedModel(m :EditorModel) :Promise<void> {
//   return new Promise(resolve => {
//     if (!(m as any)[kLocked]) {
//       resolve()
//     } else {
//       (m as any)[kOnUnlock].push(resolve)
//     }
//   })
// }

// allows model to be disposed.
function unlockModel(m :EditorModel) {
  // dlog(`unlockModel ${m.id}`)
  // if ((m as any)[kLocked]) {
  //   for (let f of (m as any)[kOnUnlock]) {
  //     try { f() } catch(err) { console.error(err.stack||String(err)) }
  //   }
  //   delete (m as any)[kLocked]
  //   delete (m as any)[kOnUnlock]
  // }
}

