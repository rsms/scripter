// Note: Changes to this file only take effect after running misc/build-app.pre.sh
(function (_postMessage, _close, globalObj, _amd) {
  // special props on data for implementing script-worker requests
  // IMPORTANT: Keep in sync with worker-template.js
  const requestIdProp = "__scripterRequestId"
  const requestErrProp = "__scripterRequestError"

  let recvp, recvres, recvrej
  let msgq = []
  let requestq = []
  let workerInitialized = false

  function recv() {
    if (!recvp) {
      if (msgq.length > 0) {
        return Promise.resolve(msgq.shift())
      }
      recvp = new Promise((res, rej) => { recvres = res; recvrej = rej })
    }
    return recvp
  }

  let onrequest = undefined
  Object.defineProperty(globalObj, "onrequest", {
    get() { return onrequest },
    set(f) {
      onrequest = f
      if (onrequest && workerInitialized && requestq.length > 0) {
        requestqFlush()
      }
    },
    enumerable: true,
  })

  function requestqFlush() {
    //console.log("[worker] requestqFlush")
    requestq.forEach(r => handleRequest(r))
    requestq.length = 0
  }

  function onInit(err) {
    //console.log("[worker] init")
    workerInitialized = true
    if (onrequest && requestq.length > 0) {
      requestqFlush()
    }
  }

  function handleRequest(data) {
    const requestId = data[requestIdProp]
    const f = globalObj.onrequest
    // console.log("[worker-wrapper] got request", data)
    const response = { [requestIdProp]: requestId }
    let r = null
    if (f) {
      try {
        r = f({ id: requestId, data: data.data })
      } catch (err) {
        response[requestErrProp] = String(err.stack||err)
      }
    } else {
      response[requestErrProp] = "No onrequest handler registered in worker"
    }
    const reply = r => {
      response.data = r
      postMessage(response)
    }
    if (r instanceof Promise) {
      r.then(reply).catch(err => {
        console.warn("[worker] error in promise: " + (err.stack||err))
        response[requestErrProp] = String(err ? (err.stack || err) : "error")
        reply(null)
      })
    } else {
      reply(r)
    }
  }

  globalObj.addEventListener("message", ev => {
    if (ev.data && typeof ev.data == "object" && requestIdProp in ev.data) {
      if (!workerInitialized || !onrequest) {
        requestq.push(ev.data)
      } else {
        handleRequest(ev.data)
      }
      ev.stopPropagation()
      ev.preventDefault()
      return
    }
    if (recvp) {
      recvp = null
      recvres(ev.data)
    } else if (!workerInitialized || msgq.length < 10) {
      msgq.push(ev.data)
    }
  }, {capture:true});

  globalObj.addEventListener("messageerror", ev => {
    if (recvp) { recvp = null ; recvrej(ev.data) }
  });

  function postMessage(data,transfer) {
    try {
      return _postMessage({data,transfer},transfer)
    } catch (err) {
      // if clone failed, try .toJSON if possible
      if (data && typeof data == "object" && typeof data.toJSON == "function") {
        transfer = undefined
        return _postMessage({data:data.toJSON(),transfer},transfer)
      }
      throw err
    }
  }

  function send(data, transfer) {
    return postMessage(data, transfer)
  }

  function close() {
    // detect missing onrequest handler
    if (requestq.length > 0 && !onrequest) {
      __onerror("request() was called but no onrequest handler was registered")
    }
    postMessage({type:"__scripter_close"})
    _close()
  }

  function print(...msg) {
    console.log(...msg)
  }

  function timer(timeout) {
    // TODO: implement full Scripter timer API
    let timer = null
    const p = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        timer = null
        resolve()
      }, timeout)
    })
    p.cancel = () => {
      if (timer !== null) {
        clearTimeout(timer)
        reject(new Error("timer cancelled"))
      }
    }
    return p
  }

  function __onerror(err) {
    postMessage({
      type: "__scripter_toplevel_err",
      message: err ? String(err) : "unknown error",
      stack: (err && err.stack) || "",
    })
  }

  try {
    let r = (eval($__JS__))( (() => {
      // build environment passed in to the worker
      let w = globalObj
      w.send = w.postMessage = postMessage
      w.recv = recv
      w.close = close
      w.print = print

      w.importCommonJS = url => {
        globalObj.exports = {}
        globalObj.module = {id:"scripter", exports:globalObj.exports}
        return w.importScripts(url).then(() => {
          let exports = globalObj.module.exports
          delete globalObj.module
          delete globalObj.exports
          return exports
        })
      }

      return w
    })())
    onInit(null)
    if (r instanceof Promise) {
      r.catch(__onerror)
    }
  } catch(err) {
    console.warn("error in worker-template", err)
    onInit(err)
    __onerror(err)
  }
})(
  // _postMessage
  (
    typeof __scripterPostMessage != "undefined" ? __scripterPostMessage :
    self.postMessage.bind(self)
  ),
  // _close
  (
    typeof __scripterClose != "undefined" ? __scripterClose :
    self.close.bind(self)
  ),
  // globalObj
  typeof window != "undefined" ? window : self,

// BEGIN _amd
(globalObj => {
  // This is a version of https://github.com/rsms/js-amdld

  const CHECK_CYCLES = false  // enable check for cyclic dependencies
  const DEBUG = false  // enable debug logging

  function emptyFunction(){}

  const assert = DEBUG ? cond => {
    if (!cond) {
      throw new Error('assertion failure')
    }
  } : emptyFunction

  const logdebug = DEBUG ? function() {
    console.log.apply(console, ['[define]'].concat([].slice.call(arguments)))
  } : emptyFunction

  let modules = new Map() // Map<string|symbol,Module>
  let waiting = new Map() // Map<string|symbol,Set<string|symbol>>

  function define_require(id) {
    let m = modules.get(id)
    if (!m) {
      throw new Error(`unknown module "${id}"`)
    }
    return m.init ? undefined : m['exports']
  }

  // new Module(
  //   id      :string|symbol|null
  //   exports :Object|null
  //   deps    :Object[]|null
  //   fn      :Function|Object
  // )
  function Module(id, exports, deps, fn) {
    this['id']      = id
    this['exports'] = exports
    this.deps       = deps
    this.fn         = fn
    this.init       = null
    this.waitdeps   = null  // Set<string|symbol> | null  (ids)
  }

  // Return the path to dependency 'id' starting at m.
  // Returns null if m does not depend on id.
  // Note: This is not a generic function but only works during initialization
  // and is currently only used for cyclic-dependency check.
  //
  // deppath(m :Module, id :string) : Array<string> | null
  function deppath(m, id) {
    if (m.waitdeps) {
      for (let wdepid of m.waitdeps) {
        if (wdepid == id) {
          return [m['id']]
        }
        let wdepm = modules.get(wdepid)
        if (wdepm) {
          let path = deppath(wdepm, id)
          if (path) {
            return [m['id']].concat(path)
          }
        }
      }
    }
    return null
  }

  // mfinalize(m :Module) :void
  function mfinalize(m) {
    // clear init to signal that the module has been initialized
    m.init = null

    // get dependants that are waiting
    let /** Set<symbol|string> */ waitingDependants = waiting.get(m['id'])
    waiting.delete(m['id']) // clear this module from `waiting`

    if (m.fn) {
      // execute module function
      let res = m.fn.apply(m['exports'], m.deps)
      if (res) {
        m['exports'] = res
      }
      m.fn = null
    }

    // clear module properties to free up memory since m will live forever because
    // it's owned by modules which is bound to the define's closure.
    m.deps = null
    m.waitdeps = null

    if (waitingDependants) {
      // check in on dependants
      for (let depid of waitingDependants) {
        let depm = modules.get(depid)
        if (depm.init) {
          if (depm.waitdeps.size == 1) {
            // The just-initialized module is the last dependency.
            // Resume initialization of depm.
            depm.init()
          } else {
            // The just-initialized module is one of many dependencies.
            // Simply clear this module from depm's waitdeps
            depm.waitdeps.delete(m['id'])
          }
        }
      }
      assert(typeof m['id'] != 'symbol')
    } else if (typeof m['id'] == 'symbol') {
      // remove anonymous module reference as it was only needed while
      // resoling its dependencies. Note that typeof=='symbol' is only available in
      // environments with native Symbols, so we will not be able to clean up
      // anon modules when running in older JS environments. It's an okay trade-off
      // as checking for "shimmed" symbol type is quite complicated.
      modules.delete(m['id'])
    }
  }

  // minitg(m :Module, deps :string[]) :Generator<Set<string|symbol>>
  function* minitg(m, deps) {
    while (true) {

      for (let i = 0, L = deps.length; i != L; ++i) {
        let depid = deps[i]
        if (m.deps[i] !== undefined) {
          continue
        }
        if (depid == 'require') {
          m.deps[i] = define_require
        } else if (depid == 'exports') {
          m.deps[i] = m['exports']
        } else if (depid == 'module') {
          m.deps[i] = m
        } else {
          let depm = modules.get(depid)
          if (depm && !depm.init) {
            // dependency is initialized
            m.deps[i] = depm['exports']
            if (m.waitdeps) {
              m.waitdeps.delete(depid)
            }
          } else {
            // latent dependency — add to waitdeps
            if (!m.waitdeps) {
              m.waitdeps = new Set([depid])
            } else if (!m.waitdeps.has(depid)) {
              m.waitdeps.add(depid)
            } else {
              continue
            }

            // check for cyclic dependencies when depm.init is still pending
            if (CHECK_CYCLES && depm) {
              let cycle = deppath(depm, m['id'])
              if (cycle) {
                if (cycle[cycle.length-1] != m['id']) {
                  cycle.push(m['id'])
                }
                throw new Error(`Cyclic module dependency: ${m['id']} -> ${cycle.join(' -> ')}`)
              }
            }
          }
        }
      }

      if (!m.waitdeps || m.waitdeps.size == 0) {
        // no outstanding dependencies
        break
      }

      yield m.waitdeps
    }

    mfinalize(m)
  }

  // Creates a resumable init function for module m with dependencies deps
  //
  // minit(m :Module, deps :string[]) : ()=>boolean
  function minit(m, deps) {
    let initg = minitg(m, deps)

    return function init() {
      logdebug('attempting to resolve dependencies for', m['id'])
      let v = initg.next()
      if (v.done) {
        // module initialized
        logdebug('completed initialization of', m['id'])
        return true
      }

      // add outstanding dependencies to waitset
      for (let depid of v.value) {
        let waitset = waiting.get(depid)
        if (waitset) {
          waitset.add(m['id'])
        } else {
          waiting.set(depid, new Set([m['id']]))
        }
      }

      return false
    }
  }

  // if define.timeout is set, the `timeout` function is called to check for
  // modules that has not yet loaded, and if any are found throws an error.
  let timeoutTimer = null
  let timeoutReached = false
  function timeout() {
    clearTimeout(timeoutTimer)
    timeoutTimer = null
    timeoutReached = true
    if (waiting && waiting.size > 0) {
      let v = []
      for (let id of waiting.keys()) {
        if (!modules.has(id)) {
          v.push(id)
        }
      }
      if (v.length) {
        throw new Error(`Module load timeout -- still waiting on "${v.join('", "')}"`)
      }
    }
  }

  let _currentScriptURL = ""
  const getCurrentScriptURL = (
    globalObj.document ? () => (
      globalObj.document.currentScript ? globalObj.document.currentScript.src : ""
    ) : () => _currentScriptURL
  )

  // define is the main AMD API
  //
  //   export var define :DefineFunction
  //   interface DefineFunction {
  //     (id :string, dependencies :string[], factory :Factory) :boolean
  //     (id :string, factory :Factory) :boolean
  //     (dependencies :string[], factory :Factory) :boolean
  //     (factory :Factory) :boolean
  //
  //     require(id :string): any
  //     timeout :number
  //   }
  //   type Factory = (...dependencies :any[])=>any | {[key :string] :any}
  //
  // define(id?, deps?, fn)
  function define(id, deps, fn) {
    logdebug('define', id, deps, typeof fn)
    if (define.timeout && define.timeout > 0) {
      if (timeoutReached) {
        logdebug('define bailing out since timeout has been reached')
        return
      }
      clearTimeout(timeoutTimer)
      timeoutTimer = setTimeout(timeout, define.timeout)
    }

    let objfact = 1 // 0=no, 1=?, 2=yes

    switch (typeof id) {

    case 'function':
      // define(factory)
      fn = id
      id = null
      deps = []
      objfact = 0
      break

    case 'object':
      // define([...], factory)
      fn = deps
      deps = id
      id = null
      if (typeof fn != 'function') {
        // define([...], {...})
        throw new Error('object module without id')
      }
      break

    default:
      objfact = 0
      if (typeof deps == 'function') {
        // define(id, factory)
        fn = deps
        deps = []
      } else if (!fn) {
        // define(id, obj)
        fn = deps
        deps = []
        objfact = 2
      }
      // else: define(id, [...], factory)
      break
    } // switch

    if (!id) {
      // use url of current script as id
      id = getCurrentScriptURL() || null
      if (modules.has(id)) {
        // prevent multiple unnamed define calls in the same script to overwrite
        // each other; just leave the first caller in the modules map.
        id = null
      }
    }

    if (!deps || deps.length == 0) {
      // no dependencies
      logdebug('taking a shortcut becase', id, 'has no dependencies')
      if (objfact == 1 && typeof fn != 'function') {
        objfact = 2
      }
      let m = new Module(
        id,                  // id      :string|symbol|null
        objfact ? fn : {},   // exports :Object|null
        null,                // deps    :Object[]|null
        objfact ? null : fn  // fn      :Function|Object
      )
      if (id) {
        modules.set(id, m)
        mfinalize(m)
      } else {
        // Note: intentionally ignoring return value as a module w/o an id
        // is never imported by anything.
        fn.apply(m['exports'])
        m.fn = null
      }
      return true
    }

    if (typeof fn != 'function') {
      // define('id', [...], {...})
      throw new Error('object module with dependencies')
    }

    // resolve dependencies
    let m = new Module(
      id || Symbol(''),       // id      :string|symbol|null
      {},                     // exports :Object|null
      new Array(deps.length), // deps    :Object[]|null
      fn                      // fn      :Function|Object
    )
    modules.set(m['id'], m)
    m.init = minit(m, deps)
    return m.init()
  }

  const _importScripts = (
    // iframe
    typeof __scripterImportScripts != "undefined" ? __scripterImportScripts :
    // web worker
    (f =>
      (...urls) => Promise.resolve(f(...urls))
    )(self.importScripts.bind(self))
  )

  // importScripts legacy function
  let importScriptsLegacyNest = 0
  async function importScriptsLegacy(...urls) {
    // remove define so that libraries with AMD support doesn't call define instead of
    // setting global vars
    importScriptsLegacyNest++
    if (importScriptsLegacyNest == 1) {
      globalObj["define"] = null
    }
    try {
      await _importScripts(...urls)
    } finally {
      importScriptsLegacyNest--
      if (importScriptsLegacyNest == 0) {
        globalObj["define"] = define
      }
    }
  }

  const awaitImportAll = urls => {
    return new Promise((resolve, reject) => {
      let defined = false
      let tryingCommonJs = false
      define("_", urls, (...apis) => {
        if (!tryingCommonJs) {
          defined = true
          resolve(apis)
        }
      })
      if (!defined) {
        // attempt CommonJS emulation
        logdebug("some modules did not call amd define(); falling back to commonjs emulation")
        tryingCommonJs = true
        let i = 0
        let apis = []
        function next() {
          const cleanUp = () => {
            globalObj["module"] = undefined
            globalObj["exports"] = undefined
          }
          let url = urls[i++]
          if (!url) {
            cleanUp()
            return resolve(apis)
          }
          // did this module define()?
          let m = modules.get(url)
          if (m) {
            logdebug(`[cjs] ${url} did call define() [shortcut]`)
            apis.push(m.exports)
            return next()
          }
          logdebug(`[cjs] ${url} did not call define() -- loading in commonjs env...`)
          globalObj["exports"] = (globalObj["module"] = { id:url, exports:{} })["exports"]
          _importScripts(url).then(() => {
            apis.push(globalObj["module"].exports)
            next()
          }).catch(err => {
            cleanUp()
            reject(err)
          })
        }
        next()
      }
    }) // Promise
  }

  // convert any non-url to a path added to unpkg.com
  const urlre = /^https?:\/\/[^\r\n]+$/
  const filterUrls = urls => urls.map(url =>
    urlre.test(url) ? url : `https://unpkg.com/${url}`
  )

  const importAll = (
    globalObj.importScripts && globalObj.document === undefined ?
    // worker implementation
    (importScripts => function importAll(...urls) {
      // workers do not have a document.currentScript API for loaded scripts, so we load each
      // url one by one.
      // Note: calling importScripts with multiple urls or calling it one by one has the same
      // network effect; fetched one by one, so while there might seem like an opportunity here to
      // preload scripts, it would only make things slower. (observed in Chrome 78)
      urls = filterUrls(urls)
      for (let url of urls) {
        _currentScriptURL = url  // used by define() when no id is provided
        try {
          importScripts(url)
        } finally {
          _currentScriptURL = ""
        }
      }
      return awaitImportAll(urls)
    })(
      // must deref and bind importScripts here, before we replace it later on
      globalObj.importScripts.bind(globalObj)
    ) :

    // iframe implementation
    function importAll(...urls) {
      // The scripts are all loaded at once. They call define() without an id (as per AMD spec)
      // which the define() function will treat as currentScript.src. document.currentScript is
      // only available in HTML documents.
      urls = filterUrls(urls)
      return _importScripts(...urls).then(() => awaitImportAll(urls))
    }
  )

  // Set to a number larger than zero to enable timeout.
  // Whenever define() is called, the timeout is reset and when the timer expires
  // an error is thrown if there are still undefined modules.
  define['timeout'] = 0
  define['require'] = define_require
  define['amd'] = {}

  globalObj['define'] = define
  globalObj['importAll'] = importAll
  globalObj['importScripts'] = importScriptsLegacy
  globalObj['import'] = url => importAll(url).then(v => v[0])

})(typeof window != "undefined" ? window : self),
// END _amd

) // end top-level function call
