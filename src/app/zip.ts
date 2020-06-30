let worker = null
let workerPromise = null

export interface ZipCreateProps {
  files :ZipInputFile[]
  name? :string  // used as the root directory name when there are multiple files
}

export interface ZipInputFile {
  name         :string
  contents     :string | ArrayBuffer
  mtime?       :Date
  permissions? :number | string  // e.g. 0o644 or "644"
}

export interface ZipWorker {
  create(props :ZipCreateProps) :Promise<ArrayBuffer>
}

export function getZipWorker() :Promise<ZipWorker> {
  if (workerPromise) {
    return workerPromise
  }
  return workerPromise = new Promise<ZipWorker>((resolve, reject) => {
    let requestId = 0
    let requests = new Map()

    function workerRequest<ResT>(callName, callInput) :Promise<ResT> {
      let req = { resolve(){}, reject(){} }
      let p = new Promise<ResT>((res, rej) => {
        req.resolve = res
        req.reject = rej
      })
      p["id"] = (requestId++).toString(36)
      requests.set(p["id"], req)
      worker.postMessage([callName, p["id"], callInput])
      return p
    }

    function finalizeRequest(msg) {
      let r = requests.get(msg[1])
      if (r) {
        requests.delete(msg[1])
        if (msg[2] == "ok") {
          r.resolve(msg[3])
        } else {
          r.reject(msg[3])
        }
      }
    }

    worker = new Worker("/zip/worker.js")
    worker.onmessage = ev => {
      let msg = ev.data
      switch (msg[0]) {

      case "result":
        finalizeRequest(msg)
        break

      case "ready": resolve(new class _ZipWorker implements ZipWorker {
        create(props :ZipCreateProps) :Promise<ArrayBuffer> {
          return workerRequest<ArrayBuffer>("create", props)
        }
      }) ; break
      default:
        reject(new Error(`[zip] unexpected message from worker: ${JSON.stringify(msg)}`))
        break
      }
    }
  })
}


export async function createZipArchive(props :ZipCreateProps) :Promise<Blob> {
  let zip = await getZipWorker()
  let buf = await zip.create(props)
  return new Blob([ buf ], {type: "application/zip"})
}


export async function saveZipArchive(filename :string, props :ZipCreateProps) :Promise<void> {
  let zip = await getZipWorker()
  let buf = await zip.create(props)
  let blob = (
    typeof File != "undefined" ? new File([ buf ], filename, {type: "application/zip"}) :
                                 new Blob([ buf ], {type: "application/zip"})
  )
  let objectURL = URL.createObjectURL(blob)
  if (typeof window == "undefined" || typeof document == "undefined") {
    // fallback to redirect
    document.location.href = objectURL
  } else {
    // use the hyperlink trick to get proper filename
    let a = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement
    a.href = objectURL
    a.download = filename
    let event = document.createEvent("MouseEvents")
    event.initMouseEvent(
      "click", true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null)
    a.dispatchEvent(event)
  }
  setTimeout(() => { URL.revokeObjectURL(objectURL) }, 10)
}
