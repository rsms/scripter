//
// UIWindow is a generic moveable and closeable window that can be configured to
// hold any kind of content.
//
import { EL } from "./dom"
import { dlog, print } from "./util"
import { EventEmitter } from "./event"
import { uiresponder } from "./uiresponder"
import app from "./app"


export interface UIWindowConfig {
  x?            :number  // position in parent window. Defaults to center of the parent window.
  y?            :number  // position in parent window. Defaults to center of the parent window.
  width?        :number
  height?       :number
  title?        :string
  preventMove?  :boolean  // if true, window can't be moved by user
  preventClose? :boolean  // if true, window can't be closed by user (no close button)
}


interface UIWindowEvents {
  "move": undefined   // window moved (note: not triggered during live move)
  "resize": undefined // window changed size
  "close": undefined  // window closed
  "focus": undefined  // window's body receives keyboard input (reliable; via uiresponder)
  "blur": undefined   // window's body stopped receiving keyboard input
}


const CAPTURE = {capture:true}
const kZeroClientRect :ClientRect = { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 }


function isPointInClientRect(x :number, y :number, r :ClientRect) :boolean {
  return (
    x >= r.left && x < r.right &&
    y >= r.top && y < r.bottom
  )
}

let idgen = 0
const windowStack = new class UIWindowStack {
  windows :UIWindow[] = []

  _initCalled = false

  _init() {
    this._initCalled = true
    app.addKeyEventHandler(ev => {
      // cmd-w, ctrl-w and alt-F4 -- close window in focus
      if (
        this.windows.length > 0 && (
          ((ev.ctrlKey || ev.metaKey) && ev.key == "w") ||
          (ev.altKey && ev.key == "F4")
        )
      ) {
        const topwin = this.top()
        if (topwin.inFocus) {
          topwin.close()
          return true
        }
      }
    })
  }

  top() :UIWindow|null {
    return this.windows[this.windows.length - 1] || null
  }

  has(w :UIWindow) :boolean {
    for (let win of this.windows) {
      if (win === w) {
        return true
      }
    }
    return false
  }

  add(w :UIWindow) {
    if (!this._initCalled) {
      this._init()
    }
    // dlog(`[windowStack] add ${w}`)
    if (DEBUG) if (this.windows.indexOf(w) != -1) {
      console.warn(`duplicate call to windowStackAdd ${w}`)
      return
    }
    w._setZIndex(this.windows.length)
    this.windows.push(w)
  }

  remove(w :UIWindow) {
    let i = this.windows.indexOf(w)
    // dlog(`[windowStack] remove ${w}  i=${i}`)
    this.windows.splice(i, 1)
    // update zindex of remaining windows above the removed window
    for (; i < this.windows.length; i++) {
      this.windows[i]._setZIndex(i)
    }
    if (this.windows.length == 0) {
      document.body.focus()
    } else if (w.inFocus) {
      this.top().focus()
    }
  }

  focus(w :UIWindow) {
    let topwin = this.top()
    if (topwin === w) {
      // already at top
      return
    }
    // move w to top of stack (end of array)
    let i = this.windows.indexOf(w)
    let len = this.windows.length
    for (let y = i + 1; y < len; ) {
      let w2 = this.windows[y]
      this.windows[i] = w2
      w2._setZIndex(i)
      i++
      y++
    }
    this.windows[i] = w
    w._setZIndex(i)
    // dlog(`[windowStack] is now:\n  ${this.windows.map(w => `${w}`).join("\n  ")}`)
  }
} // windowStack


export class UIWindow extends EventEmitter<UIWindowEvents> {
  static readonly TitleHeight = 24  // keep in sync with app.css

  readonly id          :number = idgen++
  readonly domRoot     :HTMLDivElement
  readonly titlebar    :HTMLDivElement
  readonly title       :HTMLDivElement
  readonly closeButton :HTMLElement|null = null
  readonly body        :HTMLElement
  readonly bodyCover   :HTMLDivElement
  readonly config      :UIWindowConfig
  readonly inFocus     :boolean = false  // true when primary responder (events: "focus", "blur")
  readonly isClosed    :boolean = false

