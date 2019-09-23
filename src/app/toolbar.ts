import { editor } from "./editor"
import { menu } from "./menu"
import { isMac } from "./util"


class ToolbarUI {
  el :HTMLElement
  runButton :HTMLElement
  menuButton :HTMLElement
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

    // run button
    this.runButton = this.el.querySelector('.button.run') as HTMLElement
    this.runButton.addEventListener("click", ev => {
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
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})

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

    this.updateUI()
  }

}


export default new ToolbarUI()
