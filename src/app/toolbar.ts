import { editor } from "./editor"
import { menu } from "./menu"
import { scriptsData } from "./script-data"
import { isMac, dlog } from "./util"
import * as warningMessage from "./warning-message"
import savedScripts from "./saved-scripts"
import { EL } from "./dom"


class ToolbarUI {
  el :HTMLElement

  runButton   :HTMLElement
  clearButton :HTMLElement
  menuButton  :HTMLElement
  saveButton  :HTMLElement
  backButton  :HTMLElement
  fwdButton   :HTMLElement

  stopCallbacks = new Set<()=>void>()
  isRunning :bool = false
  isFadedOut :bool = false
  pointerInsideAt :number = 0 // when non-null, Date.now() when pointer entered toolbar
  waitCount :number = 0
  waitTimer :any = null
  waitSpinnerEl :HTMLDivElement|null = null


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


  // these are called by editor while its waiting for compilation, while run has been requested
  // but the app is waiting for e.g. typescript worker to reply.
  incrWaitCount() {
    this.waitCount++
    if (this.waitCount == 1) {
      this.scheduleWaitIndicator()
    }
  }

  decrWaitCount() {
    this.waitCount--
    if (this.waitCount == 0) {
      this.cancelWaitIndicator()
    }
  }


  scheduleWaitIndicator() {
    if (this.waitTimer !== null) {
      return console.warn(`race error in toolbar/scheduleWaitIndicator`)
    }
    this.waitTimer = setTimeout(() => {
      if (this.runButton.classList.toggle("hide-icon", true)) {
        this.runButton.appendChild(EL("div", { className: "progress-spinner on" }))
      }
    }, 100)
  }

  cancelWaitIndicator() {
    if (this.runButton.firstChild) {
      this.runButton.classList.remove("hide-icon")
      this.runButton.removeChild(this.runButton.firstChild)
    }
    clearTimeout(this.waitTimer)
    this.waitTimer = null
  }


  updateUI() {
    this.runButton.classList.toggle("running", this.isRunning)
    this.runButton.title = (
      this.isRunning ? (
        isMac ? "Stop  ⇧⌘⏎"
              : "Stop  (Ctrl+Shift+Return)"
      ) : (
        isMac ? "Run  ⌘⏎"
              : "Run  (Ctrl+Return)"
      )
    )
  }

  fadeOut() {
    // pointerInsideTimeout defines how old a pointerenter event can be while we consider
    // the pointer as being inside the toolbar. This is needed because event handling on the web
    // platform is a mess and thusd we can't actually know if the pointer is inside.
    const pointerInsideMaxAge = 30000
    if (!this.isFadedOut) {
      if (menu.isVisible ||
        (this.pointerInsideAt > 0 && Date.now() - this.pointerInsideAt < pointerInsideMaxAge)
      ) {
        // don't fade out while the menu is open or the pointer is inside the toolbar
        return
      }
      this.isFadedOut = true
      this.el.classList.add("faded")
    }
  }

  fadeIn() {
    if (this.isFadedOut) {
      this.isFadedOut = false
      this.el.classList.remove("faded")
    }
  }


