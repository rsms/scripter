import { EditorState, ModelChangeFlags } from "./editor"
import { EventEmitter } from "./event"
import { dlog } from "./util"
import { ViewZone, ViewZoneID, InputViewZone } from "./viewzone"
import { config } from "./config"
import * as monaco from "../monaco/monaco"


interface ViewZonesEvents {
  "update": undefined
}


export class ViewZones extends EventEmitter<ViewZonesEvents> {

  readonly editor :EditorState

  lineToZoneId = new Array<ViewZoneID>() // line number => view zone ID
  viewZones = new Map<ViewZoneID,ViewZone>() // view zone ID => view zone
  count :number = 0


  constructor(editor :EditorState) {
    super()
    this.editor = editor
  }


  clearAll() {
    if (this.lineToZoneId.length > 0) {
      this.clear(this.lineToZoneId)
      this.lineToZoneId = []
      this.count = 0
      this.triggerEvent("update")
    }
  }

  clearAllUIInputs() {
    let clearIds :ViewZoneID[] = []
    for (let [viewZoneId, viewZone] of this.viewZones.entries()) {
      if (viewZone instanceof InputViewZone) {
        clearIds.push(viewZoneId)
      }
    }
    if (clearIds.length > 0) {
      this.clear(clearIds)
    }
  }

  clear(ids :Iterable<ViewZoneID>) {
    if (this._clear(ids) > 0) {
      this.triggerEvent("update")
    }
  }

  _clear(ids :Iterable<ViewZoneID>) :number {
    let initCount = this.count
    this.editor.editor.changeViewZones(changeAccessor => {
      for (let id of ids) {
        changeAccessor.removeZone(this._removeZone(id))
      }
    })
    if (initCount > 0 && this.count == 0) {
      this.stopObservingChanges()
    }
    return initCount - this.count
  }

  _removeZone(id :ViewZoneID) :ViewZoneID {
    let viewZone = this.viewZones.get(id)
    if (viewZone) {
      viewZone.onWillRemoveFromEditor()
      this.viewZones.delete(id)
      viewZone.onDidRemoveFromEditor()
      this.count--
    }
    let line = this.lineToZoneId.indexOf(id)
    if (line != -1) {
      delete this.lineToZoneId[line]
    }
    return id
  }


  updateAfterEdit(
    startLine   :number, // first line of change (inclusive)
    startColumn :number, // start column of startLine
    endLine     :number, // last line of change (inclusive)
    endColumn   :number, // end column of endLine
    lineDelta   :number, // number of lines added or removed
    flags       :ModelChangeFlags,
  ) {

    let dirtyEndLine = endLine

    // let cleanStartLine = endLine + 1
    if (flags & ModelChangeFlags.LAST_LINE_INTACT) {
      dirtyEndLine--
      if (flags & ModelChangeFlags.ADD_LINE) {
        // dlog("lines were added to the beginning")
        //
        // Note: Unfortunately Monaco tracks ViewZones in a way where they actually won't
        // move when a logical line shifts.
        //
        // When inserting a linebreak at the beginning of a line, Monaco treats that as
        // "move currentLine[1:] to next line" rather than "move currentLine to next line",
        // and thus Monaco won't move associated ViewZones.
        //
        // So, we move the view zone manually.
        //
        let viewZone = this.viewZones.get(this.lineToZoneId[endLine])
        if (viewZone) {
          this.editor.editor.changeViewZones(changeAccessor => {
            viewZone.moveToLine(viewZone.sourceLine + lineDelta)
            changeAccessor.layoutZone(viewZone.id) // rescan the `afterLineNumber` property
          })
        }
      } else if (flags & ModelChangeFlags.REMOVE_LINE) {
        let viewZone = this.viewZones.get(this.lineToZoneId[startLine])
        // let viewZoneEnd = this.viewZones.get(this.lineToZoneId[endLine])
        // dlog("viewZoneEnd?", !!viewZoneEnd)
        if (viewZone && viewZone.sourceLineLen < startColumn) {
          dirtyEndLine++  // re-balance sub from LAST_LINE_INTACT check above
          if (this.lineToZoneId[endLine] === undefined) {
            // dlog("lines were removed from the end")
            startLine++
          }
          // else: collapsed two view zones -- dirty both
        }
      }
    } else if (flags & ModelChangeFlags.ADD_LINE) {
      let viewZone = this.viewZones.get(this.lineToZoneId[endLine])
      if (viewZone && viewZone.sourceLineLen < startColumn) {
        // dlog("lines were added to the end")
        dirtyEndLine--
        startLine++
      }
    }

    let lineToZoneId2 :ViewZoneID[] = []  // new lineToZoneId mapping
    let rmZoneIds :ViewZoneID[] = []  // zones that were dirtied and will be removed

    // update zones
    let pastStartLine = false
    for (let linestr in this.lineToZoneId) {
      let line = Number(linestr)
      let zoneId = this.lineToZoneId[linestr]

      if (!pastStartLine) {
        if (line < startLine) {
          // line unaffected by change
          // dlog(`updateAfterEdit: keep #${this.lineToZoneId[linestr]} at ${linestr}`)
          lineToZoneId2[linestr] = zoneId
          continue
        }
        pastStartLine = true
      }

      if (line <= dirtyEndLine) {
        // line dirtied by change
        // dlog(`updateAfterEdit: remove #${this.lineToZoneId[linestr]} at ${linestr}`)
        rmZoneIds.push(zoneId)
      } else {
        // line shifted by change
        let sourceLine = line + lineDelta
        // dlog(`updateAfterEdit: shift #${zoneId}  ${line} -> ${sourceLine} at ${linestr}`)
        lineToZoneId2[sourceLine] = zoneId
        let vz = this.viewZones.get(zoneId)
        if (vz) {
          vz.onMovedSourceLine(sourceLine)
        }
      }
    }

    // dlog("lineToZoneId2", lineToZoneId2.map(
    //   (id, line) => `${line} => #${id}`).filter(v => !!v).join(", "))

    // update state
    this.lineToZoneId = lineToZoneId2

    // remove dirty zones
    if (rmZoneIds.length > 0) {
      this.clear(rmZoneIds)
    }
  }


