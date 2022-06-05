
export function createFileOrBlob(
  filename :string,
  data     :File|Blob|ArrayBuffer|ArrayBufferView,
  mimeType :string = "application/octet-stream") :File|Blob
{
  if (typeof File != "undefined") {
    if (data instanceof File)
      return data
    return new File([ data ], filename, {type: mimeType})
  }
  if (data instanceof Blob)
    return data
  return new Blob([ data ], {type: mimeType})
}


export function downloadFile(
  filename  :string,
  data      :File|Blob|ArrayBuffer|ArrayBufferView,
  mimeType? :string) :void
{
  let fileOrBlob = createFileOrBlob(filename, data, mimeType)
  let objectURL = URL.createObjectURL(fileOrBlob)
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
