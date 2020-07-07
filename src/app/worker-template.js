// Note: Changes to this file only take effect after running misc/build-app.pre.sh
(function (_postMessage, importScripts, _close, globalObj) {
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

  function onInit(err) {
    // console.log("[worker] init. flush requestq")
    workerInitialized = true
    requestq.forEach(r => handleRequest(r))
    requestq = null
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
        console.log("[worker] error in promise")
        response[requestErrProp] = String(err ? (err.stack || err) : "error")
        reply(null)
      })
    } else {
      reply(r)
    }
  }

  globalObj.addEventListener("message", ev => {
    if (ev.data && typeof ev.data == "object" && requestIdProp in ev.data) {
      if (!workerInitialized) {
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
    return _postMessage({data,transfer},transfer)
  }
  function print(...msg) { console.log(...msg) }
  function send() { return postMessage.apply(globalObj, arguments) }
  function close() {
    postMessage({type:"__scripter_close"})
    _close()
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
      let w = Object.create(globalObj)
      w.send = w.postMessage = postMessage
      w.recv = recv
      w.close = close
      w.print = print
      w.importScripts = importScripts

      w.importCommonJS = url => {
        globalObj.exports = {}
        globalObj.module = {id:"scripter", exports:globalObj.exports}
        return importScripts(url).then(() => {
          let exports = globalObj.module.exports
          delete globalObj.module
          delete globalObj.exports
          return exports
        })
      }

      Object.defineProperties(w, {
        onmessage: {
          get() { return globalObj.onmessage },
          set(f) { globalObj.onmessage = f },
          enumerable: true,
        },
        onrequest: {
          get() { return globalObj.onrequest },
          set(f) { globalObj.onrequest = f },
          enumerable: true,
        },
      })
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
  // _postMessage  (note: worker-frame-template provides a wrapped version)
  postMessage,
  // importScripts
  (
    typeof __scripterImportScripts != "undefined" ? __scripterImportScripts :
    (importScripts => (...urls) => {
      importScripts(...urls)
      return Promise.resolve()
    })(self.importScripts.bind(self))
  ),
  // _close
  (
    typeof __scripterClose != "undefined" ? __scripterClose :
    self.close.bind(self)
  ),
  // globalObj
  typeof window != "undefined" ? window : self,
)
