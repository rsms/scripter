import { EditorState } from "./editor"
import { EventEmitter } from "./event"
import * as monaco from "monaco-editor"


interface MsgZonesEvents {
  "update": undefined
}

export class MsgZones extends EventEmitter<MsgZonesEvents> {

  readonly editor :EditorState

  // msgZones = new Map<number,number>() // line number => view zone ID
  msgZones = new Array<number>() // line number => view zone ID
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

  _clear(ids :Iterable<number>) :number {
    let initCount = this.count
    this.editor.editor.changeViewZones(changeAccessor => {
      for (let id of ids) {
        let i = this.msgZones.indexOf(id)
        changeAccessor.removeZone(id)
        if (i != -1) {
          delete this.msgZones[i]
          this.count--
        }
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


  set(pos :SourcePos, messageHtml :string) :number {
    if (pos.line < 1) {
      return -1
    }

    let lineOffset = 0 // set to -1 to have it appear above pos.line

    let existingViewZoneId = this.msgZones[pos.line]
    let viewZoneId :number = -1

    this.editor.editor.changeViewZones(changeAccessor => {
      if (existingViewZoneId !== undefined) {
        changeAccessor.removeZone(existingViewZoneId)
        existingViewZoneId = undefined
      }

      let domNode = document.createElement('div')
      domNode.className = "printWidget"

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

      // let textEl = document.createElement('p')
      // textEl.innerText = message
      // textEl.className = "message monospace"
      // mainEl.appendChild(textEl)

      let textEl = document.createElement('p')
      textEl.className = "message monospace"
      textEl.innerHTML = messageHtml
      mainEl.appendChild(textEl)

      let inlineButtonEl :HTMLElement|null = null
      if (messageHtml != "") {
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
      let heightInPx = 16  // minimum height
      let domNode2 = domNode.cloneNode(true)
      this.editor.editor.getDomNode().appendChild(domNode2)
      heightInPx = Math.max(heightInPx, (domNode2 as any).querySelector('.message').clientHeight)
      this.editor.editor.getDomNode().removeChild(domNode2)

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

        let insertMessage = "\n" + messageHtml
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

      this.msgZones[pos.line] = viewZoneId
    })

    this.editor.startObservingChanges()

    this.count++
    this.triggerEvent("update")

    return viewZoneId
  }
}
