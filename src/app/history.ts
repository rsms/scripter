import { EventEmitter } from "./event"

interface NavigationHistoryEvents {
  "change": undefined
}

export interface HistoryEntry {}

/* Illustrated example of how NavigationHistory works:

stack  = [].length = 0
cursor = -1

push(A)
   stack  = [
   cursor = 0 = A ].length = 1

push(B)
   stack  = [
            0 = A
 ↓ cursor = 1 = B ].length = 2

push(C)
   stack  = [
            0 = A
            1 = B
 ↓ cursor = 2 = C ].length = 3

back()
   stack  = [
            0 = A
 ↑ cursor = 1 = B
            2 = C ].length = 3

forward()
   stack  = [
            0 = A
            1 = B
 ↓ cursor = 2 = C ].length = 3


*/

export class NavigationHistory<E extends HistoryEntry>
       extends EventEmitter<NavigationHistoryEvents> {

  readonly stack :E[] = []
  cursor = -1  // index in stack of currently active entry

  get currentEntry() :E|undefined { return this.stack[this.cursor] }

  backCount() :number { return this.cursor }
  forwardCount() :number { return this.stack.length - (this.cursor + 1) }
  canGoBack() :boolean { return this.backCount() > 0 }
  canGoForward() :boolean { return this.forwardCount() > 0 }

  goBack() :E {
    if (this.cursor <= 0) {
      throw new Error(`empty history stack`)
    }
    this.cursor--
    this.triggerEvent("change")
    return this.stack[this.cursor]
  }

  goForward() :E {
    if (this.cursor == this.stack.length - 1) {
      throw new Error(`at end of history stack`)
    }
    this.cursor++
    this.triggerEvent("change")
    return this.stack[this.cursor]
  }

  push(e :E) :void {
    this.cursor++
    if (this.stack.length > this.cursor) {
      // user has gone back; there's room
      this.stack[this.cursor] = e
      this.stack.length = this.cursor + 1  // clip length, in case there were many entries
    } else {
      this.stack.push(e)
    }
    this.triggerEvent("change")
  }
}
