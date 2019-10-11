import { EditorState } from "./editor"
import { EventEmitter } from "./event"
import { dlog } from "./util"
import * as monaco from "monaco-editor"


interface MsgZonesEvents {
  "update": undefined
}


export enum MsgZoneType {
  PRINT = 0,
  INPUT = 1,
}

const kMsgZoneType = Symbol("kMsgZoneType")


export class MsgZones extends EventEmitter<MsgZonesEvents> {

  readonly editor :EditorState

  // msgZones = new Map<number,number>() // line number => view zone ID
  msgZones = new Array<number>() // line number => view zone ID
  viewZones = new Map<number,monaco.editor.IViewZone>() // view zone ID => view zone
  count :number = 0


  constructor(editor :EditorState) {
    super()
    this.editor = editor
  }


  clearAll() {
    if (this.msgZones.length > 0) {
      this.clear(this.msgZones)
      this.msgZones = []
      this.count = 0
      this.triggerEvent("update")
    }
  }

  clearAllUIInputs() {
    let clearIds :number[] = []
    for (let [viewZoneId, viewZone] of this.viewZones.entries()) {
      let type = viewZone[kMsgZoneType] as MsgZoneType
      if (type == MsgZoneType.INPUT) {
        clearIds.push(viewZoneId)
      }
    }
    if (clearIds.length > 0) {
      this.clear(clearIds)
    }
  }

  _clear(ids :Iterable<number>) :number {
    let initCount = this.count
    this.editor.editor.changeViewZones(changeAccessor => {
      for (let id of ids) {
        changeAccessor.removeZone(id)
        this._onRemoveViewZone(id)
      }
    })
    return initCount - this.count
  }

  clear(ids :Iterable<number>) {
    if (this._clear(ids) > 0) {
      this.triggerEvent("update")
    }
  }


  updateAfterEdit(
    startLine :number,  // first line of change (inclusive)
    endLine :number,    // last line of change (inclusive)
    lineCount :number,  // total number of lines
    lineDelta :number,  // number of lines added or removed
  ) {
    // remove zones within changed lines
    let msgZonesToBeRemoved = new Set<number>()
    for (let line = startLine; line <= endLine; line++) {
      if (line in this.msgZones) {
        let zoneId = this.msgZones[line]
        msgZonesToBeRemoved.add(zoneId)
      }
    }
    this.clear(msgZonesToBeRemoved)

    // offset zones after changed lines
    let msgZones2 :number[] = []
    let count = 0
    // first, copy unaffected zones
    for (let line = 0; line < startLine; line++) {
      let zoneId = this.msgZones[line]
      if (zoneId !== undefined && !msgZonesToBeRemoved.has(zoneId)) {
        msgZones2[line] = zoneId
        count++
      }
    }
    // then, copy offset zones
    for (let line = startLine; line < lineCount; line++) {
      let zoneId = this.msgZones[line]
      if (zoneId !== undefined && !msgZonesToBeRemoved.has(zoneId)) {
        msgZones2[line + lineDelta] = zoneId
        count++
      }
    }
    this.msgZones = msgZones2
    this.count = count
  }


  _measureEl :HTMLElement|null = null

  measureHTMLElement(el :HTMLElement) :{width:number, height:number} {
    if (!this._measureEl) {
      let edel = this.editor.editor.getDomNode()
      let div = this._measureEl = document.createElement("div")
      div.style.position = "absolute"
      div.style.visibility = "hidden"
      div.style.pointerEvents = "none"
      edel.appendChild(div)
    }
    if (this._measureEl.children.length > 0) {
      this._measureEl.innerText = ""
    }
    let position = el.style.position
    el.style.position = "absolute"
    this._measureEl.appendChild(el)
    let size = { width: el.clientWidth, height: el.clientHeight }
    this._measureEl.removeChild(el)
    el.style.position = position
    return size
  }


  get(pos :SourcePos) :monaco.editor.IViewZone|null {
    return this.viewZones.get(this.msgZones[pos.line]) || null
  }


  _onRemoveViewZone(id :number) {
    let viewZone = this.viewZones.get(id)
    if (viewZone) {
      this.viewZones.delete(id)
      if ((viewZone as any).onRemoveViewZone) {
        (viewZone as any).onRemoveViewZone()
      }
    }
    let line = this.msgZones.indexOf(id)
    if (line != -1) {
      delete this.msgZones[line]
      this.count--
    }
  }


