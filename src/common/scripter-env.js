// This library exports a single function:
//    function evalScript(reqId :string, js :string) :Promise<any>
//
// evalScript executes a script in the scripter environment.
//
// Note: scripter-env.d.ts is not the definition file for the API of this library,
// but the definitions of the environment of a script.
//
const evalScript = (function(){


function _assertFailure(args) {
  let e = new Error(args.length > 0 ? args.join(", ") : "assertion failed")
  e.name = "AssertionError"
  throw e
}

function assert(condition) {
  if (!condition) {
    // separating the handler from the test may allow a JS compiler to inline the test
    _assertFailure([].slice.call(arguments))
  }
}

// const print = console.log.bind(console)

function _print(reqId, args) {
  console.log.apply(console, args)
  let msg = { // PrintMsg
    type: "print",
    args: args,
    reqId: reqId,
    srcPos: {line:0,column:0},
    srcLineOffset: evalScript.lineOffset,
  }

  let e = new Error()
  let m = (e.stack.split("\n")[3] || "").match(/:(\d+):(\d+)\)$/)
  if (m) {
    let line = parseInt(m[1])
    let column = parseInt(m[2])
    msg.srcPos = {
      line: isNaN(line) ? 0 : line,
      column: isNaN(column) ? 0 : column,
    }
  }
  figma.ui.postMessage(msg)
}

// ------------------------------------------------------------------------------------------

const _unavail = (name, msg) => () => {
  let e = new Error(name + " is unavailable in Scripter" + (msg ? ". " + msg : ""))
  e.name = "ScripterError"
  throw e
}

const ui = {
  show:   _unavail("ui.show"),
  hide:   _unavail("ui.hide"),
  resize: _unavail("ui.resize"),
  close:  _unavail("ui.close"),
  postMessage: _unavail("postMessage"),
  get onmessage() { return undefined },
  set onmessage(_) { _unavail("ui.onmessage") },
}

// "figma" object with some features disabled or shimmed.
// This is the object that's exposed as "figma" in a script.
const figmaObject = Object.create(figma, {
  // UI manipulation is disabled
  ui: { value: ui, enumerable: true },
  showUI: { value: _unavail("showUI") },

  // closePlugin is fine, but closeScripter is portable -- show a warning.
  closePlugin: {
    value: function closePlugin(message) {
      console.warn("Consider using closeScripter(message?:string) instead of figma.closePlugin")
      return figma.closePlugin(message)
    },
    enumerable: true
  },
})


function closeScripter(message) {
  if (typeof figma != "undefined") {
    figma.closePlugin(message)
  } else if (typeof window != "undefined") {
    window.close()
  } else {
    throw new Error("can't close Scripter")
  }
}

// ------------------------------------------------------------------------------------------
// Timers

// _timerDebug(id :number, ...args :any[])
// _timerDebug(id :null, ...args :any[])
let _timerDebug = DEBUG ? function(id /* ...args */) {
  console.log.apply(console, [
    typeof id == "number" ? `[timer #${id}]` : "[timer]"
  ].concat([].slice.call(arguments, 1)))
} : function(){}
let _timers = {}
let _timerWaitPromise = null

class TimerCancelation extends Error {
  constructor() {
    super("timer canceled")
    this.name = "TimerCancelation"
  }
}

function _awaitAsync() {
  _timerDebug(null, "_awaitAsync")
  for (let _ in _timers) {
    return new Promise((resolve, reject) => {
      _timerDebug(null, "_awaitAsync setting _timerWaitPromise with _timers=", _timers)
      _timerWaitPromise = { resolve, reject }
    })
  }
  // no timers
  _timerDebug(null, "_awaitAsync resolving immediately")
  return Promise.resolve()
}

function _cancelAllTimers(error) {
  _timerDebug(null, `_cancelAllTimers error=${error}`)
  let timers = _timers
  _timers = {}
  for (let id in timers) {
    let t = timers[id]
    if (t === undefined) {
      continue
    } else if (t === 1) {
      _timerDebug(id, `_cancelAllTimers clearTimeout`)
      clearTimeout(id)
    } else if (t === 2) {
      _timerDebug(id, `_cancelAllTimers clearInterval`)
      clearInterval(id)
    } else {
      // Promise rejection function
      _timerDebug(id, `_cancelAllTimers reject`)
      try { t(new TimerCancelation()) } catch(_) {}
    }
  }
  if (_timerWaitPromise) {
    try { _timerWaitPromise.reject(error) } catch(_) {}
    _timerWaitPromise = null
  }
}

function _wrapTimerFun(f, id, clearf) {
  _clearTimer(id)
  try {
    f()
  } catch (e) {
    _timerDebug(id, `exception in handler ${e}`)
    clearf(id)
    if (_timerWaitPromise) {
      _cancelAllTimers(e)
    }
    throw e
  }
}

// interface Timer extends Promise<void> { cancel():void }
// timer(duration :number, handler :(canceled?:boolean)=>any) :Timer
function timer(duration, f) {
  var id
  var rejectfun
  let hasCustomFun = !!f
  if (!hasCustomFun) { f = ()=>{} }
  let p = new Promise((resolve, reject) => {
    id = setTimeout(
      f ? () => {
        _clearTimer(id)
        try {
          f()
          resolve()
        } catch (e) {
          _timerDebug(id, `exception in handler ${e}`)
          reject(e)
        }
      } : () => {
        _clearTimer(id)
        resolve()
      },
      duration
    )
    _timerDebug(id, `timer() start`)
    _timers[id] = rejectfun = reject
    return id
  })
  p.cancel = () => {
    clearTimeout(id)
    let reject = _timers[id]
    if (reject === rejectfun) {
      _clearTimer(id)
      if (f) {
        try {
          f(/* canceled */true)
        } catch (e) {
          console.error("uncaught exception in timer handler: " + (e.stack || e))
        }
      }
      reject(new TimerCancelation())
    }
  }
  let _catch = p.catch
  p.catch = f => {
    _catch.call(p, f)
    return p
  }
  return p
}

function _clearTimer(id) {
  if (id in _timers) {
    _timerDebug(id, `_clearTimer ok`)
    delete _timers[id]
    if (_timerWaitPromise && Object.keys(_timers).length == 0) {
      _timerWaitPromise.resolve()
      _timerWaitPromise = null
    }
  } else _timerDebug(id, `_clearTimer not found`)
}

function _setTimeout(f, duration) {
  let id = setTimeout(() => _wrapTimerFun(f, id, clearTimeout), duration)
  _timerDebug(id, `setTimeout start`)
  _timers[id] = 1
  return id
}

function _setInterval(f, interval) {
  let id = setInterval(() => _wrapTimerFun(f, id, clearInterval), interval)
  _timerDebug(id, `setInterval start`)
  _timers[id] = 2
  return id
}

function _clearTimeout(id) {
  _timerDebug(id, `clearTimeout`)
  clearTimeout(id)
  _clearTimer(id)
}

function _clearInterval(id) {
  _timerDebug(id, `clearInterval`)
  clearInterval(id)
  _clearTimer(id)
}

// ------------------------------------------------------------------------------------------

const env = {
  figma: figmaObject,

  assert,
  // print,
  closeScripter,
  timer,
  TimerCancelation,
  setTimeout:    _setTimeout,
  setInterval:   _setInterval,
  clearTimeout:  _clearTimeout,
  clearInterval: _clearInterval,

  // shorthand figma.PROP
  apiVersion:    figma.apiVersion,
  root:          figma.root,
  viewport:      figma.viewport,
  mixed:         figma.mixed,
  clientStorage: figma.clientStorage,
  currentPage:   figma.currentPage,

  // current selection
  sel(v) {
    if (v !== undefined) { figma.currentPage.selection = !v ? [] : v }
    return figma.currentPage.selection
  },

  // group from nodes
  group(nodes, parent, index) {
    return figma.group(nodes, parent || figma.currentPage, index)
  },

  // Make RGB object
  RGB(r,g,b) { return {r,g,b} },
}

// ------------------------------------------------------------------------------------------

// shorthand node constructors. figma.createNodeType => NodeType
const _nodeCtor = c => props => {
  let n = c()
  if (props) for (let k in props) { n[k] = props[k] }
  return n
}
env.Rectangle        = _nodeCtor(figma.createRectangle) ; env.Rect = env.Rectangle
env.Line             = _nodeCtor(figma.createLine)
env.Ellipse          = _nodeCtor(figma.createEllipse)
env.Polygon          = _nodeCtor(figma.createPolygon)
env.Star             = _nodeCtor(figma.createStar)
env.Vector           = _nodeCtor(figma.createVector)
env.Text             = _nodeCtor(figma.createText)
env.BooleanOperation = _nodeCtor(figma.createBooleanOperation)
env.Frame            = _nodeCtor(figma.createFrame)
env.Component        = _nodeCtor(figma.createComponent)
env.Page             = _nodeCtor(figma.createPage)
env.Slice            = _nodeCtor(figma.createSlice)
env.PaintStyle       = _nodeCtor(figma.createPaintStyle)
env.TextStyle        = _nodeCtor(figma.createTextStyle)
env.EffectStyle      = _nodeCtor(figma.createEffectStyle)
env.GridStyle        = _nodeCtor(figma.createGridStyle)

// colors
env.BLACK   = {r:0.0, g:0.0, b:0.0}
env.WHITE   = {r:1.0, g:1.0, b:1.0}
env.GREY    = {r:0.5, g:0.5, b:0.5} ; env.GRAY = env.GREY
env.RED     = {r:1.0, g:0.0, b:0.0}
env.GREEN   = {r:0.0, g:1.0, b:0.0}
env.BLUE    = {r:0.0, g:0.0, b:1.0}
env.CYAN    = {r:0.0, g:1.0, b:1.0}
env.MAGENTA = {r:1.0, g:0.0, b:1.0}
env.YELLOW  = {r:1.0, g:1.0, b:0.0}
env.ORANGE  = {r:1.0, g:0.5, b:0.0}

// paints
env.Paint = {
  Black:   { type: "SOLID", color: env.BLACK },
  Grey:    { type: "SOLID", color: env.GREY },
  White:   { type: "SOLID", color: env.WHITE },
  Red:     { type: "SOLID", color: env.RED },
  Green:   { type: "SOLID", color: env.GREEN },
  Blue:    { type: "SOLID", color: env.BLUE },
  Cyan:    { type: "SOLID", color: env.CYAN },
  Magenta: { type: "SOLID", color: env.MAGENTA },
  Yellow:  { type: "SOLID", color: env.YELLOW },
  Orange:  { type: "SOLID", color: env.ORANGE },
}
env.Paint.Gray = env.Paint.Grey

// ------------------------------------------------------------------------------------------

let jsHeader = `false||async function script(module,exports,print,_e){`
let jsFooter = `}`
let names = Object.keys(env).filter(k => k[0] != "_")
try {
  eval(`const {x,y} = {x:1,y:1}`)
  jsHeader += `const {${names.join(',')}} = _e;`
} catch (_) {
  jsHeader += "var " + names.map(k => `${k} = _e.${k}`).join(",") + ";"
}

function evalScript(reqId, js) {
  return new Promise((resolve, reject) => {
    function print0() {
      _print(reqId, Array.prototype.slice.call(arguments))
    }
    js = jsHeader + "\n" + js + "\n" + jsFooter
    console.log("evalScript", js)
    try {
      // @ts-ignore eval (indirect call means scope is global)
      return (0,eval)(js)({id:"",exports:{}}, {}, print0, env)
        .then(result => _awaitAsync().then(() => resolve(result)))
        .catch(function(e) {
          _cancelAllTimers(e)
          reject(e)
        })
    } catch(e) {
      _cancelAllTimers(e)
      reject(e)
    }
  })
}


// count lines that the source is offset, used for sourcemaps
let i = 0, lineOffset = 1  // 1 = the \n we always end jsHeader with
while (true) {
  i = jsHeader.indexOf("\n", i)
  if (i == -1) {
    break
  }
  i++ // skip past \n
  lineOffset++
}
evalScript.lineOffset = lineOffset


return evalScript
})();
