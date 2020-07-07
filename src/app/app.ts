import "./app.css"
import { WindowSize } from "../common/messages"
import * as windowSize from "../common/windowsize"
import "./resources"
import * as monaco from "../monaco/monaco"
// import * as monaco from "./monaco-ambient"
import { api as defaultPluginApiVersion } from "../figma-plugin/manifest.json"
import { SourceMapConsumer, SourceMapGenerator } from "../misc/source-map"
import { db, initData } from "./data"
import { config } from "./config"
import { Script } from "./script"
import { menu } from "./menu"
import { editor } from "./editor"
import * as figmaPluginBridge from "./figma-plugin-bridge"
import toolbar from "./toolbar"
import { isMac, dlog } from "./util"
import * as warningMessage from "./warning-message"
import "../common/filetype"
import { EventEmitter } from "./event"
import { uiresponder } from "./uiresponder"


interface AppEvents {
  "close": undefined
}

// return true to stop event chain
type AppKeyEventHandler = (ev :KeyboardEvent) => boolean|undefined|void

const app = new class App extends EventEmitter<AppEvents> {
  _keyEventHandlers = new Set<AppKeyEventHandler>()

  constructor() {
    super()
    window.addEventListener("unload", () => {
      this.triggerEvent("close")
    })
  }

  handleKeyDownEvent = (ev :KeyboardEvent) :void => {}  // replaced by setupKeyboardHandlers

  addKeyEventHandler(f :AppKeyEventHandler) {
    this._keyEventHandlers.add(f)
  }
  removeKeyEventHandler(f :AppKeyEventHandler) {
    this._keyEventHandlers.delete(f)
  }

  zoomIn() {
    let v = config.uiScale
    for (let step of uiScaleSteps) {
      if (v <= step[0]) {
        config.uiScale = step[1]
        break
      }
    }
  }

  zoomOut() {
    let v = config.uiScale
    for (let step of uiScaleSteps) {
      if (v <= step[1]) {
        config.uiScale = step[0]
        break
      }
    }
  }

  resetZoom() {
    config.uiScale = 1
  }
}

export default app


const uiScaleSteps = (steps => {
  return steps.slice(0, steps.length-1).map((v, i) => {
    return [v, steps[i+1]]
  })
})([
  0.5,
  0.75,
  0.8,
  0.9,
  1,
  1.1,
  1.2,
  1.3,
  1.4,
  1.5,
  1.75,
  2,
  2.5,
  3,
])


function setupKeyboardHandlers() {
  // Note: figma-plugin-bridge.ts adds additional keyboard bindings, like meta-alt-P

  const maybeHandleCmdKeypress = (ev :KeyboardEvent, key :string) :any => {

    // run script
    if (key == "Enter" || key == "r") {
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

    // clean up (cmd-K on mac, ctrl-L anywhere)
    if ((key == "l" && ev.ctrlKey) || (isMac && ev.metaKey && key == "k")) {
      warningMessage.hide()
      editor.clearMessages()
      return true
    }

    // toggle menu
    if (key == "m" && (!isMac || !ev.metaKey)) {
      // Note: avoid intercepting cmd-M on mac
      return menu.toggle(), true
    }

    // history
    if (ev.shiftKey) {
      if (ev.code == "BracketLeft") {
        return editor.historyBack(), true
      }
      if (ev.code == "BracketRight") {
        return editor.historyForward(), true
      }
    }
    if (isMac) {
      if (ev.ctrlKey && ev.code == "Minus") {
        if (ev.shiftKey) {
          return editor.historyForward(), true
        }
        return editor.historyBack(), true
      }
    }

    // UI scale
    if (key == "=" || key == "+") {
      app.zoomIn()
    } else if (key == "-") {
      app.zoomOut()
    } else if (key == "0") {
      app.resetZoom()
    }

    // dlog("KeyboardEvent", ev, key)
  }

  const maybeHandleAltKeypress = (ev :KeyboardEvent, key :string) :any => {
    // on Windows and Linux alt-arrowkey is commonly used by e.g. Firefox for history nav
    if (!isMac) {
      if (key == "ArrowLeft") {
        return editor.historyBack(), true
      }
      if (key == "ArrowRight") {
        return editor.historyForward(), true
      }
    }
    // dlog("KeyboardEvent", ev, key)
  }

  app.handleKeyDownEvent = ev => {
    // console.log("app.handleKeyDownEvent",
    //   { key: ev.key, keyCode: ev.keyCode, metaKey: ev.metaKey, ctrlKey: ev.ctrlKey, ev })
    let stop = false
    if ((ev.metaKey || ev.ctrlKey) && maybeHandleCmdKeypress(ev, ev.key)) {
      stop = true
    } else if (ev.altKey && maybeHandleAltKeypress(ev, ev.key)) {
      stop = true
    }
    if (!stop) {
      for (let f of app._keyEventHandlers) {
        if (f(ev)) {
          stop = true
          break
        }
      }
    }
    if (stop) {
      ev.preventDefault()
      ev.stopPropagation()
    }
  }

  window.addEventListener("keydown", app.handleKeyDownEvent, { capture: true, passive: false, })
}


function setupAppEventHandlers() {
  function updateWindowSize() {
    let [wz,hz] = config.windowSize
    let cl = document.body.classList
    cl.remove("windowWidthSmall")
    cl.remove("windowWidthMedium")
    cl.remove("windowWidthLarge")
    cl.remove("windowWidthXLarge")
    cl.remove("windowHeightSmall")
    cl.remove("windowHeightMedium")
    cl.remove("windowHeightLarge")
    cl.remove("windowHeightXLarge")
    switch (wz) {
      case WindowSize.SMALL:  cl.add("windowWidthSmall"); break
      case WindowSize.MEDIUM: cl.add("windowWidthMedium"); break
      case WindowSize.LARGE:  cl.add("windowWidthLarge"); break
      case WindowSize.XLARGE: cl.add("windowWidthXLarge"); break
    }
    switch (hz) {
      case WindowSize.SMALL:  cl.add("windowHeightSmall"); break
      case WindowSize.MEDIUM: cl.add("windowHeightMedium"); break
      case WindowSize.LARGE:  cl.add("windowHeightLarge"); break
      case WindowSize.XLARGE: cl.add("windowHeightXLarge"); break
    }
  }
  config.on("change", ev => {
    if (ev.key == "windowSize") {
      updateWindowSize()
    } else if (ev.key == "uiScale") {
      updateUIScaleCssVar()
      // editor.clearAllMetaInfo() // changing font size casues visual bugs
    }
  })
  updateWindowSize()
}


function updateUIScaleCssVar() {
  document.body.style.setProperty("--uiScale", String(config.uiScale))
}


async function main() {
  figmaPluginBridge.init()
  setupKeyboardHandlers()

  // sync here on db and config init
  // config depends on database, other init functions depends on config and database
  await initData()
  await config.load()

  let promises :Promise<void>[] = []
  setupAppEventHandlers()
  updateUIScaleCssVar()
  toolbar.init()
  promises.push(editor.init())
  menu.init()
  figmaPluginBridge.start()

  await Promise.all(promises)
  document.documentElement.classList.remove("loading")

  uiresponder.addFocusListener(document.body, (inFocus, lostFocus) => {
    if (inFocus === document.body) {
      editor.focus()
    }
  })
}


main().catch(e => console.error(e.stack||String(e)))
