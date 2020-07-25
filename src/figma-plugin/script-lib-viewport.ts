import { ScriptEnv, scriptenv } from "./scriptenv"

type SViewportAPI = scriptenv.SViewportAPI
type SAnimation = scriptenv.SAnimation
type SAnimationCallback = scriptenv.SAnimationCallback
type SAnimationTimingFunction = scriptenv.SAnimationTimingFunction


interface ViewportState { // opaque to caller
  cx          :number
  cy          :number
  zoom        :number
  autorestore :boolean
}


const viewportProto = {
  __proto__: figma.viewport,

  easeInOutCubic(t :number) :number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  },
}


export function createViewportAPI(env :ScriptEnv, _ign_scriptId :string) :SViewportAPI {

  let initialized = false
  function init() {
    if (!initialized) {
      initialized = true
      env.scripter.addEndCallback(onScriptEnd)
    }
  }

  const savestack :ViewportState[] = []

  function onScriptEnd() {
    // unwind savestack
    let restoreState :ViewportState|null = null
    for (let i = 0; i < savestack.length; i++) {
      let state = savestack[i]
      if (state.autorestore) {
        restoreState = state
        savestack.splice(i,1)
      }
    }
    if (restoreState) {
      viewport.restore(restoreState)
    }
    if (savestack.length > 0) {
      console.warn("viewport.save(false) called without balanced calls to viewport.restore()")
    }
  }

  // Extend figma.ViewportAPI. Note that props in figma.viewport seem to be set without
  // enumerable, so we can't automate this.
  let viewport :any = {
    __proto__: viewportProto,
  }
  Object.defineProperties(viewport, {
    bounds: {
      get() { return figma.viewport.bounds },
    },
    center: {
      get() { return figma.viewport.center },
      set(v :Vector) { figma.viewport.center = v },
    },
    zoom: {
      get() { return figma.viewport.zoom },
      set(v :number) { figma.viewport.zoom = v },
    },
  })

  // ---------------------------
  // Scripter extensions follows

  viewport.set = (center :Vector|null, zoom? :number|null) :void => {
    center && (figma.viewport.center = center)
    if (zoom !== null && zoom !== undefined) {
      figma.viewport.zoom = zoom
    }
  }

  viewport.save = (autorestore :boolean = true) :ViewportState => {
    init()
    const {center, zoom} = figma.viewport
    const state = { zoom, cx:center.x, cy:center.y, autorestore }
    savestack.push(state)
    return state
  }

  function restore(state? :ViewportState|null) :ViewportState|undefined {
    if (state) {
      let i = savestack.indexOf(state)
      if (i != -1) {
        savestack.splice(i, 1)
      }
    } else {
      state = savestack.pop()
    }
    return state
  }

  viewport.restore = (state? :ViewportState|null) => {
    if (state = restore(state)) {
      figma.viewport.zoom = state.zoom
      figma.viewport.center = { x: state.cx, y: state.cy }
    }
  }

  viewport.restoreAnimated = (
    arg0 :ViewportState | null | number | undefined,
    arg1? :number | SAnimationTimingFunction,
    arg2? :SAnimationTimingFunction,
  ) :SAnimation => {
    // 1. (duration? :number, timingf? :SAnimationTimingFunction)
    // 2. (state :SViewportState|null, duration? :number, timingf? :SAnimationTimingFunction)
    let state :ViewportState | null | undefined = null
    let duration :number | undefined = undefined
    let timingf :SAnimationTimingFunction | undefined
    if (arg0 === null || typeof arg0 != "object") {
      // form 1
      duration = arg0 as number
      timingf = arg1 as SAnimationTimingFunction
    } else {
      // form 2
      state = arg0
      duration = arg1 as number
      timingf = arg2
    }
    if (!(state = restore(state))) {
      return env.animate.transition(duration, timingf || null, _ => {})
    }
    return viewport.setAnimated({ x: state.cx, y: state.cy }, state.zoom, duration, timingf)
  }

  viewport.focus = (nodes: ReadonlyArray<BaseNode>|BaseNode) => {
    let nv = Array.isArray(nodes) ? nodes : [nodes]
    figma.viewport.scrollAndZoomIntoView(nv)
  }

  viewport.setSave = (
    center :Vector|null,
    zoom? :number|null,
    autorestore? :boolean,
  ) :ViewportState => {
    let state = viewport.save(autorestore)
    viewport.set(center, zoom)
    return state
  }

  viewport.focusSave = (
    nodes: ReadonlyArray<BaseNode>|BaseNode,
    zoom? :number,
    autorestore? :boolean,
  ) :ViewportState => {
    let state = viewport.save(autorestore)
    viewport.focus(nodes)
    if (zoom !== undefined) {
      figma.viewport.zoom = zoom
    }
    return state
  }

  viewport.setAnimated = (
    center :Vector|null,
    zoom? :number|null,
    duration? :number,
    timingf? :SAnimationTimingFunction,
  ) :SAnimation => {
    let timedur = duration === undefined ? 1.0 : duration

    let zoomstart = figma.viewport.zoom
    let zoomend = typeof zoom == "number" ? zoom : zoomstart

    let centerstart = { ...figma.viewport.center }
    let centerend = center ? { ...center } : centerstart

    return env.animate.transition(timedur, timingf || null, (

      (zoomstart != zoomend && centerstart !== centerend) ? p => {
        figma.viewport.zoom = zoomstart + ((zoomend - zoomstart) * p)
        figma.viewport.center = {
          x: centerstart.x + ((centerend.x - centerstart.x) * p),
          y: centerstart.y + ((centerend.y - centerstart.y) * p),
        }
      } :

      (zoomstart != zoomend) ? p => {
        figma.viewport.zoom = zoomstart + ((zoomend - zoomstart) * p)
      } :

      (centerstart !== centerend) ? p => {
        figma.viewport.center = {
          x: centerstart.x + ((centerend.x - centerstart.x) * p),
          y: centerstart.y + ((centerend.y - centerstart.y) * p),
        }
      } :

      f => _ => {}
    ))
  }

  return viewport
}

