// Note: This file is special. It is build separately, loaded very early and
// linked at runtime via window["__resources"].
// Because of this, only the one default export is valid. Any other export will fail.
import * as tslibInfo from "./tslib-info"

declare const BUILD_VERSION :string

export class Resource {
  readonly        body     :Promise<string>
  constructor(
  public readonly name     :string,
  public readonly filename :string,
  public readonly version  :string,
  ) {
    this.body = loadText(filename + "?v=" + version)
  }
}

export default window["__resources"] = [
  new Resource("Figma API",    "figma.d.ts",           BUILD_VERSION),
  new Resource("Scripter API", "scripter-env.d.ts",    BUILD_VERSION),
  new Resource("Web API",      tslibInfo.dom.filename, tslibInfo.dom.version),
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
