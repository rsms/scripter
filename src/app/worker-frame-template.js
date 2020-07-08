((scriptfn) => {

  function importScripts(...urls) {
    return Promise.all(
      urls.map(
        url => new Promise((resolve, reject) => {
          let s = document.createElement('script');
          s.src = url;
          s.type = "text/javascript";
          s.async = true;
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        })
      )
    )
  }

  let postMessage = window.parent.postMessage.bind(window.parent)
  function _postMessage(msg, transfer) {
    postMessage(msg, '*', transfer)
  }

  _postMessage("__scripter_iframe_ready");

  function close() {
    _postMessage("__scripter_iframe_close");
  }

  // store ref to original window.postMessage as it's used by IFrameWorker
  window["__scripterPostMessage"] = window.postMessage

  scriptfn(window, _postMessage, importScripts, close);

})((self, __scripterPostMessage, __scripterImportScripts, __scripterClose) => {
$__JS__
})