  // internal state
  _x = 0
  _y = 0
  _width = 300
  _height = 200
  _zIndex = 0
  _debugMutationObserver? :MutationObserver


  constructor(body :HTMLElement, config? :UIWindowConfig) {
    super()
    this.config = config || (config = {})
    if (!config.preventClose) {
      this.closeButton = EL("div", { className: "close-button" })
      this.closeButton.onclick = () => { this.close() }
    }
    if (config.width !== undefined) { this._width = Math.round(config.width) }
    if (config.height !== undefined) { this._height = Math.round(config.height) }

    // initial position
    const topwin = windowStack.top()
    this._x = (
      config.x !== undefined ? Math.round(config.x) :
      topwin ? topwin._x + 16 :
      this._centerOnScreenX()
    )
    this._y = (
      config.y !== undefined ? Math.round(config.y) :
      topwin ? topwin._y + 16 :
      this._centerOnScreenY()
    )
    this._clampBounds()
    if (config.x === undefined && this._x < 0) {
      // TODO improve _clampBounds to position a window after limiting its size
      this._x = 0
    }

    this.body = body

    this.domRoot = EL("div",
      {
        className: "UIWindow focus", // note: always starts focused
        tabIndex: "-1", // needed for key focus
        style: {
          transform: `translate3d(${this._x}px,${this._y}px,0)`,
          width:     this._width + "px",
          height:    this._height + "px",
        },
      },
      this.titlebar = EL("div", { className: "titlebar" },
        this.title = EL("div", { className: "title" }, config.title || ""),
        this.closeButton,
      ),
      this.bodyCover = EL("div", { className: "body-cover" }),
      body, // body must be last-child
    )

    windowStack.add(this)

    // Note: We must call _enableMove() before adding titlebar event handlers below
    if (!config.preventMove) {
      this._enableMove()
    }

    uiresponder.addFocusListener(this.body, this._onFocusChange)
    if (this.closeButton) {
      this.closeButton.addEventListener("pointerdown", this._onClosePointerDown, CAPTURE)
    }
    this.titlebar.addEventListener("pointerdown", this._onTitlePointerDown, CAPTURE)
    this.titlebar.addEventListener("pointerup", this._onTitlePointerUp, CAPTURE)

    this.bodyCover.addEventListener("pointerdown", ev => {
      dlog(`${this} click on body-cover => focus`)
      this.focus()
      ev.preventDefault()
      ev.stopPropagation()
    }, CAPTURE)

    document.body.appendChild(this.domRoot)

    this.focus()

    if (DEBUG) if (typeof MutationObserver != "undefined") {
      // detect accidental removal of a window form the DOM, without call to close()
      // Windows needs to be explicitly close()'d so that windowStack etc can be maintained.
      this._debugMutationObserver = new MutationObserver((mutationsList, observer) => {
        for (let m of mutationsList) {
          for (let i = 0; i < m.removedNodes.length; i++) {
            if (m.removedNodes[i] === this.domRoot) {
              console.warn("UIWindow removed from DOM without calling close()")
            }
          }
        }
      })
      this._debugMutationObserver.observe(document, { childList: true, subtree: true })
    }
  }

  _disconnect() {
    uiresponder.removeFocusListener(this.body, this._onFocusChange)
    if (this.closeButton) {
      this.closeButton.removeEventListener("pointerdown", this._onClosePointerDown, CAPTURE)
    }
    this.titlebar.removeEventListener("pointerdown", this._onTitlePointerDown, CAPTURE)
    this.titlebar.removeEventListener("pointerup", this._onTitlePointerUp, CAPTURE)
    if (this._debugMutationObserver) {
      this._debugMutationObserver.disconnect()
      this._debugMutationObserver = undefined
    }
    windowStack.remove(this)
  }


