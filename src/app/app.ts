import "./app.css"
import { EvalResponseMsg, PrintMsg } from "../common/messages"
import resources from "./resources"
import * as monaco from "monaco-editor"
// import * as monaco from "./monaco-ambient"
import { api as defaultPluginApiVersion } from "../figma-plugin/manifest.json"
import { SourceMapConsumer, SourceMapGenerator } from "../misc/source-map"
import { initData, settings, Script } from "./data"

const isMac = navigator.platform.indexOf("Mac")
const print = console.log.bind(console)
const storageKeyBuffer0 = "figsketch.buffer0"
const storageKeyViewState = "figsketch.viewstate"

// defined globally in webpack config
declare const SOURCE_MAP_VERSION :string

let defaultProgramCode = `
  for (let n of figma.currentPage.selection) {
    if (isText(n)) {
      n.characters = n.characters.trim()
    }
  }
  function isText(n :BaseNode) :n is TextNode {
    let unusedone = 5
    return n.type == "TEXT"
  }
`.trim().replace(/\n  /mg, "\n")

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


let currentScript = new Script("")


async function setupEditor() {
  // define editor themes
  defineEditorThemes()

  // load past code buffer
  let code = localStorage.getItem(storageKeyBuffer0)
  if (!code || code.trim().length == 0) {
    code = defaultProgramCode
  }

  // load previously-stored view state
  let viewState :any
  try {
    viewState = JSON.parse(localStorage.getItem(storageKeyViewState))
    if (viewState.options) for (let k in viewState.options) {
      edOptions[k] = viewState.options[k]
      if (k == "fontSize") {
        document.body.style.fontSize = `${edOptions[k]}px`
      }
    }
  } catch (_) {}

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
    sourceMap: true,

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

  // create editor model
  let model = monaco.editor.createModel(code, "typescript",
    // TODO: use meaningful names instead of "1" when users can save scripts
    monaco.Uri.from({scheme:"scripter", path:"1.ts"})
  )

  // create editor
  editor = monaco.editor.create(document.getElementById('editor')!, {
    model,
    theme: 'scripter-light',
    ...edOptions,
    extraEditorClassName: 'scripter-light',
  })

  // restore editor view state
  if (viewState && viewState.editor) {
    // workaround for a bug: Restoring the view state on the next frame works around
    // a bug with variable-width fonts.
    setTimeout(() => {
      editor.restoreViewState(viewState.editor as monaco.editor.ICodeEditorViewState)
    }, 0)
  }

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

  // filter out some errors
  let lastSeenMarkers :monaco.editor.IMarker[] = []
  let onDidChangeDecorationsCallbackRunning = false
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

  editor.onDidChangeModelContent((e: monaco.editor.IModelContentChangedEvent) :void => {
    setNeedsSaveEditorBuffer()
    invalidateSemanticDiagnostics()
  })

  editor.onDidChangeCursorPosition((e: monaco.editor.ICursorPositionChangedEvent) :void => {
    setNeedsSaveViewState()
  })

  editor.onDidChangeCursorSelection((e: monaco.editor.ICursorSelectionChangedEvent) :void => {
    setNeedsSaveViewState()
  })

  // editor.addCommand(monaco.KeyCode.Enter | monaco.KeyCode.Ctrl, (ctx :any) => {
  //   print("handler called with ctx:", ctx)
  // })
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
    _semdiag = await tsclient.getSemanticDiagnostics("scripter:1.ts")
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
  localStorage.setItem(storageKeyViewState, JSON.stringify({
    editor: editor.saveViewState(),
    options: {
      fontSize: edOptions.fontSize,
    },
  }))
}

function setNeedsSaveViewState() {
  if (saveViewStateTimer === null) {
    saveViewStateTimer = setTimeout(saveViewState, 200)
  }
}


let saveEditorBufferTimer :any = null

function saveEditorBuffer() {
  clearTimeout(saveEditorBufferTimer as number)
  saveEditorBufferTimer = null

  // save to local storage
  let code = editor.getValue({ preserveBOM: false, lineEnding: "\n" })
  localStorage.setItem(storageKeyBuffer0, code)

  // save view state too
  saveViewState()
}

function setNeedsSaveEditorBuffer() {
  if (saveEditorBufferTimer === null) {
    saveEditorBufferTimer = setTimeout(saveEditorBuffer, 200)
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
  e.innerText = "\u25CB"
  runqEl.appendChild(e)
  return {
    clearWithStatus(state :"ok"|"error") {
      if (state == "ok") {
        e.className = "ok"
        e.innerText = "\uE13C"
      } else {
        e.className = "err"
        e.innerText = "\uE13D"
      }
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
  flashRunButton()
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
    try {
      await evalPluginCode(jsCode, sourceMapCode)
      runqItem.clearWithStatus("ok")
    } catch (err) {
      runqItem.clearWithStatus("error")
    }
  }
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


let runButton :HTMLElement

function setupToolbarUI() {
  let toolbar = document.getElementById('toolbar') as HTMLElement
  runButton = toolbar.querySelector('.button.run') as HTMLElement
  runButton.title = runButton.title + (
    isMac != -1 ? "  (⌘⏎)"
                : "  (Ctrl+Enter)"
  )
  runButton.onclick = runCurrentProgram
}


function flashRunButton() {
  runButton.classList.add("flash")
  setTimeout(()=>runButton.classList.remove("flash"), 300)
}


function setupKeyboardHandlers() {
  const maybeHandleKeypress = (ev :KeyboardEvent, key :string) :any => {
    if (key == "Enter" || key == "r" || key == "s") {
      runCurrentProgram()
      return true
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
      setNeedsSaveViewState()
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
    print("ui received message",
      JSON.stringify({ origin: ev.origin, data: ev.data }, null, "  ")
    )
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
  setupToolbarUI()
  setupEditor()
  setupKeyboardHandlers()
  setupMessageHandler()

  // signal to parent that we are ready
  parent.postMessage({ type: "ui-init" }, '*')
}


main().catch(e => console.error(e.stack||String(e)))
