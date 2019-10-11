import { EventEmitter } from "./event"
import { UIInput } from "./ui-input"
import { UIRangeInputInit } from "../common/messages"
import { dlog } from "./util"

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
  readonly _scale :number
  readonly _prec  :number = 0

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

  knobX = 0  // current position of knob in display point units
  _value = 0  // scaled value

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

    el.addEventListener("pointerdown", this.onPointerDown, captureEvent)
    el.addEventListener("pointerup", this.onPointerUp, captureEvent)

    if (init) {
      if ("min" in init) { this.min = init.min }
      if ("max" in init) { this.max = init.max }
      if ("step" in init) { this.step = init.step }
      if ("value" in init) {
        this._value = Math.min(this.max, Math.max(this.min, Number(init.value)))
      }
    }
    this._scale = this.max - this.min

    if (this.step == 0) {
      // nice default step.
      // 0-0.1 => 0.001
      // 0-1   => 0.01
      // 0-10  => 0.1
      // 0-100 => 1
      let x = Math.abs(this._scale) / 100
      let m = (
        x < 0.01 ? 1000 :
        100
      )
      this.step = Math.min(1, Math.round(x * m) / m)
    }

    let changecount = 0
    var observer = new MutationObserver((mutationsList, observer) => {
      if (document.body.contains(this.el)) {
        if (++changecount == 2) {
          // 2 since it's first added to a hidden div to be measured
          this.initDOM()
          observer.disconnect()
        }
      }
    })
    observer.observe(document.querySelector(".monaco-editor"), {
      childList: true,
      subtree: true,
    })

    // TODO: update knob position when size of element changes

    if (Math.round(this.step) != this.step) {
      this._prec = String(this.step).split(".", 2)[1].length
    }

    tooltipLabel.innerText = this._value.toFixed(this._prec)
  }

  get value() { return this._value }
  // TODO: set value(v :number) { ... }

  initDOM() {
    this.maxOffset = this.track.clientWidth - (this.knobSize - this.overshoot)
    let vpercent = (this._value - this.min) / this._scale
    let dp = vpercent * (this.maxOffset - this.minOffset)
    this.knobX = dp
    this.knob.style.transform = `translate(${dp}px)`
    requestAnimationFrame(() => this.el.classList.remove("uninit"))
  }

  onPointerDown = (ev :PointerEvent) => {
    ev.stopPropagation()
    ev.preventDefault()
    this.track.onpointermove = this.onPointerMove
    this.track.setPointerCapture(ev.pointerId)

    // this.trackRect = this.track.getBoundingClientRect() as ClientRect
    this.maxOffset = this.track.clientWidth - (this.knobSize - this.overshoot)
    this.displayScale = window.devicePixelRatio || 1
    this.dragged = false
    this._lastInputTimestamp = ev.timeStamp
    this._pointerDownX = this.knobX // knobX BEFORE pointerdown

    let x = ev.offsetX
    if (ev.target == this.el) {
      x = x - this.track.offsetLeft
    }
    this.moveKnob(x)
    this.knob.classList.add("changing")
  }

  onPointerMove = (ev :PointerEvent) => {
    if (!this.dragged) {
      this.dragged = true
      this.knob.classList.add("dragging")
    }
    this.moveKnob(ev.offsetX)
    this._lastInputTimestamp = ev.timeStamp
  }

  onPointerUp = (ev :PointerEvent) => {
    this.track.onpointermove = null
    this.track.releasePointerCapture(ev.pointerId)
    ev.stopPropagation()
    ev.preventDefault()
    if (this.dragged) {
      this.dragged = false
      this.knob.classList.remove("dragging")
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
        this._setKnobX(this.minOffset)
        changedValue = true
      } else if (this.maxOffset - this.knobX < this.snapThreshold) {
        // snap knob to 100%
        this._setKnobX(this.maxOffset)
        changedValue = true
      }
    }
    if (!changedValue) {
      let x = ev.offsetX
      if (ev.target == this.el) {
        x = x - this.track.offsetLeft
      }
      this.moveKnob(x)
    }

    this.knob.classList.remove("changing")
    this.triggerEvent("change", this._value)
  }

  moveKnob(x :number) {
    x = x - this.knobSize / 2
    x = Math.min(this.maxOffset, Math.max(this.minOffset, x))
    x = Math.round(x * this.displayScale) / this.displayScale  // round to pixels
    if (this._setKnobX(x)) {
      this.triggerEvent("input", this._value)
    }
  }

  _setKnobX(dp :number) :boolean {  // true if changed
    this.knobX = dp
    this.knob.style.transform = `translate(${dp}px)`
    let value = (
      this.min + (
        ( (dp - this.minOffset) / (this.maxOffset - this.minOffset) ) * this._scale
      )
    )
    let str = value.toFixed(this._prec)
    value = parseFloat(str)
    if (this._value != value) {
      this._value = value
      this.tooltipLabel.innerText = str
      return true
    }
    return false
  }
}
