//
// index of saved scripts in the current Figma file.
// This index is maintained by the Figma plugin.
//
import { EventEmitter } from "./event"
import { SavedScriptIndexData } from "../common/messages"

interface Events {
  "change": undefined
}

export default new class extends EventEmitter<Events> {
  // This is the index data; scripts which exist in the document.
  index :SavedScriptIndexData = {}  // keyed by GUID

  updateFromPlugin(index: SavedScriptIndexData) {
    this.index = index
    this.triggerEvent("change")
  }

  hasGUID(guid :string) :boolean {
    return guid in this.index
  }
}
