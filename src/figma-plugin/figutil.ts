
export type ContainerNode = BaseNode & ChildrenMixin

export const $ = (q :string, el? :HTMLElement) :HTMLElement|null =>
  (el || document).querySelector(q)

export const $$ = (q :string, el? :HTMLElement) :HTMLElement[] => {
  let o = (el || document).querySelectorAll(q)
  ;(o as any).__proto__ = Array.prototype
  return o as any as HTMLElement[]
}

export function triggerDownload(name :string, type :string, data :ArrayBuffer) {
  let file = new File([data], name, {type})
  let url = URL.createObjectURL(file)

  let a = document.createElement('a')
  a.download = name
  a.href = url
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}


// Messaging between plugin and UI processes
export let sendToPlugin   : (msg:any)=>void
export let recvFromPlugin : (callback:(msg:any)=>any|null)=>void
export let sendToUI       : (msg:any)=>void
export let recvFromUI     : (callback:(msg:any)=>any|null)=>void

if (typeof figma as any == 'undefined') {
  // executing as UI
  sendToPlugin = (msg :any) => {
    parent.postMessage({ pluginMessage: msg }, '*')
  }
  recvFromPlugin = (callback:(msg:any)=>any|null) => {
    if (callback) {
      window.onmessage = ev => callback(ev.data.pluginMessage)
    } else {
      window.onmessage = null
    }
  }
  sendToUI = _ => {
    throw new Error(
      'attempt to send message from UI to UI. ' +
      'Use sendToPlugin to send a message to the plugin process.'
    )
  }
  recvFromUI = _ => {
    throw new Error(
      'attempt to receive message from same process. ' +
      'Use recvFromPlugin to receive a message from the plugin process.'
    )
  }
} else {
  // executing as plugin
  sendToUI = (msg :any) => figma.ui.postMessage(msg)
  recvFromUI = (callback:(msg:any)=>any|null) => {
    figma.ui.onmessage = callback
  }
  sendToPlugin = _ => {
    throw new Error(
      'attempt to send message from UI to UI. ' +
      'Use sendToUI to send a message to the UI process.'
    )
  }
  recvFromPlugin = _ => {
    throw new Error(
      'attempt to receive message from same process. ' +
      'Use recvFromUI to receive a message from the UI process.'
    )
  }
}

// async function yieldToUI() {
//   return new Promise<void>(r => setTimeout(r, 0))
// }

// type guards
export const isContainerNode = (n :BaseNode) :n is ContainerNode => !!(n as any).children
export const isTextNode = (n :BaseNode) :n is TextNode => n.type == 'TEXT'
export const isFontName = (v :FontName|symbol) :v is FontName => !(v instanceof Symbol)
export const isLetterSpacing = (v :LetterSpacing|symbol) :v is LetterSpacing => !(v instanceof Symbol)
export const isLineHeight = (v :LineHeight|symbol) :v is LineHeight => !(v instanceof Symbol)
export const isNumber = (v :number|symbol) :v is number => typeof v == "number"

type NodePredicate = (node :BaseNode) => boolean|void


// visit traverses the tree represented by node, calling visitor for each node.
//
// If the visitor returns false for a node with children, that
// node's children will not be visited. This allows efficient searching
// where you know that you can skip certain branches.
//
// Note: visitor is not called for `node`.
//
export function visit(node :ContainerNode|ReadonlyArray<ContainerNode>, visitor :NodePredicate) :Promise<void> {
  return new Promise<void>(resolve => {
    let branches :ContainerNode[] = Array.isArray(node) ? node.slice() : [node]

    function visitBranches() {
      let startTime = Date.now()

      while (true) {
        let b = branches.shift()
        if (!b) {
          return resolve()
        }

        if (Date.now() - startTime > 100) {
          // we've locked the UI for a long time -- yield
          return setTimeout(visitBranches, 0)
        }

        for (let n of b.children) {
          if (visitor(n)) {
            let children :ReadonlyArray<BaseNode>|undefined = (n as any).children
            if (children) {
              branches.push(n as ContainerNode)
            }
          }
        }
      }
    }

    visitBranches()
  })
}


// visitAll calls visitor on each node. Node which has children are traversed
// in the same way as described for visit().
//
export function visitAll(nodes :ReadonlyArray<BaseNode>, visitor :NodePredicate) :Promise<void> {
  let containers :ContainerNode[] = []
  for (let n of nodes) {
    if (!!(n as any).children) {
      containers.push(n as ContainerNode)
    }
    visitor(n)
  }
  return (
    containers.length == 0 ? Promise.resolve() :
    visit(containers, visitor)
  )
}


// visitSync does the same thing as visit, but blocks the UI thread for
// the entire duration of execution.
//
export function visitSync(node :ContainerNode|ReadonlyArray<ContainerNode>, visitor :NodePredicate) {
  let branches :ContainerNode[] = Array.isArray(node) ? node.slice() : [node]
  let b :ContainerNode|undefined
  while (b = branches.shift()) {
    for (let n of b.children) {
      if (visitor(n)) {
        let children :ReadonlyArray<BaseNode>|undefined = (n as any).children
        if (children) {
          branches.push(n as ContainerNode)
        }
      }
    }
  }
}


interface FindOptions {
  includeHidden? :boolean  // include hidden layers
}


// find traverses the tree represented by node and returns a list of all
// nodes for which predicate returns true.
//
export async function find(node :ContainerNode, predicate :NodePredicate, options? :FindOptions) :Promise<BaseNode[]> {
  let results :BaseNode[] = []
  if (options && options.includeHidden) {
    await visit(node,
      n => ((predicate(n) && results.push(n)), true)
    )
  } else {
    await visit(node, n =>
      (n as SceneNode).visible && ((predicate(n) && results.push(n)), true)
    )
  }
  return results
}

// findSync works just like find, but blocks the UI until completion.
//
export function findSync(node :ContainerNode, predicate :NodePredicate, options? :FindOptions) :BaseNode[] {
  let results :BaseNode[] = []
  if (options && options.includeHidden) {
    visitSync(node,
      n => ((predicate(n) && results.push(n)), true))
  } else {
    visitSync(node, n =>
      (n as SceneNode).visible && ((predicate(n) && results.push(n)), true)
    )
  }
  return results
}


// Plugin represents a runnable Figma plugin and can be used as a convenience
// for more complex plugin projects. For instance, if your plugin provides
// multiple actions, you could create one plugin class that contains shared
// functionality and further subclasses that only contain specialized stuff
// for a particular action.
//
export class Plugin {
  main() :Promise<any>
  main() :any { throw new Error('main() not defined') }

  onUIMessage(msg :any) :void {}

  readonly sendToUI :(msg:any)=>void = sendToUI

  constructor() {
    if (this.onUIMessage !== Plugin.prototype.onUIMessage) {
      recvFromUI(this.onUIMessage.bind(this))
    }
  }

  outerMain() {
    ;(async () => this.main())().catch(e => {
      console.error(e.stack||`${e}`)
      figma.closePlugin()
    })
  }
}
