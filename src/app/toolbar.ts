import { editor } from "./editor"
import { menu } from "./menu"
import { scriptsData } from "./script-data"
import { isMac, dlog } from "./util"
import * as warningMessage from "./warning-message"
import savedScripts from "./saved-scripts"


class ToolbarUI {
  el :HTMLElement

  runButton   :HTMLElement
  clearButton :HTMLElement
  menuButton  :HTMLElement
  saveButton  :HTMLElement

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


    // save button
    this.saveButton = this.el.querySelector('.button.save') as HTMLElement
    this.saveButton.addEventListener("click", ev => {
      editor.saveScriptToFigma()
      ev.preventDefault()
      ev.stopPropagation()
    }, {passive:false,capture:true})

    const updateSaveButton = () => {
      // dlog("savedScripts change", {
      //   "editor.currentScript.guid": editor.currentScript && editor.currentScript.guid,
      //   "savedScripts.hasGUID(editor.currentScript.guid)":
      //     savedScripts.hasGUID(editor.currentScript ? editor.currentScript.guid : ""),
      // })
      let scriptIsSaved = editor.currentScript && savedScripts.hasGUID(editor.currentScript.guid)
      this.saveButton.classList.toggle("save", !scriptIsSaved)
      this.saveButton.classList.toggle("saved", scriptIsSaved)
      if (scriptIsSaved) {
        this.saveButton.title = "Saved in Figma"
      } else {
        this.saveButton.title = "Save to Figma file"
      }
    }
    scriptsData.on("change", updateSaveButton)
    savedScripts.on("change", updateSaveButton)


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
    switch (ev.key) {
      case "Escape": editSession.cancel() ; break
      case "Enter":  editSession.commit() ; break
      default: dlog("onkeypress", ev.key, ev.keyCode) ; return
    }
    ev.stopPropagation()
    ev.preventDefault()
  }, {capture:true,passive:false})

  input.addEventListener("pointerdown", ev => {
    ev.stopPropagation()
  }, {capture:true,passive:false})
  container.onpointerdown = ev => {
    if (!editSession.active) {
      input.focus()
    }
  }

  // title.onclick = () => menu.toggle(/* closeOnSelection */ true)

  let updateTitle = () => {
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