  // position properies
  get x() :number  { return this._x }
  get y() :number  { return this._y }
  set x(x :number) { this.setPosition(x, this._y) }
  set y(y :number) { this.setPosition(this._x, y) }

  // size properties
  get width() :number   { return this._width }
  get height() :number  { return this._height }
  set width(w :number)  { this.setSize(w, this._height) }
  set height(h :number) { this.setSize(this._width, h) }


  setPosition(x :number, y :number) {
    if (!this.config.preventMove) {
      this._setPositionWithEvent(x, y)
    }
  }


  setSize(width :number, height :number) {
    if (this._setSize(width, height)) {
      this.triggerEvent("resize")
    }
  }


  setBounds(x :number, y :number, width :number, height :number) {
    this.setPosition(x, y)
    this.setSize(width, height)
  }


  centerOnScreen() {
    this._setPositionWithEvent(this._centerOnScreenX(), this._centerOnScreenY())
  }


  focus() {
    // [rsms] for some reason that I can't figure out, focus is moved to document's body
    // if we call this.body.focus() once, but moved to the (expected) window's body
    // if we call it twice...
    this.body.focus()
    this.body.focus()
  }


  close() {
    if (!this.isClosed) {
      ;(this as any).isClosed = true
      this._disconnect()
      document.body.removeChild(this.domRoot)
      this.triggerEvent("close")
    }
  }

  toString() {
    return `UIWindow#${this.id}`
  }

  // -----------------------------------------------------
  // rest of class is internal implementation

  _setZIndex(z :number) {
    dlog(`${this} set zindex`, z)
    this._zIndex = z
    this._updateZIndex()
  }

  _updateZIndex() {
    this.domRoot.style.zIndex = String(100 + this._zIndex)
  }

  _setInFocus(inFocus :boolean) {
    dlog(`${this} ${inFocus ? "received" : "lost"} focus`)
    if (this.inFocus == inFocus) {
      return
    }
    ;(this as any).inFocus = inFocus
    if (inFocus) {
      ;(this as any).inFocus = true
      this.triggerEvent("focus")
      windowStack.focus(this)
    } else {
      ;(this as any).inFocus = false
      this.triggerEvent("blur")
    }
    this.domRoot.classList.toggle("focus", this.inFocus)
    this._updateZIndex()
  }

  _onFocusChange = (inFocus :Element, lostFocus: Element, _ :FocusEvent) :void => {
    dlog(`${this} focus changed`, {inFocus, lostFocus})
    this._setInFocus(inFocus === this.body)
  }

  _isPointerDownInTitle = false
  _closeButtonRect :ClientRect = kZeroClientRect  // TODO better prop name

  _onClosePointerDown = (ev :PointerEvent) => {
    // called when pointerdown starts in the close button.
    // Next the _onTitlePointerDown hander will be called which begins a pointer-capture session.
    // During the session, this rect is used to provide hover effect for the close button.
    // When the session ends, this rect is used to determine if the close button was clicked.
    this._closeButtonRect = this.closeButton.getBoundingClientRect()
    this.titlebar.addEventListener("pointermove", this._onTitlePointerMove, CAPTURE)
    ev.preventDefault()
  }

  _onTitlePointerDown = (ev :PointerEvent) => {
    this._isPointerDownInTitle = true
    if (!ev.metaKey && !ev.ctrlKey) {
      this.focus()
    }
    if (this.titlebar.setPointerCapture) {
      this.titlebar.setPointerCapture(ev.pointerId)
    }
    // needed, else browsers changes focus
    ev.preventDefault()
  }

  _onTitlePointerMove = (ev :PointerEvent) => {
    // since we use pointer capture, this is a workaround to get the hover effect on the
    // close button when pointer does:
    // - down on close button
    // - leave
    // - enter close button
    this.closeButton.classList.toggle("active",
      isPointInClientRect(ev.x, ev.y, this._closeButtonRect))
  }

