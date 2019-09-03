import "./app.css"
import { EvalResponseMsg, PrintMsg } from "../common/messages"
import resources from "./resources"
import * as monaco from "monaco-editor"
// import * as monaco from "./monaco-ambient"
import { api as defaultPluginApiVersion } from "../figma-plugin/manifest.json"
import { SourceMapConsumer, SourceMapGenerator } from "../misc/source-map"
import { db, initData } from "./data"
import { config } from "./config"
import { Script } from "./script"

const isMac = navigator.platform.indexOf("Mac")
const print = console.log.bind(console)
const storageKeyBuffer0 = "figsketch.buffer0"
const storageKeyViewState = "figsketch.viewstate"

// defined globally in webpack config
declare const SOURCE_MAP_VERSION :string

let pluginApiVersion :string = defaultPluginApiVersion
let editor :monaco.editor.IStandaloneCodeEditor
let defaultFontSize = 11
let edOptions :monaco.editor.IEditorOptions = {
  automaticLayout: true,
  lineNumbers: "off", // lineNumbers: (lineNumber: number) => "•",
  lineNumbersMinChars: 3,
  scrollBeyondLastLine: false,
  lineDecorationsWidth: 16, // margin on left side, in pixels
  // wordWrap: "on",
  // wrappingIndent: "indent",
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

  scrollbar: {
    useShadows: false,
    verticalScrollbarSize: 9,
    verticalSliderSize: 1,
    horizontalScrollbarSize: 9,
    horizontalSliderSize: 3,
  },
  minimap: {
    enabled: false,
  },
}


let currentScript :Script
let currentModel  :monaco.editor.ITextModel


async function loadLastOpenedScript() :Promise<Script> {
  if (config.lastOpenScript > 0) {
    try {
      return await Script.load(config.lastOpenScript)
    } catch (err) {
      console.error(`failed to reopen last open script:`, err.stack)
    }
  }
  return Script.createDefault()
}


function onCurrentScriptSave() {
  config.lastOpenScript = currentScript.id
  menu.updateScriptList()
}


let nextModelId = 0


function setCurrentScript(script :Script) :monaco.editor.ITextModel {
  if (currentScript === script) {
    return currentModel
  }
  if (currentScript) {
    currentScript.removeListener("save", onCurrentScriptSave)
  }
  currentScript = script
  currentScript.on("save", onCurrentScriptSave)

  if (currentModel) {
    let oldModel = currentModel
    setTimeout(() => { oldModel.dispose() }, 0)
  }

  currentModel = monaco.editor.createModel(
    script.body,
    "typescript",
    monaco.Uri.from({scheme:"scripter", path:`${nextModelId++}.ts`})
  )

  return currentModel
}


function restoreViewState() {
  if (currentScript.editorViewState) {
    // workaround for a bug: Restoring the view state on the next frame works around
    // a bug with variable-width fonts.
    setTimeout(() => {
      editor.restoreViewState(currentScript.editorViewState)
    }, 0)
  }
}


function switchToScript(script :Script) {
  let model = setCurrentScript(script)
  editor.setModel(model)
  initModel(model)
  editor.focus()
  config.lastOpenScript = currentScript.id
  restoreViewState()
}


function newScript() :Script {
  let script = Script.createEmpty()
  switchToScript(script)
  return script
}


async function openScript(id :number) {
  let script = await Script.load(id)
  if (!script) {
    console.error(`openScript(${id}) failed (not found)`)
    return
  }
  switchToScript(script)
}


function initModel(model :monaco.editor.ITextModel) {
  // filter out some errors
  let lastSeenMarkers :monaco.editor.IMarker[] = []
  let onDidChangeDecorationsCallbackRunning = false

  model.onWillDispose(() => {
    model.onDidChangeDecorations(() => {})
    model.onWillDispose(() => {})
  })

  model.onDidChangeDecorations(async ev => {
    if (onDidChangeDecorationsCallbackRunning) {
      // print("onDidChangeDecorationsCallbackRunning -- ignore")
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
          semdiag = await getSemanticDiagnostics()
        }
        // print("marker", m)
        // print("semdiag", semdiag)
        // here, we rely on the fact that markers in Monaco are ordered the same as
        // semantic diagnostics in TypeScript, which _might_ not be true.
        let d = semdiag[origIndex]
        if (d && d.code == 1308 && !d.relatedInformation) {
          // TS1308 is "'await' expression is only allowed within an async function."
          // when this is at the top-level, there's no related information.
          markers.splice(i, 1)
          continue
        }
      }

      // keep
      i++
    }
    // print("markers", markers)
    if (initialLen != markers.length) {
      monaco.editor.setModelMarkers(model, "typescript", markers)
    }

    } finally {
      onDidChangeDecorationsCallbackRunning = false
    }
  })
}


