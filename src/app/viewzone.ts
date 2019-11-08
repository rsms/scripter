import { dlog } from "./util"
import { EventEmitter } from "./event"
import * as monaco from "../monaco/monaco"
import { EditorState } from "./editor"
import { UIInput } from "./ui-input"
import { UIInputResponseMsg } from "../common/messages"


export type ViewZoneID = string


const kViewZoneDOMObserver = Symbol("kViewZoneDOMObserver")
type DomMountQueue = { el :HTMLElement, callback():void }[]

function registerDOMMountCallback(editor :EditorState, el :HTMLElement, callback :()=>void) {
  if (document.body.contains(el)) {
    callback()
  }
  var ent = editor[kViewZoneDOMObserver] as [DomMountQueue, MutationObserver]|null
  if (ent) {
    ent[0].push({el, callback})
    return
  }
  let queue :DomMountQueue = [ {el, callback} ]
  let changecount = 0
  var observer = new MutationObserver((mutationsList, observer) => {
    for (let i = 0; i < queue.length; ) {
      let e = queue[i]
      if (document.body.contains(e.el)) {
        e.callback()
        queue.splice(i, 1)
        continue
      }
      i++
    }
    if (queue.length == 0) {
      observer.disconnect()
      editor[kViewZoneDOMObserver] = null
    }
  })
  let viewZonesEl = editor.editor.getDomNode().querySelector(".view-zones")
  observer.observe(viewZonesEl, {
    childList: true,
    subtree: true,
  })
  ent = [queue, observer]
  editor[kViewZoneDOMObserver] = ent
}



export enum ViewZoneType {
  GENERIC = 0,
  PRINT = 1,
  INPUT = 2,
}

const kViewZoneType = Symbol("kViewZoneType")

interface ViewZoneEvents {
  "add"    :EditorState
  "remove" :undefined
}

export class ViewZone extends EventEmitter<ViewZoneEvents> implements monaco.editor.IViewZone {
  readonly id            :ViewZoneID = ""
  readonly containerEl   :HTMLDivElement  // element containing contentEl and buttonsEl
  readonly contentEl     :HTMLDivElement
  readonly buttonsEl     :HTMLDivElement
  readonly editor        :EditorState|null = null  // non-null when in editor
  readonly sourceLine    :number = -1  // current effective line number in the editor
  readonly sourceLineLen :number = 1   // length of source line

  // IViewZone interface
  domNode           :HTMLElement
  suppressMouseDown :boolean = false
  afterLineNumber   :number  // Note: Use sourceLine instead when reading the value.
  heightInPx        :number
  // afterColumn?       :number
  // heightInLines?     :number
  // minWidthInPx?      :number
  // marginDomNode?     :HTMLElement | null


  constructor(afterLineNumber :number, className? :string) {
    super()
    this.sourceLine = this.afterLineNumber = afterLineNumber || 0

    let domNode = this.domNode = document.createElement('div')
    domNode.className = "inlineWidget"
    if (className) {
      domNode.className += " " + className
    }

    // let heightInLines = message.split("\n").length
    // if (heightInLines < 2) {
    //   if (message.length > 40) {
    //     // make room for wrapping text
    //     heightInLines = 2
    //   } else {
    //     domNode.className += " small"
    //   }
    // }

    // container
    let containerEl = this.containerEl = document.createElement('div')
    domNode.appendChild(containerEl)

    // content
    this.contentEl = document.createElement('div')
    this.contentEl.className = "content"
    containerEl.appendChild(this.contentEl)

    // buttons
    this.buttonsEl = document.createElement('div')
    this.buttonsEl.className = "buttons"
    containerEl.appendChild(this.buttonsEl)

    let closeButtonEl = document.createElement('div')
    closeButtonEl.innerText = "✗"
    closeButtonEl.title = "Dismiss"
    closeButtonEl.className = "button closeButton sansSerif"
    closeButtonEl.addEventListener('click', ev => {
      ev.preventDefault()
      ev.stopPropagation()
      this.removeFromEditor()
    }, {passive:false, capture:true})
    this.buttonsEl.appendChild(closeButtonEl)
  }

