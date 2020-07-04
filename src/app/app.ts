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


const uiScale = {
  zoomIn() {
    let v = config.uiScale
    for (let step of uiScaleSteps) {
      if (v <= step[0]) {
        config.uiScale = step[1]
        break
      }
    }
  },
  zoomOut() {
    let v = config.uiScale
    for (let step of uiScaleSteps) {
      if (v <= step[1]) {
        config.uiScale = step[0]
        break
      }
    }
  },
  resetZoom() {
    config.uiScale = 1
  },
}


function setupKeyboardHandlers() {
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

    // uiScale
    if (key == "=" || key == "+") {
      uiScale.zoomIn()
    } else if (key == "-") {
      uiScale.zoomOut()
    } else if (key == "0") {
      uiScale.resetZoom()
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

  window.addEventListener("keydown", ev => {
    // print(ev.key, ev.keyCode, ev.metaKey, ev.ctrlKey)
    if ((ev.metaKey || ev.ctrlKey) && maybeHandleCmdKeypress(ev, ev.key)) {
      ev.preventDefault()
      ev.stopPropagation()
    } else if (ev.altKey && maybeHandleAltKeypress(ev, ev.key)) {
      ev.preventDefault()
      ev.stopPropagation()
    }
  }, { capture: true, passive: false, })
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
  await initData()
  await config.load()
  setupAppEventHandlers()
  updateUIScaleCssVar()
  toolbar.init()
  editor.init()
  menu.init()
  figmaPluginBridge.start()
}


main().catch(e => console.error(e.stack||String(e)))
