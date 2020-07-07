// simple DOM element builder
export function EL<T extends HTMLElement>(
  name        :string,
  attrs?      :{[k:string]:any},
  ...children :any[]
) :T {
  let el = document.createElement(name)
  if (attrs) for (let k in attrs) {
    if (k == "style") {
      Object.assign(el.style, attrs[k])
    } else if (k == "className") {
      el.className = attrs[k]
    } else {
      el.setAttribute(k, attrs[k])
    }
  }
  for (let n of children) {
    if (n instanceof Node) {
      el.appendChild(n)
    } else if (n !== undefined && n !== null) {
      el.appendChild(document.createTextNode(String(n)))
    }
  }
  return el as T
}
