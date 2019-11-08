import { EventEmitter } from "./event"
import { UIInput } from "./ui-input"
import { UIRangeInputInit } from "../common/messages"
import { dlog, hostEnv } from "./util"
import { config } from "./config"

export { UIRangeInputInit }

const captureEvent = {passive:false,capture:true}


interface UIRangeInputEvents {
  "input"  :number
  "change" :number
}

export class UIRangeInput extends EventEmitter<UIRangeInputEvents> implements UIInput<number> {
  el           :HTMLDivElement
  track        :HTMLDivElement
  knob         :HTMLDivElement
  tooltipLabel :HTMLDivElement

  readonly min  :number = 0
  readonly max  :number = 100
  readonly step :number = 0

  readonly _prec  :number = 0  // number of decimals of step
  readonly _scale :number  // user space (= max - min)

  readonly knobSize = 8 // dp; should match css var --rangeKnobSize
  readonly overshoot = Math.round(this.knobSize / 4)  // how much the knob overshoots the track

  // dp of distance to 0% or 100% within where we snap to 0% or 100% on pointerup
  readonly snapThreshold = this.knobSize / 2  // dp

  // trackRect :ClientRect
  readonly minOffset = -this.overshoot
  maxOffset = 0
  displayScale = 1
  dragged = false
  _lastInputTimestamp = 0
  _pointerDownX = 0  // position at last pointerdown event
  _trackPageXOffset = 0 // track offset in page coordinates
  _knobPointerXOffset = 0 // offset knob-to-pointer

  knobX = 0  // current position of knob in display point units
  _value = 0  // scaled value in range [min - max]
  _startValue = 0  // _value at start of pointer session
  _bigJumpTimer :any = null  // timer used by _setKnobX for enabling animation

  constructor(init? :UIRangeInputInit) {
    super()

    let el = this.el = document.createElement("div")
    el.className = "rangeControl uninit"

    let track = this.track = document.createElement("div")
    track.className = "track"
    el.appendChild(track)

    let knob = this.knob = document.createElement("div")
    knob.className = "knob"
    track.appendChild(knob)

    let tooltip = document.createElement("div")
    tooltip.className = "tooltip"
    // tooltip.style.paddingLeft = `${this.overshoot*2}px`
    knob.appendChild(tooltip)
    let tooltipLabel = this.tooltipLabel = document.createElement("div")
    tooltip.appendChild(tooltipLabel)

    if (hostEnv.hasPointerEvents) {
      el.addEventListener("pointerdown", this.onPointerDown, captureEvent)
      el.addEventListener("pointerup", this.onPointerUp, captureEvent)
    } else {
      // Note: Safari <=12 (ships with macOS 10.14) does not have pointer events.
      // Pointer events arrived in Safari 13 (macOS 10.15).
      el.addEventListener("mousedown", this.onPointerDown, captureEvent)
      el.addEventListener("mouseup", this.onPointerUp, captureEvent)
    }

    if (init) {
      if (init.min !== undefined) { this.min = init.min }
      if (init.max !== undefined) { this.max = init.max }
      if (init.step !== undefined) { this.step = Math.abs(init.step) }
      if (init.value !== undefined) {
        this._value = Math.min(this.max, Math.max(this.min, Number(init.value)))
      }
    }
    this._scale = this.max - this.min

    if (this.step == 0) {
      // nice default step. Divvy up the track in 1000 parts
      let x = Math.abs(this._scale) / 1000
      this.step = (
        x < 0.0001 ? 0.0001 :
        x < 0.001 ? 0.001 :
        x < 0.01 ? 0.01 :
        x < 0.1 ? 0.1 :
        1
      )
    } else {
      // step must not be larger than 50% of the scale
      this.step = Math.min(this.step, Math.round(this._scale / 2))
    }

    let prec = (n :number) => {
      let v = (""+n).split(".", 2)
      return v.length == 2 ? v[1].length : 0
    }

    // decimal precision
    this._prec = Math.max(
      prec(this.step),
      prec(this.min),
      prec(this.max)
    )

    tooltipLabel.innerText = this._value.toFixed(this._prec)
  }

  get value() { return this._value }
  set value(v :number) { this.setValue(v) }

  layout() {
    let findPageOffset = (el :HTMLElement) => (
      (el.offsetLeft - el.scrollLeft + el.clientLeft) +
      (el.offsetParent && el.offsetParent !== document.documentElement ?
        findPageOffset(el.offsetParent as HTMLElement) :
        0
      )
    )
    this._trackPageXOffset = findPageOffset(this.track)

    this._knobPointerXOffset = Math.round((this.knobSize + this.knob.clientWidth) / 3)

    this.maxOffset = this.track.clientWidth - (this.knobSize - this.overshoot)
    let vpercent = (this._value - this.min) / this._scale
    let dp = vpercent * (this.maxOffset - this.minOffset)
    this.knobX = dp
    this.knob.style.transform = `translate(${dp}px, 0)`
  }

  onMountDOM() {
    // for some strange reason, we can't measure our element until the next frame...
    requestAnimationFrame(() => {
      this.layout()
      requestAnimationFrame(() => this.el.classList.remove("uninit"))
    })
    config.addListener("change", this.onConfigChange)
  }

  onUnmountDOM() {
    config.removeListener("change", this.onConfigChange)
  }

  onConfigChange = (ev:{key:string}) => {
    const keysAffectingEditorSize = {
      windowSize: 1,
      uiScale: 1,
      showLineNumbers: 1,
      codeFolding: 1,
      menuVisible: 1,
    }
    if (ev.key in keysAffectingEditorSize) {
      this.layout()
    }
  }

