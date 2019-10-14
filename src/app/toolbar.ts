import { editor } from "./editor"
import { menu } from "./menu"
import { scriptsData } from "./script-data"
import { isMac, dlog } from "./util"
import * as warningMessage from "./warning-message"


class ToolbarUI {
  el :HTMLElement

  runButton   :HTMLElement
  clearButton :HTMLElement
  menuButton  :HTMLElement

  stopCallbacks = new Set<()=>void>()
  isRunning :bool = false


  addStopCallback(stopCallback :()=>void) {
    this.stopCallbacks.add(stopCallback)
    if (!this.isRunning) {
      this.isRunning = true
      this.updateUI()
    }
    // this.runButton.classList.add("flash")
    // setTimeout(() => this.runButton.classList.remove("flash"), 300)
  }


  removeStopCallback(stopCallback :()=>void) {
    this.stopCallbacks.delete(stopCallback)
    if (this.stopCallbacks.size == 0) {
      this.isRunning = false
      this.updateUI()
    }
  }


  updateUI() {
    this.runButton.classList.toggle("running", this.isRunning)
    this.runButton.title = (
      this.isRunning ? (
        isMac ? "Stop  (⇧⌘⏎)"
              : "Stop  (Ctrl+Shift+Return)"
      ) : (
        isMac ? "Run  (⌘⏎)"
              : "Run  (Ctrl+Return)"
      )
    )
  }


  init() {
    this.el = document.getElementById('toolbar') as HTMLElement


    // menu button
    this.menuButton = this.el.querySelector('.button.menu') as HTMLElement
    let updateMenuButtonTitle = () => {
      let verb = menu.isVisible ? "Hide" : "Show"
      let shortcut = isMac ? "⌃M" : "Ctrl+M"
      this.menuButton.title = `${verb} menu  (${shortcut})`
    }
    updateMenuButtonTitle()
    this.menuButton.addEventListener("click", ev => {
      menu.toggle()
      updateMenuButtonTitle()
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})
    menu.on("visibility", menuVisible => {
      this.menuButton.classList.toggle("on", menuVisible)
    })


    // new button
    let newButton = this.el.querySelector('.button.new') as HTMLElement
    newButton.addEventListener("click", ev => {
      editor.newScript({ name: scriptsData.nextNewScriptName() })
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})


    // clear button
    this.clearButton = this.el.querySelector('.button.clear') as HTMLElement
    this.clearButton.title = "Clear messages  " + (
      isMac ? "(⌘K)"
            : "(Ctrl+L)"
    )
    handleClick(this.clearButton, () => {
      warningMessage.hide()
      editor.clearMessages()
    })
    editor.viewZones.on("update", () => {
      this.clearButton.classList.toggle("unavailable", editor.viewZones.count == 0)
    })


    // run button
    this.runButton = this.el.querySelector('.button.run') as HTMLElement
    handleClick(this.runButton, () => {
      if (this.isRunning) {
        for (let f of this.stopCallbacks) {
          try {
            f()
          } catch (e) {
            console.error(`[toolbar] error in stopCallback: ${e.stack||e}`)
          }
        }
      } else {
        editor.runCurrentScript()
      }
    })


    // title
    let titleEl = this.el.querySelector('.title') as HTMLElement
    titleEl.onclick = () => {
      menu.toggle(/* closeOnSelection */ true)
    }
    let updateTitle = () => { titleEl.innerText = editor.currentScript.name }
    scriptsData.on("change", updateTitle)
    // editor.on("modelchange", updateTitle)

    this.updateUI()
  }

}


// click handler
function handleClick(el :HTMLElement, f :()=>void) {
  el.addEventListener("click", ev => {
    ev.preventDefault()
    ev.stopPropagation()
    f()
  }, {passive:false,capture:true})
}


export default new ToolbarUI()