  // removeFromEditor removes this viewZone from the editor it is attached to.
  //
  removeFromEditor() {
    if (this.editor) {
      let editor = this.editor  // must ref to access after call to delete
      editor.viewZones.delete(this.id)
      editor.editor.focus()
    }
  }

  moveToLine(line :number) {
    if (line == this.afterLineNumber) {
      return
    }
    this.afterLineNumber = line
    ;(this as any).sourceLine = line
  }

  // prepareForLayout is called when a view zone is about layout in response to a change
  // to for instance uiScale. This doesn't happen often (normally never.)
  //
  prepareForLayout() {
    this.afterLineNumber = this.sourceLine // copy; conceptually same value
    let tmpNode = this.domNode.cloneNode(true) as HTMLElement
    tmpNode.style.height = "auto"
    let size = this.editor.measureHTMLElement(tmpNode)
    this.heightInPx = Math.max(16, size.height)
  }

  onWillAddToEditor(editor :EditorState) {
    ;(this as any).editor = editor
    ;(this as any).sourceLine = this.afterLineNumber  // copy; conceptually same value
    let size = this.editor.measureHTMLElement(this.domNode)
    this.heightInPx = Math.max(16, size.height)
    this.onWillMount()
  }

  onDidAddToEditor(id :ViewZoneID) {
    ;(this as any).id = id
    // if (DEBUG) {
    //   this.contentEl.appendChild(document.createTextNode(` #${id}`))
    // }
    this._updateSourceLineLen()
    this.triggerEvent("add", this.editor)
  }

  onWillRemoveFromEditor() {
    this.onWillUnmount()
  }

  onDidRemoveFromEditor() {
    ;(this as any).id = ""
    ;(this as any).editor = null
    ;(this as any).sourceLine = -1
    this.triggerEvent("remove")
    this.onDidUnmount()
    // remove all listeners since this object is now dead
    this.removeAllListeners()
  }

  onMovedSourceLine(sourceLine :number) {
    let oldSourceLine = this.sourceLine
    ;(this as any).sourceLine = sourceLine
    this._updateSourceLineLen()
    // dlog(`ViewZone.onMovedSourceLine ${oldSourceLine} -> ${sourceLine}`)
  }

  _updateSourceLineLen() {
    try {
      ;(this as any).sourceLineLen = this.editor.currentModel.getLineLength(this.sourceLine)
    } catch(e) {
      console.warn(`[scripter/ViewZone._updateSourceLineLen] Model.getLineLength: ${e.stack||e}`)
      ;(this as any).sourceLineLen = 1
    }
  }

  // Callback which gives the relative top of the view zone as it appears
  // (taking scrolling into account).
  // onDomNodeTop(top :number) {
  //   dlog("onDomNodeTop", top)
  // }

  // onComputedHeight is part of the IViewZone interface; a Monaco callback which gives
  // the height in pixels of the view zone.
  // We use this to get a callback for when the element was actually added to the DOM.
  // Note: Since we set height explicitly, we can ignore the height value.
  onComputedHeight(_height :number) {
    registerDOMMountCallback(this.editor, this.domNode, () => {
      this.domNode.style.width = null
      this.onDidMount()
    })
  }

  // high-level DOM callbacks, replaceable by subclasses.

  // onWillMount is called before the ViewZone is introduced in the DOM.
  // .heightInPx is set as well as .editor and .sourceLine
  onWillMount() {}

  // onDidMount is called just after the ViewZone was introduced in the DOM.
  onDidMount() {}

  // onWillUnmount is called just before the ViewZone is removed from the DOM.
  onWillUnmount() {}

  // onDidUnmount is called just after the ViewZone was removed from the DOM.
  onDidUnmount() {}
}

// -----------------------------------------------------------------------------------------------

export class PrintViewZone extends ViewZone {
  readonly pos         :SourcePos
  readonly messageHtml :string

  constructor(pos :SourcePos, messageHtml :string) {
    super(pos.line, "printWidget")

    this.pos = pos
    this.messageHtml = messageHtml

    this.contentEl.className += " message monospace"
    this.contentEl.innerHTML = messageHtml

    if (messageHtml != "") {
      let inlineButtonEl = document.createElement('div')
      inlineButtonEl.innerText = "+"
      inlineButtonEl.title = "Add to script as code"
      inlineButtonEl.className = "button inlineButton sansSerif"

      inlineButtonEl.addEventListener('click', ev => {
        ev.stopPropagation()
        ev.preventDefault()
        this.addAsCode()
      }, {passive:false, capture:true})

      this.buttonsEl.appendChild(inlineButtonEl)
    }
  }


