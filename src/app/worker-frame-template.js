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

  function postMessage(msg, transfer) {
    window.parent.postMessage(msg, '*', transfer)
  }

  postMessage("__scripter_iframe_ready");

  function close() {
    postMessage("__scripter_iframe_close");
  }

  scriptfn(window, postMessage, importScripts, close);

})((self, postMessage, __scripterImportScripts, __scripterClose) => {
$__JS__
})
