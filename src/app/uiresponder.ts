import { dlog, print } from "./util"

export type UIResponderFocusListener =
  (inFocus :Element, lostFocus: Element, ev :FocusEvent)=>void

export const uiresponder = new class UIResponderInfo {
  readonly current :Element

  _focusListeners = new Map<Element,Set<UIResponderFocusListener>>()

  constructor() {
    this.current = document.activeElement

    // Event handling on the web platform is riddled with complex behavior and legacy.
    // It is not pretty, it is hard to understand and the system has many limitation.
    // This code pays the cost of >=1 frame delay; in return we can detect what focus events
    // are intermediate and which are edge events, events which effectively changes the focus,
    // which is normally what we are interested in.
    // For example, consider a DOM tree like this:
    //
    //   <A>
    //     <B>
    //       <C>   <-- user points to this and presses their pointer
    //
    // We will get notified of focus and blur changes to A, B and C, not just C
    // (assuming all element in this example can become focused.)
    //

    const checkFocus = (ev :FocusEvent) => {
      // dlog("checkFocus")
      const current = document.activeElement
      if (this.current === current) {
        return
      }
      const past = this.current
      ;(this as any).current = current

      // dlog("[uiresponder] focus changed", past, "->", current)

      const listeners1 = this._focusListeners.get(past)
      const listeners2 = this._focusListeners.get(current)
      if (listeners1 || listeners2) {
        // Make a temporary set of listeners
        // This way we can ensure that a given listener is only called once for a change to
        // any of its observed elements.
        const listeners = new Set<UIResponderFocusListener>(listeners1 || listeners2)
        if (listeners1 && listeners2) for (let f of listeners2) {
          listeners.add(f)
        }
        for (let f of listeners) {
          f(current, past, ev)
        }
      }
    }

    window.addEventListener("focus", checkFocus, {capture:true})
    window.addEventListener("blur", checkFocus, {capture:true})
  }

  addFocusListener(element :Element, callback :UIResponderFocusListener) {
    let s = this._focusListeners.get(element)
    if (s) {
      s.add(callback)
    } else {
      this._focusListeners.set(element, new Set<UIResponderFocusListener>([ callback ]))
    }
  }

  removeFocusListener(element :Element, callback :UIResponderFocusListener) {
    let s = this._focusListeners.get(element)
    if (s) {
      s.delete(callback)
    }
  }
}