  addAsCode() {
    if (!this.editor) {
      return
    }

    let editor = this.editor  // must ref since removeFromEditor clears this.editor
    let lineNumber = this.sourceLine
    this.removeFromEditor()

    let insertMessage = "\n" + this.messageHtml
    let spaces = "                                                                            "
    if (this.pos.column > 1) {
      insertMessage = insertMessage.replace(/\n/g, "\n" + spaces.substr(0, this.pos.column))
    }

    let newSelection = new monaco.Selection(
      lineNumber + 1, this.pos.column + 1,
      lineNumber + insertMessage.split("\n").length - 1, 9999
    )

    let sel = editor.currentModel.pushEditOperations(
      // beforeCursorState: Selection[],
      // [new monaco.Selection(lineNumber, this.pos.column, lineNumber, this.pos.column)],
      editor.editor.getSelections(),

      [{ // editOperations: IIdentifiedSingleEditOperation[],
        range: new monaco.Range(lineNumber,999,lineNumber,999),
        text: insertMessage,
        // This indicates that this operation has "insert" semantics:
        forceMoveMarkers: true
      }],

      // A callback that can compute the resulting cursors state after some edit
      // operations have been executed.
      (inverseEditOperations: monaco.editor.IIdentifiedSingleEditOperation[]) => {
        // let sel = editor.editor.getSelection()
        // if (!sel.isEmpty()) {
        //   // don't change selection that is not empty
        //   return null
        // }
        return [newSelection]
      },
      // cursorStateComputer: ICursorStateComputer
    )

    setTimeout(() => { editor.editor.setSelection(newSelection) },1)
  }
}

// -----------------------------------------------------------------------------------------------

export class InputViewZone extends ViewZone {
  readonly input :UIInput

  value         :any
  sendTimer     :any = null
  lastSentValue :any = undefined
  done          :boolean = false
  nextResolver  :InputResolver|null = null

  constructor(afterLineNumber :number, input :UIInput) {
    super(afterLineNumber, "inputWidget")
    this.input = input
    this.contentEl.appendChild(input.el)
    this.value = this.input.value
  }


  onDidMount() {
    this.input.on("change", this.onInputChange)  // triggered only when changes to an input commit
    this.input.on("input", this.onInputInput) // triggered continously as the input changes
    this.input.onMountDOM()
  }


  onDidUnmount() {
    this.input.onUnmountDOM()
    this.input.removeListener("change", this.onInputChange)
    this.input.removeListener("input", this.onInputInput)
    this.done = true
    this.sendValue()
  }


  onInputInput = (value :any) => {
    this.value = value
    if (this.sendTimer === null) {
      this.sendValue()
      this.sendTimer = setTimeout(() => this.sendValue(), 1000/30)
    }
  }


  onInputChange = (value :any) => {
    this.value = value
    this.sendValue()
  }


  sendValue() {
    clearTimeout(this.sendTimer) ; this.sendTimer = null
    // dequeue next resolver
    if (this.done || (this.nextResolver && this.value !== this.lastSentValue)) {
      this.lastSentValue = this.value
      if (this.nextResolver) {
        this.nextResolver({ value: this.lastSentValue, done: this.done })
        this.nextResolver = null
      }
    }
  }


  enqueueResolver(resolver :InputResolver) {
    if (this.nextResolver) {
      console.warn("[scripter] enqueueResolver while this.nextResolver != null")
      // let prevResolver = this.nextResolver
      // let nextResolver = resolver
      // resolver = (msg:Omit<UIInputResponseMsg,"id"|"type">) => {
      //   prevResolver(msg)
      //   nextResolver(msg)
      // }
      this.nextResolver({ value: this.lastSentValue, done: this.done })
    }
    this.nextResolver = resolver
  }
}


export type InputResolver = (msg:Omit<UIInputResponseMsg,"id"|"type">)=>void

