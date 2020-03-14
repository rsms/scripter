import { ScriptEnv } from "./scriptenv"


type NodeProps<N> = Partial<Omit<N,"type">>


export class DOM {
  readonly env :ScriptEnv
  shadowFrame :FrameNode|null = null

  constructor(env :ScriptEnv) {
    this.env = env
    env.scripter.addEndCallback(this.onScriptEnd.bind(this))
  }

  onScriptEnd() {
    if (this.shadowFrame) {
      // cleanup
      this.shadowFrame.remove()
    }
  }


  getShadowFrame() :FrameNode {
    if (!this.shadowFrame) {
      this.shadowFrame = figma.createFrame()
      this.shadowFrame.name = ".scripter-tmp"
      this.shadowFrame.visible = false
      this.shadowFrame.expanded = false
    }
    return this.shadowFrame
  }


  addToShadowFrame(n :SceneNode) {
    this.getShadowFrame().appendChild(n)
  }


  createElement<N extends SceneNode, P extends NodeProps<N>>(
    cons        :()=>N,
    props?      :P | null,
    ...children :SceneNode[]
  ): N

  createElement<N extends SceneNode, P extends NodeProps<N>>(
    kind        :string,
    props?      :P | null,
    ...children :SceneNode[]
  ): N

  createElement<N extends SceneNode, P extends NodeProps<N>>(
    cons        :string|(()=>N),
    props?      :P | null,
    ...children :SceneNode[]
  ): N {
    dlog("createElement", {cons, props})
    if (typeof cons == "string") {
      cons = this.kindToCons<N,P>(cons[0].toUpperCase() + cons.substr(1)) // fooBar => FooBar
    }

    let n = this.constructElement(cons, props)

    if (children.length > 0) {
      if (this.env.isContainerNode(n)) {
        for (let cn of children) {
          n.appendChild(cn)
        }
      } else {
        throw new Error(cons.name + " can not have children")
      }
    }
    return n
  }


  createGroup<P extends NodeProps<GroupNode> & {index :number}>(
    props :P|null,
    ...children :SceneNode[]
  ) :GroupNode
  createGroup(...children :SceneNode[]) :GroupNode
  createGroup<P extends NodeProps<GroupNode> & {index :number}>(
    props :P|null|SceneNode,
    ...children :SceneNode[]
  ) :GroupNode {
    dlog("createGroup", {props, children})
    // A. createGroup({visible:false}, {type:"TEXT"})
    // B. createGroup({type:"TEXT"})
    if (!props) {
      props = {} as P
    } else if ((props as SceneNode).type) {
      children.unshift(props as SceneNode)
      props = {} as P
    }

    if (children.length == 0) {
      throw new Error("group without children")
    }

    let parent = props.parent
    if (!parent) {
      parent = this.getShadowFrame()
    }

    let n = figma.group(children, parent, (props as P).index /* ok to be undefined */)

    if (props) {
      try {
        const ignoreGroupProps = {
          index:1,
          parent:1,
        }
        for (let k in props) {
          if (!(k in ignoreGroupProps)) {
            n[k] = props[k]
          }
        }
      } catch (e) {
        n.remove()
        throw e
      }
    }

    return n
  }


  constructElement<N extends SceneNode, P extends NodeProps<N>>(cons :()=>N, props? :P|null) :N {
    let n = cons()
    let currprop = ""
    try {
      this.addToShadowFrame(n)
      let width, height
      if (props) for (let k in props) {
        if (k == "width") {
          width = props[k]
        } else if (k == "height") {
          height = props[k]
        } else {
          ;(n as any)[k] = props[k]
          currprop = k
        }
      }
      if (width !== undefined || height !== undefined) {
        n.resizeWithoutConstraints(width || n.width, height || n.height)
      }
    } catch (e) {
      n.remove()
      if (String(e).indexOf("extensible") != -1) {
        throw new Error("invalid or read-only property " + currprop)
      }
      throw e
    }
    return n
  }

  kindToCons<N extends SceneNode, P extends NodeProps<N>>(kind :string) :()=>N {
    let f = (this.env as any).nodeConstructors[kind]
    if (!f) {
      throw new Error("no such node type " + JSON.stringify(kind))
    }
    return f
  }

}


// declare var DOM :DOM
// interface DOM {
//   createElement(
//     typename :string,
//     props? :{[k:string]:any}|undefined|null,
//     ...children :any[]
//   ) :any
// }


// TODO: special treatment for group

// const ignoreGroupProps = {
//   index:1,
//   parent:1,
// }
// function createGroup(children, props) {
//   if (children.length == 0) {
//     throw new Error("group without children")
//   }
//   let parent = props.parent
//   if (!parent) {
//     parent = children[0].parent || figma.currentPage
//   }
//   let n = figma.group(children, parent, props.index)
//   try {
//     if (props) for (let k in props) {
//       if (!(k in ignoreGroupProps)) {
//         n[k] = props[k]
//       }
//     }
//   } catch (e) {
//     n.remove()
//     throw e
//   }
//   return n
// }