async function setupEditor() {
  // define editor themes
  defineEditorThemes()

  // load previously-stored view state
  if (config.fontSize) {
    edOptions.fontSize = config.fontSize
    document.body.style.fontSize = `${config.fontSize}px`
  }

  // configure typescript
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

  // load past code buffer
  let script = await loadLastOpenedScript()
  let model = setCurrentScript(script)

  // create editor
  editor = monaco.editor.create(document.getElementById('editor')!, {
    model,
    theme: 'scripter-light',
    ...edOptions,
    extraEditorClassName: 'scripter-light',
  })

  // restore editor view state
  restoreViewState()

  // assign focus
  editor.focus()

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

  initModel(model)

  // // DEBUG print compiled JS code
  // compileCurrentProgram().then(r => print(r.outputFiles[0].text))

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

  let isRestoringViewState = false
  let isRestoringModel = false

  editor.onDidChangeModelContent((e: monaco.editor.IModelContentChangedEvent) :void => {
    // getAlternativeVersionId is a version number that tracks undo/redo.
    // i.e. version=1; edit -> version=2; undo -> version=1.
    if (!isRestoringModel) {
      currentScript.updateBody(currentModel.getValue(), currentModel.getAlternativeVersionId())
    }
    invalidateSemanticDiagnostics()
  })

  editor.onDidChangeCursorPosition((e: monaco.editor.ICursorPositionChangedEvent) :void => {
    if (!isRestoringViewState && !isRestoringModel) {
      setNeedsSaveViewState()
    }
  })

  editor.onDidChangeCursorSelection((e: monaco.editor.ICursorSelectionChangedEvent) :void => {
    if (!isRestoringViewState && !isRestoringModel) {
      setNeedsSaveViewState()
    }
  })

  editor.onDidChangeModel((e: monaco.editor.IModelChangedEvent) :void => {
    menu.updateScriptList()
  })

  // editor.addCommand(monaco.KeyCode.Enter | monaco.KeyCode.Ctrl, (ctx :any) => {
  //   print("handler called with ctx:", ctx)
  // })

  // handle changes to the database that were made by another tab
  db.on("remotechange", async ev => {
    if (ev.type == "update") {
      if (ev.store == "scriptViewState" && ev.key == currentScript.id) {
        // view state of currently-open script changed in another tab
        let viewState = await currentScript.reloadEditorViewState()
        isRestoringViewState = true
        editor.restoreViewState(viewState)
        isRestoringViewState = false
      } else if (ev.store == "scriptBody" && ev.key == currentScript.id) {
        // script data of currently-open script changed
        await currentScript.load()
        isRestoringModel = true
        isRestoringViewState = true
        currentModel.setValue(currentScript.body)
        editor.restoreViewState(currentScript.editorViewState)
        isRestoringModel = false
        isRestoringViewState = false
      } else if (ev.store == "scripts") {
        menu.updateScriptList()
      }
    }
  })

  if (currentScript.id <= 0) {
    currentScript.save()
  }
}