  init() {
    this.el = document.getElementById('toolbar') as HTMLElement

    this.el.addEventListener("pointerenter", () => {
      this.pointerInsideAt = Date.now()
      this.fadeIn()
    })
    this.el.addEventListener("pointerleave", () => {
      this.pointerInsideAt = 0
    })

    // menu button
    this.menuButton = this.el.querySelector('.button.menu') as HTMLElement
    let updateMenuButtonTitle = () => {
      let verb = menu.isVisible ? "Hide" : "Show"
      let shortcut = isMac ? "⌃M" : "(Ctrl+M)"
      this.menuButton.title = `${verb} menu  ${shortcut}`
    }
    updateMenuButtonTitle()
    this.menuButton.addEventListener("click", ev => {
      menu.toggle()
      updateMenuButtonTitle()
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})
    const updateMenuVisible = () => {
      this.el.classList.toggle("menuVisible", menu.isVisible)
      this.menuButton.classList.toggle("on", menu.isVisible)
    }
    menu.on("visibility", updateMenuVisible)


    // new button
    let newButton = this.el.querySelector('.button.new') as HTMLElement
    newButton.addEventListener("click", ev => {
      editor.newScript({ name: scriptsData.nextNewScriptName() })
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})


    // save button
    this.saveButton = this.el.querySelector('.button.save') as HTMLElement
    this.saveButton.addEventListener("click", ev => {
      editor.saveScriptToFigma()
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})
    const updateSaveButton = () => {
      let saveButtonAvailable = false
      if (editor.currentScript) {
        if (editor.currentScript.id >= 0) {
          // Note: Example scripts (id<0) can't be saved since they have no GUID and
          // they can not be edited (i.e. given a guid.) Plus, it makes no sense to save
          // an example script as it's always available in Scripter.
          saveButtonAvailable = !savedScripts.hasGUID(editor.currentScript.guid)
        }
      }
      this.saveButton.classList.toggle("hidden", !saveButtonAvailable)
    }
    updateSaveButton()
    savedScripts.on("change", updateSaveButton)

    // history back and forward buttons
    this.backButton = this.el.querySelector('.button.history-back') as HTMLElement
    this.backButton.addEventListener("click", ev => {
      editor.historyBack()
      editor.focus()
      ev.preventDefault()
      ev.stopPropagation()
    }, {capture:true})
    this.fwdButton = this.el.querySelector('.button.history-forward') as HTMLElement
    this.fwdButton.addEventListener("click", ev => {
      editor.historyForward()
      editor.focus()
      ev.preventDefault()
      ev.stopPropagation()
    }, {capture:true})
    const updateHistoryButtons = () => {
      this.backButton.classList.toggle("unavailable", !editor.navigationHistory.canGoBack())
      this.fwdButton.classList.toggle("unavailable", !editor.navigationHistory.canGoForward())
    }
    editor.navigationHistory.on("change", updateHistoryButtons)
    updateHistoryButtons()


    // clear button
    this.clearButton = this.el.querySelector('.button.clear') as HTMLElement
    this.clearButton.title = "Clear messages  " + (
      isMac ? "⌘K"
            : "(Ctrl+L)"
    )
    handleClick(this.clearButton, () => {
      warningMessage.hide()
      editor.clearMessages()
    })
    const updateClearButton = () => {
      let cl = this.clearButton.classList
      let isROLib = !editor.currentScript || editor.currentScript.isROLib
      cl.toggle("hidden", isROLib)
      if (!isROLib) {
        cl.toggle(
          "unavailable",
          editor.viewZones.count == 0 && editor.editorDecorationIds.length == 0
        )
      }
    }
    updateClearButton()
    editor.viewZones.on("update", updateClearButton)
    editor.on("decorationchange", updateClearButton)


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
    const updateRunButton = () => {
      let isROLib = !editor.currentScript || editor.currentScript.isROLib
      this.runButton.classList.toggle("hidden", isROLib)
    }
    updateRunButton()


    // update when script changes
    scriptsData.on("change", () => {
      updateSaveButton()
      updateClearButton()
      updateRunButton()
    })


    // title
    initTitle(this.el)


    this.updateUI()
  }

}


function initTitle(host) {
  let container = host.querySelector('.title') as HTMLElement
  let input = container.querySelector('input') as HTMLInputElement

  const editSession = new class {
    active = false
    restoreValue = ""     // value at beginning of session, used for discarding changes cancel.
    scriptID: number = 0  // ID of script being edited, for race detection

    // possible state flows:
    // A = begin -> end           : input loses focus before ESC or RETURN is pressed
    // B = begin -> cancel -> end : user presses ESC
    // C = begin -> commit -> end : user presses RETURN
    begin() {
      dlog("title/editSession/begin")
      this.active = true
      this.restoreValue = input.value
      this.scriptID = editor.currentScript.id
      input.select()
      requestAnimationFrame(() => input.select())
    }
    cancel() {
      dlog("title/editSession/cancel")
      input.value = this.restoreValue
      this.active = false
      editor.focus()
    }
    commit() {
      dlog("title/editSession/commit")
      this._commit()
      editor.focus()
    }
    end() {
      dlog("title/editSession/end")
      if (this.active) {
        this._commit()
      }
      this.restoreValue = ""
    }
    _commit() {
      // called by commit() when user presses RETURN, or by end() when user relinquish focus
      this.active = false
      if (this.scriptID == editor.currentScript.id) {
        // good, the same script is still active
        editor.currentScript.name = input.value
        editor.currentScript.save() // save immediately
      }
    }
  }

  input.onfocus = () => {
    container.classList.add("focus")
    if (!input.readOnly) {
      editSession.begin()
    }
  }

  input.onblur = () => {
    container.classList.remove("focus")
    editSession.end()
  }

  input.addEventListener("keydown", ev => {
    // dlog("onkeypress", ev.key, ev.keyCode)
    switch (ev.key) {
      case "Escape": editSession.cancel() ; break
      case "Enter":  editSession.commit() ; break
      default: return // let event pass through
    }
    ev.stopPropagation()
    ev.preventDefault()
  }, {capture:true,passive:false})

  // click on outer container focuses input
  input.addEventListener("pointerdown", ev => {
    ev.stopPropagation()
  }, {capture:true,passive:false})
  container.onpointerdown = ev => {
    if (!editSession.active) {
      input.focus()
    }
  }

  // title.onclick = () => menu.toggle(/* closeOnSelection */ true)

  // update title when it was changed elsewhere, like in a different tab
  let updateTitle = () => {
    if (!editor.currentScript) {
      return
    }
    let newTitle = editor.currentScript.name
    if (editSession.active) {
      // when title is actively edited, don't change the value of the input but instead
      // change the "restore" value of editSession
      editSession.restoreValue = newTitle
    } else {
      input.value = newTitle
    }
    input.readOnly = !editor.currentScript.isUserScript
  }
  scriptsData.on("change", updateTitle)
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
