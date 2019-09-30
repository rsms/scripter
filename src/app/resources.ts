declare const BUILD_VERSION :string

export default window["__resources"] = {

["figma.d.ts"]:        loadText("figma-1.0.0.d.ts?v=" + BUILD_VERSION),
["scripter-env.d.ts"]: loadText("scripter-env.d.ts?v=" + BUILD_VERSION),
// ["scripter-env.js"]:   loadText("scripter-env.js?v=" + BUILD_VERSION),

}

function loadText(url :string) :Promise<string> {
  return fetch(url).then(r => {
    if (r.status >= 200 && r.status <= 299) {
      return r.text()
    } else {
      throw new Error(`HTTP GET ${url} -> ${r.status} ${r.statusText}`)
    }
  })
}
