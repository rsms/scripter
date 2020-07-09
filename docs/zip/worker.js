importScripts("jszip.min.js")

onmessage = ev => {
  // console.log("onmessage", ev.data)
  switch (ev.data[0]) {
    case "create": {
      let requestId = ev.data[1]
      create(ev.data[2]).then(result => {
        postMessage(["result", requestId, "ok", result])
      }).catch(err => {
        console.error("error in zip worker: " + (err.stack || err))
        postMessage(["result", requestId, "error", String(err)])
      })
      break
    }
  }
}

postMessage(["ready"])

function create(props) { // Promise<ArrayBuffer>
  let zip = new JSZip()

  function addfile(dir, file) {
    if (file.contents === undefined) {
      throw new Error(`missing contents prop for file ${file.name}`)
    }
    let opts = {}
    if (file.mtime) {
      opts.date = file.mtime
    }
    if (file.permissions) {
      opts.unixPermissions = file.permissions
    }
    dir.file(file.name, file.contents, opts)
  }

  if (props.files.length == 1) {
    // single-file zip
    addfile(zip, props.files[0])
  } else {
    // multiple files
    let dir = props.name ? zip.folder(props.name) : zip
    for (let file of props.files) {
      addfile(dir, file)
    }
  }
  return zip.generateAsync({type: "arraybuffer"})
}
