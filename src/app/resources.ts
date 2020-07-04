// Note: This file is special. It is build separately, loaded very early and
// linked at runtime via window["__resources"].
// Because of this, only the one default export is valid. Any other export will fail.
import * as tslibs from "./tslibs"

declare const BUILD_VERSION :string

export class Resource {
  readonly name     :string
  readonly filename :string
  readonly version  :string
  readonly body     :Promise<string>

  constructor(name :string, info :{ filename :string, version :string }) {
    this.name = name
    this.filename = info.filename
    this.version = info.version
    this.body = loadText(this.filename + "?v=" + info.version)
  }
}

export default window["__resources"] = [
  new Resource("Figma API",     tslibs.figma),
  new Resource("Scripter API",  tslibs.scripter),
  new Resource("WebDOM API",    tslibs.dom),
  new Resource("WebWorker API", tslibs.webworker),
]


function loadText(url :string) :Promise<string> {
  return fetch(url).then(r => {
    if (r.status >= 200 && r.status <= 299) {
      return r.text()
    } else {
      throw new Error(`HTTP GET ${url} -> ${r.status} ${r.statusText}`)
    }
  })
}
