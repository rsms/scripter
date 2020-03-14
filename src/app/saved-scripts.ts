//
// index of saved scripts in the current Figma file.
// This index is maintained by the Figma plugin.
//
import { EventEmitter } from "./event"

// This is the index data. A set of script GUIDs which exist in the document.
let knownGuids = new Set<string>()

interface Events {
  "change": undefined
}

export default new class extends EventEmitter<Events> {
  updateGUIDs(guids: Iterable<string>) {
    knownGuids = new Set<string>(guids)
    this.triggerEvent("change")
  }

  hasGUID(guid :string) :boolean {
    return knownGuids.has(guid)
  }
}