  onPointerDown = (ev :PointerEvent) => {
    ev.stopPropagation()
    ev.preventDefault()

    if (hostEnv.hasPointerEvents) {
      this.track.onpointermove = this.onPointerMove
      this.track.setPointerCapture(ev.pointerId)
    } else {
      document.onmousemove = this.onPointerMove
      document.onmouseup = this.onPointerUp
    }

    // this.trackRect = this.track.getBoundingClientRect() as ClientRect
    this.maxOffset = this.track.clientWidth - (this.knobSize - this.overshoot)
    this.displayScale = window.devicePixelRatio || 1
    this.dragged = false
    this._lastInputTimestamp = ev.timeStamp
    this._pointerDownX = this.knobX // knobX BEFORE pointerdown
    this._startValue = this._value

    // let x = ev.offsetX
    // if (ev.target == this.el) {
    //   x = x - this.track.offsetLeft
    // }
    // this.moveKnob(x)

    this.moveKnob(ev)
    this.knob.classList.add("changing")
  }

  onPointerMove = (ev :PointerEvent) => {
    if (!this.dragged) {
      this.dragged = true
      this.knob.classList.add("dragging")
      this.knob.classList.add("dragging-fine")
    }
    this.moveKnob(ev)
    this._lastInputTimestamp = ev.timeStamp
  }

  onPointerUp = (ev :PointerEvent) => {
    if (hostEnv.hasPointerEvents) {
      this.track.onpointermove = null
      this.track.releasePointerCapture(ev.pointerId)
    } else {
      document.onmousemove = null
      document.onmouseup = null
    }
    ev.stopPropagation()
    ev.preventDefault()
    if (this.dragged) {
      this.dragged = false
      this.knob.classList.remove("dragging")
      this.knob.classList.remove("dragging-fine")
    }

    // time since last input
    let timeDelta = ev.timeStamp - this._lastInputTimestamp
    let movementDelta = Math.abs(this._pointerDownX - this.knobX)
    let changedValue = false
    if (timeDelta < 200 && movementDelta >= this.snapThreshold) {
      // snap to extremes if the user moved and released the knob in less than 200ms,
      // and the knob moved more than or equal to snapThreshold.
      if (this.knobX - this.minOffset < this.snapThreshold) {
        // snap knob to 0%
        this.setValue(this.min)
        changedValue = true
      } else if (this.maxOffset - this.knobX < this.snapThreshold) {
        // snap knob to 100%
        this.setValue(this.max)
        changedValue = true
      }
    }
    if (!changedValue) {
      this.moveKnob(ev)
    }

    this.knob.classList.remove("changing")
    if (this._startValue != this._value) {
      this.triggerEvent("change", this._value)
    }
  }

  moveKnob(ev :PointerEvent) {
    let x = Math.min(
      this.maxOffset,
      Math.max(
        this.minOffset,
        // convert: pointer position in page space -> track space
        (ev.pageX - this._trackPageXOffset) - this._knobPointerXOffset
      )
    )

    // convert: track space -> percent [0-1]
    let v = (x - this.minOffset) / (this.maxOffset - this.minOffset)

    // convert: percent -> user space
    this.setValue((v * this._scale) + this.min, ev.shiftKey)
  }

  // setValueUnscaled sets value by unscaled percentage. v should be in the range [0–1]
  // returns true if value was updated
  //
  setValueUnscaled(v :number, snap? :bool) :bool {
    // convert: percent -> user space
    return this.setValue((v * this._scale) + this.min, snap)
  }

  // setValue sets value in current scale. v should be in the range [this.min–this.max)
  // returns true if value was updated
  //
  setValue(value :number, snap? :bool) :bool {
    let prec = this._prec
    if (value != this.max && value != this.min) {
      // round to step (snap=SHIFT -- snap to 10th step)
      let stepinv :number
      if (snap) {
        prec = Math.max(0, this._prec - 1)
        stepinv = 0.1 / this.step
      } else {
        stepinv = 1 / this.step
      }
      value = Math.round(value * stepinv) / stepinv
      value = Math.max(this.min, Math.min(this.max, Number(value.toFixed(this._prec))))
    }

    // skip update if value is identical
    if (this._value == value) {
      return false
    }

    this._value = value

    // update tooltip, rounding number to current step
    // Note: _prec is set in constructor to number of decimals of step
    this.tooltipLabel.innerText = value.toFixed(prec)

    // convert: user value -> percent
    let vp = (value - this.min) / this._scale

    // convert: percent -> track space
    let knobX = (vp * (this.maxOffset - this.minOffset)) + this.minOffset
    this._setKnobX(knobX)

    this.triggerEvent("input", this._value)
    return true
  }

  _setKnobX(dp :number) {  // true if changed
    dp = Math.round(dp * this.displayScale) / this.displayScale  // round to pixels
    if (this.dragged) {
      if (Math.abs(this.knobX - dp) > 10) {
        // big jump
        clearTimeout(this._bigJumpTimer)
        this.knob.classList.remove("dragging-fine")
        this._bigJumpTimer = setTimeout(() => {
          this._bigJumpTimer = null
          this.knob.classList.add("dragging-fine")
        }, 100)
      } else if (this._bigJumpTimer !== null) {
        clearTimeout(this._bigJumpTimer)
        this.knob.classList.add("dragging-fine")
      }
    }
    this.knobX = dp
    this.knob.style.transform = `translate(${dp}px, 0)`
  }
}
