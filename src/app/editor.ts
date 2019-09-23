import * as monaco from "monaco-editor"
import "./editor-themes"  // for side-effects
import resources from "./resources"
import { Script, ScriptMeta } from "./script"
import { EventEmitter } from "./event"
import { db } from "./data"
import { config } from "./config"
import { scriptsData } from "./script-data"
import { MsgZones } from "./editor-msg-zones"
import * as Eval from "./eval"
import * as warningMessage from "./warning-message"
import * as runqueue from "./runqueue"
import toolbar from "./toolbar"
import { print, dlog } from "./util"


type EditorModel = monaco.editor.ITextModel
type EditorOptions = monaco.editor.IEditorOptions


const kLocked = Symbol("Locked")
const kOnUnlock = Symbol("OnUnlock")


const defaultFontSize = 11

// default monaco editor options
const defaultOptions :EditorOptions = {
  automaticLayout: true,
  scrollBeyondLastLine: false,
  lineDecorationsWidth: 16, // margin on left side, in pixels

  lineNumbers: "on", // lineNumbers: (lineNumber: number) => "•",
  lineNumbersMinChars: 3,
  wordWrap: "on",
  wrappingIndent: "same", // none | same | indent | deepIndent

  // fontLigatures: true,
  showUnused: true,
  folding: false,
  cursorBlinking: "smooth", // solid | blink | smooth | phase
  multiCursorModifier: "ctrlCmd", // cmd or ctrl + mouse click to add Nth cursor
  renderLineHighlight: "none",
  fontSize: defaultFontSize,

  fontFamily: "iaw-quattro-var, iaw-quattro, 'Roboto Mono', 'IBM Plex Mono', monospace",
  disableMonospaceOptimizations: true, // required for non-monospace fonts

  // fontFamily: "iaw-mono-var, iaw-mono, monospace",

  extraEditorClassName: 'scripter-light',

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


type DecoratedTextChangedCallback = (d :monaco.editor.IModelDecoration) => void


interface EditorStateEvents {
  "init": undefined
  "modelchange": undefined
}


export class EditorState extends EventEmitter<EditorStateEvents> {
  readonly defaultFontSize = defaultFontSize

  editor :monaco.editor.IStandaloneCodeEditor
  options :EditorOptions = {...defaultOptions}

  msgZones = new MsgZones(this)

  _currentModel    :EditorModel
  _currentScript   :Script
  _currentScriptId :number|null = -1
  _nextModelId = 0
  _saveViewStateTimer :any = null

  editorDecorationIds = []
  decorationCallbacks = new Map<string,DecoratedTextChangedCallback>()

  changeObservationEnabled = false
  changeObservationActive = false
  changeObservationLastLineCount = 0


  // ----------------------------------------------------------------------------------
  // Managing scripts

  get currentModel() :EditorModel { return this._currentModel }
  get currentScript() :Script { return this._currentScript }
  get currentScriptId() :number { return this._currentScript ? this._currentScript.id : -1 }

  setCurrentScript(script :Script) :EditorModel {
    if (this._currentScript === script) {
      return this._currentModel
    }
    if (this._currentScript) {
      this._currentScript.removeListener("save", this.onCurrentScriptSave)
    }
    this._currentScript = script
    this._currentScriptId = script.id
    this._currentScript.on("save", this.onCurrentScriptSave)

    if (this._currentModel) {
      let oldModel = this._currentModel
      this.invalidateDiagnostics(oldModel)
      setTimeout(() => diposeModel(oldModel), 0)
    }

    let modelId = this._nextModelId++
    this._currentModel = monaco.editor.createModel(
      script.body,
      "typescript",
      monaco.Uri.from({scheme:"scripter", path:`${modelId}.ts`})
    )
    this._currentModel.updateOptions({
      tabSize: 2,
      indentSize: 2,
      insertSpaces: true,
      trimAutoWhitespace: true,
    })

    return this._currentModel
  }


  onCurrentScriptSave = (_ :Script) => {
    this._currentScriptId = this._currentScript.id  // may have been assigned one
    config.lastOpenScript = this._currentScript.id
    // menu.updateScriptList()
  }


  switchToScript(script :Script) {
    this.stopCurrentScript()
    let model = this.setCurrentScript(script)
    // this.editor.setModel(null)
    this.clearAllMetaInfo()
    this.editor.setModel(model)
    this.updateOptions({
      readOnly: script.readOnly,
    })
    this.restoreViewState()
    initEditorModel(model)
    this.editor.focus()
    config.lastOpenScript = this._currentScript.id
  }


  newScript(meta? :Partial<ScriptMeta>, body :string = "") :Script {
    let script = Script.create(meta, body)
    this.switchToScript(script)
    return script
  }


  async openScript(id :number) {
    if (this._currentScript.id == id || this._currentScriptId == id) {
      this.editor.focus()
      return
    }
    dlog(`open script ${id}`)
    this._currentScriptId = id
    this.stopCurrentScript()
    let script = await scriptsData.getScript(id)
    if (!script) {
      console.error(`openScript(${id}) failed (not found)`)
      return
    }
    if (this._currentScriptId != id) {
      // another openScript call was made -- discard
      return
    }
    this.switchToScript(script)
  }


  // ----------------------------------------------------------------------------------
  // Editor configuration

  restoreViewState() {
    let viewState = this._currentScript.editorViewState
    if (viewState) {
      this.editor.restoreViewState(viewState)
      // workaround for a bug: Restoring the view state on the next frame works around
      // a bug with variable-width fonts.
      setTimeout(() => { this.editor.restoreViewState(viewState) }, 0)
    }
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

  updateOptionsFromConfig() {
    this.updateOptions({
      lineNumbers: config.showLineNumbers ? "on" : "off",
      wordWrap: config.wordWrap ? "on" : "off",
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

  clearAllMetaInfo() {
    this.clearAllDecorations()
    this.msgZones.clearAll()
  }


  // ----------------------------------------------------------------------------------
  // Running scripts

  runDebounceTimer :any = null
  currentEvalPromise :Eval.EvalPromise|null = null  // non-null while script is running


  async runCurrentScript() :Promise<void> {
    if (this.runDebounceTimer !== null) { return }
    this.runDebounceTimer = setTimeout(()=>{ this.runDebounceTimer = null }, 100)

    if (this._currentScript.readOnly) {
      return
    }

    // stop any currently-running script
    this.stopCurrentScript()

    warningMessage.hide()
    this.clearAllMetaInfo()

    let stopCallback = () => {
      if (this.currentEvalPromise) {
        this.currentEvalPromise.cancel()
      }
    }
    toolbar.addStopCallback(stopCallback)

    let runqItem = runqueue.push()

    let prog = await this.compileCurrentScript()

    if (prog.code.length > 0) {
      try {
        this.currentEvalPromise = Eval.run(prog.code, prog.sourceMap)
        // setTimeout(() => { p.cancel() }, 500)  // XXX DEBUG
        await this.currentEvalPromise
        runqItem.clearWithStatus("ok")
      } catch (err) {
        runqItem.clearWithStatus("error")
      }
      this.currentEvalPromise = null
    }

    toolbar.removeStopCallback(stopCallback)

    clearTimeout(this.runDebounceTimer)
    this.runDebounceTimer = null

    this.editor.focus()
  }


  stopCurrentScript() {
    if (this.currentEvalPromise) {
      this.currentEvalPromise.cancel()
    }
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
      let tsworker = await monaco.languages.typescript.getTypeScriptWorker()
      let tsclient = await tsworker(model.uri)
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


  clearAllDecorations() {
    this.decorationCallbacks.clear()
    this.editor.deltaDecorations(this.editorDecorationIds, [])
    this.editorDecorationIds = []
  }

  removeDecorations(ids :string[]) {
    let idset = new Set(ids)
    this.editorDecorationIds = this.editorDecorationIds.filter(id => !idset.has(id))
    for (let id of ids) {
      this.decorationCallbacks.delete(id)
    }
    this.editor.deltaDecorations(ids, [])
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

  stopObservingChanges() {
    this.changeObservationActive = false
    this.changeObservationLastLineCount = 0
  }

  startObservingChanges() {
    if (!this.changeObservationActive) {
      this.changeObservationActive = true
      this.changeObservationLastLineCount = this.currentModel.getLineCount()
    }

    if (this.changeObservationEnabled) {
      return
    }
    this.changeObservationEnabled = true
    this.editor.onDidChangeModelContent((e: monaco.editor.IModelContentChangedEvent) => {
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
      let endLine = 0
      for (let c of e.changes) {
        startLine = Math.min(startLine, c.range.startLineNumber)
        endLine = Math.max(endLine, c.range.endLineNumber)
      }

      // update zones
      this.msgZones.updateAfterEdit(startLine, endLine, lineCount, lineDelta)

      // update decorations
      for (let c of e.changes) {
        // expand change range to whole line
        let range = {
          startLineNumber: c.range.startLineNumber,
          startColumn: 0,
          endLineNumber: c.range.endLineNumber,
          endColumn: 999,
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
  // editor initialization

  async init() {
    this.initTypescript()  // intentionally not awaiting

    // load previously-stored font size
    if (config.fontSize) {
      this.options.fontSize = config.fontSize
      document.body.style.fontSize = `${config.fontSize}px`
    }

    // load past code buffer
    let script = await loadLastOpenedScript()
    let model = this.setCurrentScript(script)

    // setup options from config
    this.updateOptionsFromConfig()

    // create editor
    this.editor = monaco.editor.create(document.getElementById('editor')!, {
      model,
      theme: 'scripter-light',
      ...this.options,
      readOnly: script.readOnly,
    })

    this.initEditorActions()

    // restore editor view state
    this.restoreViewState()

    // initialize model
    initEditorModel(model)

    // assign focus to editor
    this.editor.focus()

    // initialize event handlers
    this.initEditorEventHandlers()

    // // if we made a new script for the first time, save it immediately
    // if (this._currentScript.id == 0) {
    //   this._currentScript.save()
    // }

    // hook up config
    config.on("change", () => {
      this.updateOptionsFromConfig()
    })

    // monaco.languages.registerCodeActionProvider("typescript", {
    //   provideCodeActions( model: monaco.editor.ITextModel,
    //     range: monaco.Range,
    //     context: monaco.languages.CodeActionContext,
    //     token: monaco.CancellationToken,
    //   ): ( monaco.languages.Command | monaco.languages.CodeAction)[]
    //      | Promise<(monaco.languages.Command | monaco.languages.CodeAction)[]>
    //   {
    //     print("hola!", context, range)
    //     return []
    //   }
    // })

    // // DEBUG print compiled JS code
    // compileCurrentScript().then(r => print(r.outputFiles[0].text))

    // ;(async () => {
    //   let model = editor.getModel()
    //   let tsworker = await monaco.languages.typescript.getTypeScriptWorker()
    //   let tsclient = await tsworker(model.uri)
    //   print("tsworker", tsworker)
    //   print("tsclient", tsclient)
    //   print("tsclient.getCompilerOptionsDiagnostics()", await tsclient.getCompilerOptionsDiagnostics())
    //   print("tsclient.getSemanticDiagnostics()", await tsclient.getSemanticDiagnostics())
    //   print("tsclient.getCompilationSettings()", await tsclient.getCompilationSettings())
    // })()

    this.triggerEvent("init")
    this.triggerEvent("modelchange")
  } // init()


  initEditorActions() {
    this.editor.addAction({
      id: 'scripter-run-script',
      label: 'Run Script',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        // monaco.KeyMod.chord(
        //   monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K,
        //   monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_M,
        // )
      ],
      contextMenuGroupId: "navigation", // 1_modification
      contextMenuOrder: 0,
      run: editor => {
        this.runCurrentScript()
        return null
      }
    })

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


  initEditorEventHandlers() {
    const editor = this.editor

    let isRestoringViewState = false
    let isRestoringModel = false

    editor.onDidChangeModelContent((e: monaco.editor.IModelContentChangedEvent) :void => {
      // getAlternativeVersionId is a version number that tracks undo/redo.
      // i.e. version=1; edit -> version=2; undo -> version=1.
      if (!isRestoringModel) {
        this._currentScript.updateBody(
          this._currentModel.getValue(),
          this._currentModel.getAlternativeVersionId()
        )
      }
    })

    editor.onDidChangeCursorPosition((e: monaco.editor.ICursorPositionChangedEvent) :void => {
      if (!isRestoringViewState && !isRestoringModel) {
        this.setNeedsSaveViewState()
      }
    })

    editor.onDidChangeCursorSelection((e: monaco.editor.ICursorSelectionChangedEvent) :void => {
      if (!isRestoringViewState && !isRestoringModel) {
        this.setNeedsSaveViewState()
      }
    })

    editor.onDidChangeModel((e: monaco.editor.IModelChangedEvent) :void => {
      this.triggerEvent("modelchange")
      this.stopObservingChanges()
    })

    // editor.addCommand(monaco.KeyCode.Enter | monaco.KeyCode.Ctrl, (ctx :any) => {
    //   print("handler called with ctx:", ctx)
    // })

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
          dlog(`TODO: update scriptData in db.on("remotechange"`)
          // menu.updateScriptList()
        }
      }
    })
  }


  async initTypescript() {
    let tsconfig = monaco.languages.typescript.typescriptDefaults
    tsconfig.setMaximumWorkerIdleTime(1000 * 60 * 60 * 24) // kill worker after 1 day
    tsconfig.setCompilerOptions({
      // Note: When we set compiler options, we _override_ the default ones.
      // This is why we need to set allowNonTsExtensions.
      allowNonTsExtensions: true, // make "in-memory source" work
      target: 6,
      allowUnreachableCode: true,
      allowUnusedLabels: true,
      removeComments: true,
      module: 1, // ts.ModuleKind.CommonJS
      // lib: [ "esnext", "dom" ],
      sourceMap: true, // note: inlineSourceMap must not be true (we rely on this in eval)

      // Note on source maps: Since we use eval, and eval in chrome does not interpret sourcemaps,
      // we disable sourcemaps for now (since it's pointless).
      // However, we could use the sourcemap lib to decorate error stack traces a la
      // evanw's sourcemap-support. The plugin could do this, so that the stack trace in Figma's
      // console is updated as well as what we display in the Scripter UI. Upon error, the plugin
      // process could request sourcemap from Scripter, so that we only have to transmit it on error.
      // inlineSourceMap: true,
    })
    tsconfig.addExtraLib(await resources["figma.d.ts"], "scripter:figma.d.ts")
    tsconfig.addExtraLib(await resources["scripter-env.d.ts"], "scripter:scripter-env.d.ts")
    // tsconfig.setDiagnosticsOptions({noSemanticValidation:true})
  }

}

export const editor = new EditorState()


export function initEditorModel(model :EditorModel) {
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
      }

      // keep
      i++
    }
    // print("markers", markers, initialLen != markers.length)
    if (initialLen != markers.length) {
      monaco.editor.setModelMarkers(model, "typescript", markers)
    }

    } finally {
      onDidChangeDecorationsCallbackRunning = false
    }
  })
}



async function loadLastOpenedScript() :Promise<Script> {
  let script :Script|null = null
  if (config.lastOpenScript != 0) {
    try {
      script = await scriptsData.getScript(config.lastOpenScript)
    } catch (err) {
      console.error(`failed to reopen last open script:`, err.stack)
    }
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
    script = scriptsData.exampleScripts[0]
    // script = Script.createDefault()
  }
  return script
}


// prevents model from being disposed. Must be balanced with a later call to unlockModel().
function lockModel(m :EditorModel) {
  ;(m as any)[kLocked] = true
}

// allows model to be disposed.
function unlockModel(m :EditorModel) {
  delete (m as any)[kLocked]
  if (kOnUnlock in m) {
    let f = (m as any)[kOnUnlock]
    delete (m as any)[kOnUnlock]
    f()
  }
}

function diposeModel(m :EditorModel) {
  if (kOnUnlock in m) {
    let f = (m as any)[kOnUnlock]
    ;(m as any)[kOnUnlock] = () => { f(); m.dispose() }
  } else {
    m.dispose()
  }
}