function defineEditorThemes() {
  // see:
  // microsoft.github.io/monaco-editor/playground.html#customizing-the-appearence-exposed-colors

  monaco.editor.defineTheme('scripter-light', {
    base: 'vs',
    inherit: true,
    // rules: [],
    rules: [
      { token: "comment", foreground: "#aaaaaa" }, // fontStyle: "italic"
      { token: "keyword", foreground: "#010101" }, // weight defined in css
      { token: "identifier", foreground: "#111111" },
      { token: "type.identifier", foreground: "#DB2386" }, // #003388 #323EAB #6f42c1
      { token: "number", foreground: "#005cc5" }, // #660099 #003388
      { token: "string", foreground: "#032f62" }, // #032f62 #116622
      { token: "delimiter", foreground: "#555555" }, // #554433
      // { token: "delimiter.bracket", foreground: "#333333" },
    ],
    colors: {
      'editor.foreground': '#222222',
      'editor.background': '#ffffff',  // #fefefa
      'editorCursor.foreground': '#004499',
      'editorLineNumber.foreground': '#eeeeee',
      // 'editor.lineHighlightBackground': '#0000FF20',
      // 'editorLineNumber.foreground': '#008800',
      // 'editor.inactiveSelectionBackground': '#88000015'

      'editorIndentGuide.background': "#eeeeee",

      'widget.shadow': '#00000011', // Shadow color of widgets such as find/replace inside the editor.
      'editorWidget.background': "#fffadd", // Background color of editor widgets, such as find/replace.
      'editorWidget.border': "#fffadd", // Border color of editor widgets. The color is only used if the widget chooses to have a border and if the color is not overridden by a widget.

      'editorBracketMatch.background': "#ccffdf", // #fffd66 Background color behind matching brackets
      'editorBracketMatch.border': "#00000000", // Color for matching brackets boxes

      'editorError.foreground': "#ff4499", // Foreground color of error squigglies in the editor.
      // 'editorError.border': "#000000", // Border color of error squigglies in the editor.
      // 'editorWarning.foreground': "#ff0000", // Foreground color of warning squigglies in the editor.
      // 'editorWarning.border' // Border color of warning squigglies in the editor.

      // 'editor.selectionBackground' // Color of the editor selection.
      // 'editor.selectionForeground' // Color of the selected text for high contrast.
      // 'editor.inactiveSelectionBackground' // Color of the selection in an inactive editor.
      // 'editor.selectionHighlightBackground' // Color for regions with the same content as the selection.
      // 'editor.findMatchBackground' // Color of the current search match.
      // 'editor.findMatchHighlightBackground' // Color of the other search matches.
      // 'editor.findRangeHighlightBackground' // Color the range limiting the search.
      // 'editor.hoverHighlightBackground' // Highlight below the word for which a hover is shown.

      // 'editor.selectionBackground': "#ff9999", // Color of the editor selection.
      // 'editor.selectionForeground': "#000000", // Color of the selected text for high contrast.
      // 'editor.selectionHighlightBackground': "#ffffee", // Color for regions with the same content as the selection.

      // 'editor.findMatchBackground' // Color of the current search match.
      // 'editor.findMatchHighlightBackground' // Color of the other search matches.
      // 'editor.findRangeHighlightBackground' // Color the range limiting the search.
      'editor.hoverHighlightBackground': "#fffddd", // Highlight below the word for which a hover is shown.
      'editorHoverWidget.background': "#fffadd",
      'editorHoverWidget.border': "#F0E5A7",
    }
  })
  // monaco.editor.setTheme('scripterLight')
}


let _semdiag :any[]|null = null

async function getSemanticDiagnostics() :Promise<any[]> {
  if (!_semdiag) {
    // request diagnostics from TypeScript.
    // This usually takes a few milliseconds unfortunatently, leading to a
    // "blinking" effect of error markers.
    let tsworker = await monaco.languages.typescript.getTypeScriptWorker()
    let tsclient = await tsworker(editor.getModel().uri)
    _semdiag = await tsclient.getSemanticDiagnostics(currentModel.uri.toString())
  }
  return _semdiag
}

async function invalidateSemanticDiagnostics() {
  _semdiag = null
}


let saveViewStateTimer :any = null

function saveViewState() {
  clearTimeout(saveViewStateTimer as number)
  saveViewStateTimer = null
  currentScript.editorViewState = editor.saveViewState()
}

function setNeedsSaveViewState() {
  if (saveViewStateTimer === null) {
    saveViewStateTimer = setTimeout(saveViewState, 200)
  }
}


interface EvalTransaction {
  resolve(res :any) :void
  reject(e :Error) :void
  sourceMapJSON :string // may be empty
}

let liveEvalRequests = new Map<string,EvalTransaction>()
let nextEvalRequestId = (new Date).getTime()

function evalPluginCode(js :string, sourceMapJSON :string) :Promise<any> {
  let id = (nextEvalRequestId++).toString(36)
  return new Promise<any>(async (resolve, reject) => {
    liveEvalRequests.set(id, {resolve, reject, sourceMapJSON})
    // let rewriteGlobals = [
    //   "figma",
    //   "setTimeout",
    //   "clearTimeout",
    //   "setInterval",
    //   "clearInterval",
    // ]
    // js = (
    //   await resources["scripter-env.js"] +
    //   '(function(){ try {' +
    //   `return (async function(module,exports,${rewriteGlobals.join(",")}){`+
    //   js +
    //   `})(` +
    //     `{id:"",exports:{}},{},_${rewriteGlobals.join(",_")}` +
    //   `).then(_awaitAsync).catch(function(e){ _cancelAllTimers(e); throw e });` +
    //   `} catch(e) { _cancelAllTimers(e); throw e; } })();`
    // )

    print(`send eval request ${id}`)
    print(js)
    parent.postMessage({ type: "eval", id, js }, '*')
  })
}


interface SourcePos {
  line   :number
  column :number
}

type DecoratedTextChangedCallback = (d :monaco.editor.IModelDecoration) => void


let editorDecorationIds = []
let decorationCallbacks = new Map<string,DecoratedTextChangedCallback>()