  _onTitlePointerUp = (ev :PointerEvent) => {
    if (this._isPointerDownInTitle) {
      this._isPointerDownInTitle = false
      if (this.titlebar.releasePointerCapture) {
        this.titlebar.releasePointerCapture(ev.pointerId)
      }
      if (isPointInClientRect(ev.x, ev.y, this._closeButtonRect)) {
        this.close()
      } else if (!ev.metaKey && !ev.ctrlKey) {
        this.focus()
      }
      // needed, else browsers changes focus
      ev.preventDefault()
    }
    if (this._closeButtonRect.width > 0) {
      this._closeButtonRect = kZeroClientRect
      this.closeButton.classList.remove("active")
      this.titlebar.removeEventListener("pointermove", this._onTitlePointerMove, CAPTURE)
    }
  }


  _enableMove() {
    let currentX = 0
    let currentY = 0
    let initialX = 0
    let initialY = 0
    let startX = 0
    let startY = 0

    const onpointermove = (e :PointerEvent) => {
      e.preventDefault()
      currentX = e.clientX - initialX
      currentY = e.clientY - initialY
      this._setPosition(currentX, currentY)
    }

    const onpointerdown = (e :PointerEvent) => {
      startX = this._x
      startY = this._y
      initialX = e.clientX - this._x
      initialY = e.clientY - this._y
      if (this.title.setPointerCapture) {
        this.title.setPointerCapture(e.pointerId)
      }
      document.addEventListener("pointermove", onpointermove, {capture:true})
    }

    const onpointerup = (e :PointerEvent) => {
      if (this.title.releasePointerCapture) {
        this.title.releasePointerCapture(e.pointerId)
      }
      document.removeEventListener("pointermove", onpointermove, {capture:true})
      if (startX != this._x || startY != this._y) {
        this.triggerEvent("move")
      }
    }

    this.title.addEventListener("pointerdown", onpointerdown, false)
    this.title.addEventListener("pointerup", onpointerup, false)
  }

  _clampBounds() {
    const minXVisibility = 50
    const maxX = window.innerWidth - minXVisibility
    const maxY = window.innerHeight - UIWindow.TitleHeight
    this._width = Math.min(window.innerWidth - 8, this._width)
    this._height = Math.min(window.innerHeight - 8, this._height)
    this._x = Math.min(maxX, Math.max(-(this._width - minXVisibility), this._x))
    this._y = Math.min(maxY, Math.max(0, this._y))
  }

  _setPosition(x :number, y :number) :boolean {
    const px = window.devicePixelRatio || 1
    x = Math.round(x * px) / px
    y = Math.round(y * px) / px
    let prevx = this._x
    let prevy = this._y
    this._x = x
    this._y = y
    this._clampBounds()
    if (prevx == this._x && prevy == this._y) {
      return false
    }
    this.domRoot.style.transform = `translate3d(${this._x}px, ${this._y}px, 0)`
    return true
  }

  _setSize(width :number, height :number) :boolean {
    let prevWidth = this._width
    let prevHeight = this._height
    this._width = width
    this._height = height
    this._clampBounds()
    if (this._width == prevWidth && this._height == prevHeight) {
      return false
    }
    this.domRoot.style.width  = this._width + "px"
    this.domRoot.style.height = this._height + "px"
    return true
  }

  _setPositionWithEvent(x :number, y :number) {
    if (this._setPosition(x, y)) {
      this.triggerEvent("move")
    }
  }

  _centerOnScreenX() :number {
    return Math.round((window.innerWidth - this._width) * 0.5)
  }
  _centerOnScreenY() :number {
    return Math.round((window.innerHeight - this._height) * 0.4)
  }
}


// // DEBUG show window during development
// setTimeout(function xx() {
//   let e = document.createElement("iframe")
//   e.src = "https://rsms.me/"
//   let w = new UIWindow(e, {
//     x: 40,
//     y: 40,
//     width: 600,
//     height: 500,
//     title: "Worker",
//   })
// }, 1000)
