(function (_postMessage, importScripts, _close) {
  let recvp, recvres, recvrej
  let msgq = []
  function recv() {
    if (!recvp) {
      if (msgq.length > 0) {
        return Promise.resolve(msgq.shift())
      }
      recvp = new Promise((res, rej) => { recvres = res; recvrej = rej })
    }
    return recvp
  }
  self.addEventListener("message", ev => {
    if (recvp) {
      recvp = null
      recvres(ev.data)
    } else {
      msgq.push(ev.data)
    }
  });
  self.addEventListener("messageerror", ev => {
    if (recvp) { recvp = null ; recvrej(ev.data) }
  });

  function postMessage(data,transfer) {
    return _postMessage({data,transfer},transfer)
  }
  function print(...msg) { console.log(...msg) }
  function send() { return postMessage.apply(self, arguments) }
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
    let r = ($__JS__)( (() => {
      let w = Object.create(self)
      w.send = w.postMessage = postMessage
      w.recv = recv
      w.close = close
      w.print = print
      w.importScripts = importScripts

      w.importCommonJS = url => {
        self.exports = {}
        self.module = {id:"scripter", exports:self.exports}
        return importScripts(url).then(() => {
          let exports = self.module.exports
          delete self.module
          delete self.exports
          return exports
        })
      }

      Object.defineProperties(w, {
        onmessage: {
          get() { return self.onmessage },
          set(f) { self.onmessage = f },
          enumerable: true,
        },
      })
      return w
    })() )
    if (r instanceof Promise) {
      r.catch(__onerror)
    }
  } catch(err) {
    __onerror(err)
  }
})(
  postMessage,
  (
    typeof __scripterImportScripts != "undefined" ? __scripterImportScripts :
    (importScripts => (...urls) => {
      importScripts(...urls)
      return Promise.resolve()
    })(self.importScripts.bind(self))
  ),
  (
    typeof __scripterClose != "undefined" ? __scripterClose :
    self.close.bind(self)
  ),
)
