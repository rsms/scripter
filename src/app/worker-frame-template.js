((scriptfn) => {

  function importScripts(...urls) {
    return Promise.all(
      urls.map(
        url => new Promise((resolve, reject) => {
          let s = document.createElement('script')
          s.src = url
          s.type = "text/javascript"
          s.async = true
          s.onload = resolve
          s.onerror = reject
          document.head.appendChild(s)
        })
      )
    )
  }

  let postMessage = window.parent.postMessage.bind(window.parent)
  function _postMessage(msg, transfer) {
    postMessage(msg, '*', transfer)
  }

  _postMessage("__scripter_iframe_ready")

  function close() {
    _postMessage("__scripter_iframe_close")
  }

  // store ref to original window.postMessage as it's used by IFrameWorker
  window["__scripterPostMessage"] = window.postMessage

  // simple DOM element builder (from src/app/dom.ts)
  window["createElement"] = function createElement(
    name,        // :string,
    attrs,       // ?:{[k:string]:any},
    ...children  // :any[]
  ) /*:T*/ {
    let el = document.createElement(name)
    if (attrs) for (let k in attrs) {
      const v = attrs[k]
      if (k == "style") {
        Object.assign(el.style, v)
      } else if (k == "className") {
        el.className = v
      } else if (typeof v == "function") {
        el[k] = v
      } else {
        el.setAttribute(k, v)
      }
    }
    for (let n of children) {
      if (n instanceof Node) {
        el.appendChild(n)
      } else if (n !== undefined && n !== null) {
        el.appendChild(document.createTextNode(String(n)))
      }
    }
    return el
  }

  scriptfn(window, _postMessage, importScripts, close)

})((self, __scripterPostMessage, __scripterImportScripts, __scripterClose) => {
$__JS__
})
