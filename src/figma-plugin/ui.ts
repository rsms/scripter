//
// this "ui" is really just a proxy between the Figma plugin and the remote-hosted Scripter.
// IPC messages are prxied between plugin and remote ui.
//
// When developing locally, you can test out the proxy in a browser:
//   (sleep 1 && open http://localhost:8006/ui.html) &
//   ./misc/serve.js build/figma-plugin 8006
//
let uiIframe = document.getElementById('iframe0') as HTMLIFrameElement
let ui = uiIframe.contentWindow!
let pluginOriginRe = /^https?:\/\/[^\.]+\.figma.com/

if (DEBUG) {
  uiIframe.src = "http://127.0.0.1:8009/"
  if (location.protocol != "data:") {
    // not running as a plugin; running as a stand-alone web thing
    window.onmessage = ev => {
      console.log(`proxy received message`, JSON.stringify({
        origin: ev.origin,
        data: ev.data,
      }))
      let msg = ev.data
      if (msg && typeof msg == "object") {
        if (msg.type == "ui-init") {
          ui.focus()
          ui.postMessage({ type: "set-figma-api-version", api: "0.0.0" }, "*")
        } else if (msg.type == "eval") {
          setTimeout(()=>ui.postMessage({ type: "eval-response", id: msg.id }, "*"), 100)
        }
      }
    }
  }
}

if (!DEBUG || location.protocol == "data:") {
  window.onmessage = ev => {
    if (pluginOriginRe.test(ev.origin)) {
      // plugin -> proxy -> ui
      // console.log(`proxy message plugin -> ui`, JSON.stringify({
      //   origin: ev.origin,
      //   pluginMessage: ev.data.pluginMessage,
      // },null,"  "))
      ui.postMessage(ev.data.pluginMessage, "*")
    } else {
      // ui -> proxy -> plugin
      // console.log(`proxy message ui -> plugin`, JSON.stringify({
      //   origin: ev.origin,
      //   data: ev.data
      // },null,"  "))
      parent.postMessage({ pluginMessage: ev.data }, '*')
    }
  }
}

ui.focus()