  set(pos :SourcePos, html :string|HTMLElement, type :MsgZoneType) :number {
    if (pos.line < 1) {
      return -1
    }

    let lineOffset = 0 // set to -1 to have it appear above pos.line

    let existingViewZoneId = this.msgZones[pos.line]
    let viewZoneId :number = -1

    this.editor.editor.changeViewZones(changeAccessor => {
      if (existingViewZoneId !== undefined) {
        this._onRemoveViewZone(existingViewZoneId)
        changeAccessor.removeZone(existingViewZoneId)
        existingViewZoneId = undefined
      }

      let domNode = document.createElement('div')
      domNode.className = "inlineWidget " + (
        type == MsgZoneType.PRINT ? "printWidget" :
        type == MsgZoneType.INPUT ? "inputWidget" :
        ""
      )

      // let heightInLines = message.split("\n").length
      // if (heightInLines < 2) {
      //   if (message.length > 40) {
      //     // make room for wrapping text
      //     heightInLines = 2
      //   } else {
      //     domNode.className += " small"
      //   }
      // }

      let mainEl = document.createElement('div')
      domNode.appendChild(mainEl)

      let textEl :HTMLElement|null = null
      let inlineButtonEl :HTMLElement|null = null

      if (typeof html == "string") {
        textEl = document.createElement('p')
        textEl.className = "message monospace"
        textEl.innerHTML = html
        mainEl.appendChild(textEl)

        if (html != "") {
          inlineButtonEl = document.createElement('div')
          inlineButtonEl.innerText = "+"
          inlineButtonEl.title = "Add to script as code"
          inlineButtonEl.className = "button inlineButton sansSerif"
          mainEl.appendChild(inlineButtonEl)
        }
      } else {
        mainEl.appendChild(html)
      }

      let closeButtonEl = document.createElement('div')
      closeButtonEl.innerText = "✗"
      closeButtonEl.title = "Dismiss"
      closeButtonEl.className = "button closeButton sansSerif"
      mainEl.appendChild(closeButtonEl)

      // compute actual height, as text may wrap
      let heightInPx = 16  // minimum height
      heightInPx = Math.max(heightInPx, this.measureHTMLElement(domNode).height - 2)

      // let domNode2 = domNode.cloneNode(true)
      // this.editor.editor.getDomNode().appendChild(domNode2)
      // heightInPx = Math.max(heightInPx, (domNode2 as any).querySelector('.message').clientHeight)
      // this.editor.editor.getDomNode().removeChild(domNode2)

      heightInPx += 2

      let viewZone :monaco.editor.IViewZone = {
        afterLineNumber: pos.line + lineOffset,
        heightInPx,
        domNode,
      }
      viewZone[kMsgZoneType] = type
      viewZoneId = changeAccessor.addZone(viewZone)
      this.viewZones.set(viewZoneId, viewZone)

      closeButtonEl.addEventListener('click', ev => {
        ev.preventDefault()
        ev.stopPropagation()
        this.editor.editor.focus()
        this.clear([viewZoneId])
      }, {passive:false, capture:true})

      const addAsCode = () => {
        this.editor.editor.focus()

        // find current line number for viewZoneId (might have been adjusted since creation)
        let lineNumber = pos.line
        for (let line in this.msgZones) {
          if (this.msgZones[line] == viewZoneId) {
            lineNumber = parseInt(line)
          }
        }

        lineNumber += lineOffset

        this.clear([viewZoneId])

        let insertMessage = "\n" + (html as string)
        let spaces = "                                                                            "
        if (pos.column > 1) {
          insertMessage = insertMessage.replace(/\n/g, "\n" + spaces.substr(0, pos.column))
        }

        let newSelection = new monaco.Selection(
          lineNumber + 1, pos.column + 1,
          lineNumber + insertMessage.split("\n").length - 1, 9999
        )

        let sel = this.editor.currentModel.pushEditOperations(
          // beforeCursorState: Selection[],
          // [new monaco.Selection(lineNumber, pos.column, lineNumber, pos.column)],
          this.editor.editor.getSelections(),

          [{ // editOperations: IIdentifiedSingleEditOperation[],
            range: new monaco.Range(lineNumber,999,lineNumber,999),
            text: insertMessage,
            // This indicates that this operation has "insert" semantics:
            forceMoveMarkers: true
          }],

          // A callback that can compute the resulting cursors state after some edit
          // operations have been executed.
          (inverseEditOperations: monaco.editor.IIdentifiedSingleEditOperation[]) => {
            // let sel = this.editor.editor.getSelection()
            // if (!sel.isEmpty()) {
            //   // don't change selection that is not empty
            //   return null
            // }
            return [newSelection]
          },
          // cursorStateComputer: ICursorStateComputer
        )

        setTimeout(() => { this.editor.editor.setSelection(newSelection) },1)
      }

      if (inlineButtonEl) {
        textEl!.addEventListener('dblclick', ev => {
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

      this.msgZones[pos.line] = viewZoneId
    })

    this.editor.startObservingChanges()

    this.count++
    this.triggerEvent("update")

    return viewZoneId
  }
}