  get(pos :SourcePos) :ViewZone|null {
    return this.viewZones.get(this.lineToZoneId[pos.line]) || null
  }


  set(viewZone :ViewZone) :ViewZoneID {
    return this._set(viewZone, /* replace */true)
  }

  // add adds viewZone only if there's no existing view zone at viewZone.afterLineNumber
  // Returns "" if there is an existing view zone.
  // Return !="" if viewZone was added in which case the number is the viewZoneId.
  //
  add(viewZone :ViewZone) :ViewZoneID {
    return this._set(viewZone, /* replace */ false)
  }


  _set(viewZone :ViewZone, replace :bool) :ViewZoneID {
    let existingViewZoneId = this.lineToZoneId[viewZone.afterLineNumber]
    if (!replace && existingViewZoneId !== undefined) {
      return ""
    }
    let viewZoneId :ViewZoneID = ""
    this.editor.editor.changeViewZones(changeAccessor => {
      if (existingViewZoneId !== undefined) {
        changeAccessor.removeZone(this._removeZone(existingViewZoneId))
        existingViewZoneId = undefined
      }
      viewZone.onWillAddToEditor(this.editor)
      viewZoneId = changeAccessor.addZone(viewZone)
      this.viewZones.set(viewZoneId, viewZone)
      this.lineToZoneId[viewZone.afterLineNumber] = viewZoneId
      viewZone.onDidAddToEditor(viewZoneId)
    })

    this.count++
    this.triggerEvent("update")

    if (this.count == 1) {
      this.startObservingChanges()
    }

    return viewZoneId
  }


  delete(viewZoneId :ViewZoneID) {
    this.clear([viewZoneId])
  }


  onConfigChange = (ev:{key:string}) => {
    if (ev.key == "uiScale") {
      // update layout when uiScale changes
      this.editor.editor.changeViewZones(changeAccessor => {
        for (let viewZone of this.viewZones.values()) {
          viewZone.prepareForLayout()
          changeAccessor.layoutZone(viewZone.id)
        }
      })
    }
  }


  startObservingChanges() {
    this.editor.startObservingChanges()  // note: reference counted
    config.addListener("change", this.onConfigChange)
  }


  stopObservingChanges() {
    this.editor.stopObservingChanges()  // note: reference counted
    config.removeListener("change", this.onConfigChange)
  }


  // // lineNumberForViewZone returns the current effective line number for a view zone.
  // // Returns -1 if the view zone is no longer active.
  // //
  // lineNumberForViewZone(vz :ViewZone) :number {
  //   let lineNumber = vz.afterLineNumber
  //   for (let line in this.lineToZoneId) {
  //     if (this.lineToZoneId[line] == vz.id) {
  //       return parseInt(line)
  //     }
  //   }
  //   return -1
  // }
}
