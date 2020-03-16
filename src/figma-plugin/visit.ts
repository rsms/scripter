// visit calls f on every node in container up until maxdepth level of nesting.
export function visit(
  container :ChildrenMixin,
  maxdepth :number,
  maxtime :number,
  f :(n :SceneNode)=>any
) {
  let containers :{c:ChildrenMixin,depth:number}[] = []

  function visitContainer(c :ChildrenMixin, depth :number, f :(n :SceneNode)=>any) {
    c.findChildren(n => {
      let res = f(n)
      if (depth < maxdepth &&
          (res === undefined || !!res) &&
          "children" in n && n.children.length > 0
      ) {
        containers.push({c: n as ChildrenMixin, depth: depth + 1})
      }
      return false  // don't add to accumulation array (unused)
    })
  }

  return new Promise<void>(resolve => {
    let lastYieldTime = Date.now()
    visitContainer(container, 0, f)
    function next() {
      if (containers.length == 0) {
        // done
        resolve()
      } else if (Date.now() - lastYieldTime >= maxtime) {
        // Yield to Figma.
        // note: setting lastYieldTime here makes us effectively lower priority than Figma,
        // which is the right thing. I.e. if Figma spends a lot of time in the next runloop
        // cycle, we yield immediately again or very soon thereafter.
        lastYieldTime = Date.now()
        setTimeout(next, 0)
      } else {
        let { c, depth } = containers.pop()!
        visitContainer(c, depth, f)
        next()
      }
    }
    next()
  })
}
