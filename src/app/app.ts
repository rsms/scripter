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
import { menu } from "./menu"
import { editor, initEditorModel } from "./editor"
import * as figmaPluginBridge from "./figma-plugin-bridge"
import toolbar from "./toolbar"
import { isMac /* , print, dlog */ } from "./util"


function setupKeyboardHandlers() {
  const maybeHandleKeypress = (ev :KeyboardEvent, key :string) :any => {

    // run script
    if (key == "Enter" || key == "r" || key == "s") {
      if (ev.shiftKey) {
        return editor.stopCurrentScript(), true
      } else {
        return editor.runCurrentScript(), true
      }
    }

    // stop script (ctrl-shift-X)
    if ((key == "x" || key == "X") && ev.ctrlKey && ev.shiftKey) {
      return editor.stopCurrentScript(), true
    }

    // toggle menu
    if (key == "m" && (!isMac || !ev.metaKey)) {
      // Note: avoid intercepting cmd-M on mac
      return menu.toggle(), true
    }

    // editor options
    let updatedOptions :monaco.editor.IEditorOptions = {}
    if (key == "=" || key == "+") {
      updatedOptions.fontSize = Math.min(30, editor.options.fontSize + 1)
    } else if (key == "-") {
      updatedOptions.fontSize = Math.max(8, editor.options.fontSize - 1)
    } else if (key == "0") {
      updatedOptions.fontSize = editor.defaultFontSize
    }
    if (updatedOptions.fontSize !== undefined) {
      document.body.style.fontSize = `${updatedOptions.fontSize}px`
    }
    if (editor.updateOptions(updatedOptions)) {
      if ("fontSize" in updatedOptions) {
        editor.clearAllMetaInfo() // since font size changing casues visual bugs
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



async function main() {
  await initData()
  await config.load()
  toolbar.init()
  editor.init()
  menu.init()
  figmaPluginBridge.init()
  setupKeyboardHandlers()
}


main().catch(e => console.error(e.stack||String(e)))