function clearAllDecorations() {
  decorationCallbacks.clear()
  editor.deltaDecorations(editorDecorationIds, [])
  editorDecorationIds = []
}


function removeDecorations(ids :string[]) {
  let idset = new Set(ids)
  editorDecorationIds = editorDecorationIds.filter(id => !idset.has(id))
  for (let id of ids) {
    decorationCallbacks.delete(id)
  }
  editor.deltaDecorations(ids, [])
}


function addDecorations(
  decorations :monaco.editor.IModelDeltaDecoration[],
  callback? :DecoratedTextChangedCallback,
) {
  let ids = editor.deltaDecorations([], decorations)
  if (editorDecorationIds.length > 0) {
    editorDecorationIds = editorDecorationIds.concat(ids)
  } else {
    editorDecorationIds = ids
    observeEditorChanges()
  }
  if (callback) {
    for (let id of ids) {
      decorationCallbacks.set(id, callback)
    }
  }
}


function decorateError(pos :SourcePos, message :string) {
  setTimeout(() => {
    editor.revealLineInCenterIfOutsideViewport(pos.line, monaco.editor.ScrollType.Smooth)
  }, 100)

  addDecorations([{
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
    removeDecorations([d.id])
    hideWarningMessage()
  })
}


async function resolveOrigSourcePos(pos :SourcePos, lineOffset :number, sourceMapJSON :string) :Promise<SourcePos> {
  if (!sourceMapJSON) {
    return { line:0, column:0 }
  }

  ;(SourceMapConsumer as any).initialize({
    "lib/mappings.wasm": "source-map-" + SOURCE_MAP_VERSION + "-mappings.wasm",
  })

  // scripter:1.ts -> scripter:1.js
  let map1 = JSON.parse(sourceMapJSON)
  // map1.file = "script.js"
  // map1.sources = ["script.ts"]
  let sourceMap1 = await new SourceMapConsumer(map1)
  // print("map1:", JSON.stringify(map1, null, 2))

  if (lineOffset == 0) {
    let pos1 = sourceMap1.originalPositionFor(pos)
    sourceMap1.destroy()
    return pos1
  }

  // script.js -> wrapped-script.js
  let map2 = new SourceMapGenerator({ file: "script.js" })
  sourceMap1.eachMapping(m => {
    map2.addMapping({
      original: { line: m.originalLine, column: m.originalColumn },
      generated: { line: m.generatedLine + lineOffset, column: m.generatedColumn },
      source: m.source,
      name: m.name,
    })
  })
  // print("map2:", JSON.stringify(map2.toJSON(), null, 2));
  let sourceMap2 = await SourceMapConsumer.fromSourceMap(map2)

  let pos2 = sourceMap2.originalPositionFor(pos)
  // print("sourceMap2.originalPositionFor:", JSON.stringify(pos2, null, 2))

  sourceMap1.destroy()
  sourceMap2.destroy()

  return pos2
}


async function handleEvalError(msg :EvalResponseMsg, sourceMapJSON :string) {
  // print("msg", msg)  // TODO: use msg.srcLine and msg.srcColumn
  if (sourceMapJSON && msg.srcPos) {
    let pos = await resolveOrigSourcePos(msg.srcPos, msg.srcLineOffset, sourceMapJSON)
    if (pos.line > 0) {
      decorateError(pos, msg.error)
    }
  }
  showWarningMessage(msg.error)
}


async function handleEvalResponse(msg :EvalResponseMsg) {
  let t = liveEvalRequests.get(msg.id)
  if (!t) {
    return
  }
  liveEvalRequests.delete(msg.id)

  if (msg.error) {
    handleEvalError(msg, t.sourceMapJSON)
  }

  if (msg.error) {
    t.reject(new Error(msg.error))
  } else {
    t.resolve(msg.result)
  }
}


interface RunQItem {
  clearWithStatus(state :"ok"|"error")
}

function runqPush() :RunQItem {
  let runqEl = document.querySelector("#toolbar .runqueue") as HTMLElement
  let e = document.createElement("div")
  e.className = "pending"
  runqEl.appendChild(e)
  let makeVisible = () => { e.classList.add("visible") }
  // only show the [clock] icon when the run takes longer than 60ms
  let visibleTimer = setTimeout(makeVisible, 60)
  return {
    clearWithStatus(state :"ok"|"error") {
      clearTimeout(visibleTimer)
      if (state == "ok") {
        e.className = "ok"
      } else {
        e.className = "err"
      }
      makeVisible()
      setTimeout(() => {
        e.classList.add("hide")
        setTimeout(() => { runqEl.removeChild(e) }, 250)
      }, 500)
    }
  }
}


let runDebounceTimer :any = null

async function runCurrentProgram() :Promise<void> {
  if (runDebounceTimer !== null) {
    return
  }
  runDebounceTimer = setTimeout(()=>{ runDebounceTimer = null }, 100)
  hideWarningMessage()
  clearAllDecorations()
  clearAllMsgZones()
  toolbar.flashRunButton()
  let runqItem = runqPush()
  let result = await compileCurrentProgram()
  if (result.outputFiles && result.outputFiles.length) {
    let jsCode = ""
    let sourceMapCode = ""
    for (let f of result.outputFiles) {
      if (/\.map$/.test(f.name)) {
        sourceMapCode = f.text
      } else {
        jsCode = f.text
      }
    }
    jsCode = jsCode.replace(/\n\/\/#\s*sourceMappingURL=.+/, "")
    try {
      await evalPluginCode(jsCode, sourceMapCode)
      runqItem.clearWithStatus("ok")
    } catch (err) {
      runqItem.clearWithStatus("error")
    }
  }
  editor.focus()
}


interface EmitOutput {
  outputFiles: OutputFile[];
  emitSkipped: boolean;
}
interface OutputFile {
  name: string;
  writeByteOrderMark: boolean;
  text: string;
}

async function compileCurrentProgram() :Promise<EmitOutput> {
  let model = editor.getModel()
  let tsworker = await monaco.languages.typescript.getTypeScriptWorker()
  let tsclient = await tsworker(model.uri)
  return await tsclient.getEmitOutput(model.uri.toString()) as EmitOutput
}


function showWarningMessage(message :string) {
  let messageEl = document.querySelector("#message") as HTMLElement
  ;(messageEl.querySelector(".close-button") as HTMLElement).onclick = hideWarningMessage
  let el = messageEl.querySelector(".message > p") as HTMLElement
  el.innerText = message
  document.body.classList.add("showMessage")
  editor.render(true) // Note: This seems to not be working (overlap at bottom)
}


function hideWarningMessage() {
  if (document.body.classList.contains("showMessage")) {
    document.body.classList.remove("showMessage")
    editor.render(true)
  }
}


// let msgZones = new Map<number,number>() // line number => view zone ID
let msgZones = new Array<number>() // line number => view zone ID


function clearAllMsgZones() {
  if (msgZones.length > 0) {
    clearMsgZones(msgZones)
    msgZones = []
  }
}

function clearMsgZones(ids :Iterable<number>) {
  editor.changeViewZones(changeAccessor => {
    for (let id of ids) {
      changeAccessor.removeZone(id)
    }
  })
}


function updateMsgZonesAfterEdit(
  startLine :number,  // first line of change (inclusive)
  endLine :number,    // last line of change (inclusive)
  lineCount :number,  // total number of lines
  lineDelta :number,  // number of lines added or removed
) {
  // remove zones within changed lines
  let msgZonesToBeRemoved = new Set<number>()
  for (let line = startLine; line <= endLine; line++) {
    if (line in msgZones) {
      let zoneId = msgZones[line]
      msgZonesToBeRemoved.add(zoneId)
    }
  }
  clearMsgZones(msgZonesToBeRemoved)

  // offset zones after changed lines
  let msgZones2 :number[] = []
  // first, copy unaffected zones
  for (let line = 0; line < startLine; line++) {
    let zoneId = msgZones[line]
    if (zoneId !== undefined && !msgZonesToBeRemoved.has(zoneId)) {
      msgZones2[line] = zoneId
    }
  }
  // then, copy offset zones
  for (let line = startLine; line < lineCount; line++) {
    let zoneId = msgZones[line]
    if (zoneId !== undefined && !msgZonesToBeRemoved.has(zoneId)) {
      msgZones2[line + lineDelta] = zoneId
    }
  }
  msgZones = msgZones2
}


function setMsgZone(pos :SourcePos, message :string) :number {
  if (pos.line < 1) {
    return -1
  }

  let lineOffset = 0 // set to -1 to have it appear above pos.line

  let existingViewZoneId = msgZones[pos.line]
  let viewZoneId :number = -1

  editor.changeViewZones(changeAccessor => {
    if (existingViewZoneId !== undefined) {
      changeAccessor.removeZone(existingViewZoneId)
      existingViewZoneId = undefined
    }

    let heightInLines = message.split("\n").length

    let domNode = document.createElement('div')
    domNode.className = "printWidget"
    if (heightInLines < 2) {
      if (message.length > 40) {
        // make room for wrapping text
        heightInLines = 2
      } else {
        domNode.className += " small"
      }
    }

    let mainEl = document.createElement('div')
    domNode.appendChild(mainEl)

    let textEl = document.createElement('p')
    textEl.innerText = message
    textEl.className = "message monospace"
    mainEl.appendChild(textEl)

    let inlineButtonEl :HTMLElement|null = null
    if (message != "") {
      inlineButtonEl = document.createElement('div')
      inlineButtonEl.innerText = "+"
      inlineButtonEl.title = "Add to script as code"
      inlineButtonEl.className = "button inlineButton sansSerif"
      mainEl.appendChild(inlineButtonEl)
    }

    let closeButtonEl = document.createElement('div')
    closeButtonEl.innerText = "✗"
    closeButtonEl.title = "Dismiss"
    closeButtonEl.className = "button closeButton sansSerif"
    mainEl.appendChild(closeButtonEl)

    // compute actual height, as text may wrap
    let heightInPx = 16
    let domNode2 = domNode.cloneNode(true)
    editor.getDomNode().appendChild(domNode2)
    heightInPx = (domNode2 as any).querySelector('.message').clientHeight
    editor.getDomNode().removeChild(domNode2)

    heightInPx += 2


    viewZoneId = changeAccessor.addZone({
      afterLineNumber: pos.line + lineOffset,
      // afterColumn: pos.column,
      heightInPx,
      domNode,
    })

    closeButtonEl.addEventListener('click', ev => {
      ev.preventDefault()
      ev.stopPropagation()
      editor.focus()
      clearMsgZones([viewZoneId])
    }, {passive:false, capture:true})

    const addAsCode = () => {
      editor.focus()

      // find current line number for viewZoneId (might have been adjusted since creation)
      let lineNumber = pos.line
      for (let line in msgZones) {
        if (msgZones[line] == viewZoneId) {
          lineNumber = parseInt(line)
        }
      }

      lineNumber += lineOffset

      clearMsgZones([viewZoneId])

      let insertMessage = "\n" + message
      let spaces = "                                                                            "
      if (pos.column > 1) {
        insertMessage = insertMessage.replace(/\n/g, "\n" + spaces.substr(0, pos.column))
      }

      let newSelection = new monaco.Selection(
        lineNumber + 1, pos.column + 1,
        lineNumber + insertMessage.split("\n").length - 1, 9999
      )

      let sel = editor.getModel().pushEditOperations(
        // beforeCursorState: Selection[],
        // [new monaco.Selection(lineNumber, pos.column, lineNumber, pos.column)],
        editor.getSelections(),

        [{ // editOperations: IIdentifiedSingleEditOperation[],
          range: new monaco.Range(lineNumber,999,lineNumber,999),
          text: insertMessage,
          // This indicates that this operation has "insert" semantics:
          forceMoveMarkers: true
        }],

        // A callback that can compute the resulting cursors state after some edit
        // operations have been executed.
        (inverseEditOperations: monaco.editor.IIdentifiedSingleEditOperation[]) => {
          // let sel = editor.getSelection()
          // if (!sel.isEmpty()) {
          //   // don't change selection that is not empty
          //   return null
          // }
          return [newSelection]
        },
        // cursorStateComputer: ICursorStateComputer
      )

      setTimeout(() => { editor.setSelection(newSelection) },1)
    }

    if (inlineButtonEl) {
      textEl.addEventListener('dblclick', ev => {
        ev.stopPropagation()
        ev.preventDefault()
        addAsCode()
      }, {passive:false, capture:true})

      inlineButtonEl.addEventListener('click', ev => {
        ev.stopPropagation()
        ev.preventDefault()
        addAsCode()
      }, {passive:false, capture:true})
    }

    msgZones[pos.line] = viewZoneId
  })

  observeEditorChanges()

  return viewZoneId
}


async function handlePrintMsg(msg :PrintMsg) {
  // print("handlePrintMsg", msg)
  let t = liveEvalRequests.get(msg.reqId)
  if (!t) {
    return
  }

  let pos = msg.srcPos as SourcePos
  if (pos.line == 0 || !t.sourceMapJSON) {
    return
  }

  pos = await resolveOrigSourcePos(pos, msg.srcLineOffset, t.sourceMapJSON)
  if (pos.line == 0) {
    return
  }

  // format message
  let message = msg.message

  // TODO: find end of print statement and adjust line if it spans more than one line.
  // Example: Currently this is what happens:
  //
  //   print("single line")
  //   > single line
  //
  //   print("multiple",
  //   > multiple
  //   > lines
  //         "lines")
  //
  // It would be much nicer to have this:
  //
  //   print("multiple",
  //         "lines")
  //   > multiple
  //   > lines
  //

  setMsgZone(pos, message)


  // // Add a content widget (scrolls inline with text)
  // let widget = {
  //   domNode: null,
  //   getId: function() {
  //     return 'my.content.widget'
  //   },
  //   getDomNode: function() {
  //     if (!this.domNode) {
  //       this.domNode = document.createElement('div')
  //       this.domNode.innerHTML = message
  //       this.domNode.className = "printWidget printWidgetB"
  //     }
  //     return this.domNode
  //   },
  //   getPosition: function() {
  //     return {
  //       position: {
  //         lineNumber: pos.line,
  //         column: pos.column
  //       },
  //       range: {
  //         startLineNumber: pos.line, startColumn: 1,
  //         endLineNumber: pos.line, endColumn: 999,
  //       },
  //       preference: [
  //         // monaco.editor.ContentWidgetPositionPreference.EXACT,
  //         monaco.editor.ContentWidgetPositionPreference.BELOW,
  //         monaco.editor.ContentWidgetPositionPreference.ABOVE,
  //       ]
  //     };
  //   }
  // };
  // editor.addContentWidget(widget)


  // addDecorations([{
  //   range: new monaco.Range(
  //     pos.line, pos.column,
  //     pos.line, 999
  //   ),
  //   options: {
  //     // className: 'printDecoration',
  //     inlineClassName: 'printDecoration',
  //     // afterContentClassName: 'printDecoration',
  //     stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  //     hoverMessage: { // markdown
  //       value: message,
  //       isTrusted: true,
  //     },
  //     overviewRuler: {
  //       position: monaco.editor.OverviewRulerLane.Center,
  //       color: "rgba(0,0,255,0.1)",
  //     },
  //     isWholeLine: true,
  //   }
  // }], d => {
  //   removeDecorations([d.id])
  // })
}


let isObservingEditorChanges = false
let lastLineCount = 0

function observeEditorChanges() {
  if (isObservingEditorChanges) {
    return
  }
  isObservingEditorChanges = true
  lastLineCount = editor.getModel().getLineCount()

  editor.onDidChangeModelContent((e: monaco.editor.IModelContentChangedEvent) => {
    if (e.isFlush) {
      // is reset
      clearAllDecorations()
      clearAllMsgZones()
      return
    }

    // compute line delta (effective number of lines added or removed)
    let lineCount = editor.getModel().getLineCount()
    let lineDelta = lineCount - lastLineCount
    lastLineCount = lineCount

    // compute maxium line range of all changes
    let startLine = Infinity
    let endLine = 0
    for (let c of e.changes) {
      startLine = Math.min(startLine, c.range.startLineNumber)
      endLine = Math.max(endLine, c.range.endLineNumber)
    }

    // update zones
    updateMsgZonesAfterEdit(startLine, endLine, lineCount, lineDelta)

    // update decorations
    for (let c of e.changes) {
      // expand change range to whole line
      let range = {
        startLineNumber: c.range.startLineNumber,
        startColumn: 0,
        endLineNumber: c.range.endLineNumber,
        endColumn: 999,
      }
      let decorations = editor.getModel().getDecorationsInRange(range)
      // let decorations = editor.getLineDecorations(e.changes[0].range.startLineNumber)
      for (let d of decorations) {
        let callback = decorationCallbacks.get(d.id)
        if (callback) {
          callback(d)
        }
      }
    }
  })
}


function setFigmaApiVersion(version :string) {
  // TODO: see if we have a resource for the .d.ts file and update editor if we do.
  // print(`TODO: setFigmaApiVersion "${version}" (current: "${pluginApiVersion}")`)
  // if (version !== "0.0.0") {
  //   pluginApiVersion = version
  // }
}


class ToolbarUI {
  el :HTMLElement = document.getElementById('toolbar') as HTMLElement
  runButton :HTMLElement
  menuButton :HTMLElement

  init() {
    this.runButton = this.el.querySelector('.button.run') as HTMLElement
    this.runButton.title = this.runButton.title + (
      isMac != -1 ? "  (⌘⏎)"
                  : "  (Ctrl+Enter)"
    )
    this.runButton.addEventListener("click", ev => {
      runCurrentProgram()
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})

    this.menuButton = this.el.querySelector('.button.menu') as HTMLElement
    this.menuButton.addEventListener("click", ev => {
      menu.toggle()
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})
  }

  flashRunButton() {
    this.runButton.classList.add("flash")
    setTimeout(() => this.runButton.classList.remove("flash"), 300)
  }
}


var toolbar = new ToolbarUI()


class MenuUI {
  visible :boolean = false
  el :HTMLElement = document.getElementById('menu') as HTMLElement
  scriptListEl :HTMLElement
  newScriptButton :HTMLElement

  init() {
    this.el.addEventListener("keydown", ev => {
      if (ev.key == "Escape") {
        this.close()
      }
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})

    this.scriptListEl = this.el.querySelector(".script-list") as HTMLElement

    this.newScriptButton = this.el.querySelector(".button.new") as HTMLElement
    this.newScriptButton.onclick = () => {
      newScript()
    }
  }


  async updateScriptList() {
    if (!this.visible) {
      return
    }

    let [scripts] = await db.read(["scripts"], async scripts => {
      let modifiedAt = scripts.getIndex("modifiedAt")
      return modifiedAt.getAll()
    })

    if (currentScript.id <= 0) {
      // special case: list unsaved script
      scripts.push(currentScript.meta)
    }

    this.scriptListEl.style.visibility = "hidden"
    this.scriptListEl.innerText = ""

    for (let script of scripts.reverse()) {
      let li = document.createElement("li")
      li.innerText = script.name
      if (script.id <= 0) {
        li.classList.add("unsaved")
        li.innerText += " •"
      }
      li.title = `Last modified ${script.modifiedAt.toLocaleString()}`
      if (currentScript && script.id == currentScript.id) {
        li.classList.add("active")
      }
      li.onclick = () => {
        openScript(script.id)
      }
      this.scriptListEl.appendChild(li)
    }

    this.scriptListEl.style.visibility = null
  }


  onOpen() {
    this.el.focus()
    this.updateScriptList()
  }

  onClose() {
    editor.focus()
  }

  toggle() :boolean {
    this.visible = this.el.classList.toggle("visible", !this.visible)
    document.body.classList.toggle("menuVisible", this.visible)
    toolbar.menuButton.classList.toggle("on", this.visible)
    if (this.visible) {
      this.onOpen()
    } else {
      this.onClose()
    }
    return this.visible
  }

  open() {
    if (!this.visible) {
      this.toggle()
    }
  }

  close() {
    if (this.visible) {
      this.toggle()
    }
  }
}


var menu = new MenuUI()


function setupKeyboardHandlers() {
  const maybeHandleKeypress = (ev :KeyboardEvent, key :string) :any => {
    if (key == "Enter" || key == "r" || key == "s") {
      runCurrentProgram()
      return true
    }

    // toggle menu
    if (key == "m") {
      menu.toggle()
    }

    // editor options
    let updatedOptions :monaco.editor.IEditorOptions = {}
    if (key == "=" || key == "+") {
      updatedOptions.fontSize = Math.min(30, edOptions.fontSize + 1)
    } else if (key == "-") {
      updatedOptions.fontSize = Math.max(8, edOptions.fontSize - 1)
    } else if (key == "0") {
      updatedOptions.fontSize = defaultFontSize
    }
    if (updatedOptions.fontSize !== undefined) {
      document.body.style.fontSize = `${updatedOptions.fontSize}px`
    }

    let shouldUpdateOptions = false
    for (let k in updatedOptions) {
      edOptions[k] = updatedOptions[k]
      shouldUpdateOptions = true
    }
    if (shouldUpdateOptions) {
      editor.updateOptions(updatedOptions)
      if ("fontSize" in updatedOptions) {
        config.fontSize = updatedOptions.fontSize
      }
      return true
    }

  }
  window.addEventListener("keydown", ev => {
    // print(ev.key, ev.keyCode, ev.metaKey, ev.ctrlKey)
    if ((ev.metaKey || ev.ctrlKey) && maybeHandleKeypress(ev, ev.key)) {
      ev.preventDefault()
      ev.stopPropagation()
    }
  }, { capture: true, passive: false, })
}


function setupMessageHandler() {
  window.onmessage = ev => {
    // print("ui received message",
    //   JSON.stringify({ origin: ev.origin, data: ev.data }, null, "  ")
    // )
    let msg = ev.data
    if (msg && typeof msg == "object") {
      switch (msg.type) {

      case "set-figma-api-version":
        setFigmaApiVersion(msg.api as string)
        break

      case "eval-response":
        handleEvalResponse(msg as EvalResponseMsg)
        break

      case "print":
        handlePrintMsg(msg as PrintMsg)
        break

      }
    }
  }
}


async function main() {
  await initData()
  await config.load()
  menu.init()
  toolbar.init()
  setupEditor()
  setupKeyboardHandlers()
  setupMessageHandler()

  // signal to parent that we are ready
  parent.postMessage({ type: "ui-init" }, '*')

  setTimeout(() => { menu.open() },100)
}


main().catch(e => console.error(e.stack||String(e)))
