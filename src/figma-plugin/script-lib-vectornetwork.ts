import { ScriptEnv, scriptenv } from "./scriptenv"

type MutVectorNetworkContext = scriptenv.MutVectorNetworkContext
type MutVectorVertex = scriptenv.MutVectorVertex
type MutVectorNetwork = scriptenv.MutVectorNetwork


const circleTangent = (4/3) * Math.tan(Math.PI / 8)

class MutVectorNetworkContextImpl implements MutVectorNetworkContext {
  readonly vectorNetwork :MutVectorNetwork

  constructor(vectorNetwork :MutVectorNetwork) {
    this.vectorNetwork = vectorNetwork
  }

  vertex(x :number, y :number) :int { // returns its index
    return this.vectorNetwork.vertices.push({ x, y }) - 1
  }

  vertices(...v :MutVectorVertex[]) :int[] { // returns indices
    const len = this.vectorNetwork.vertices.length
    this.vectorNetwork.vertices.splice(len, 0, ...v)
    return v.map((_, i) => len + i)
  }

  segment(startVertIdx :int, endVertIdx :int,
          tanStartX :number = 0, tanStartY :number = 0,
          tanEndX :number = 0, tanEndY :number = 0) :int { // returns its index
    return this.vectorNetwork.segments.push({
      start: startVertIdx,
      end: endVertIdx,
      tangentStart: { x: tanStartX, y: tanStartY },
      tangentEnd: { x: tanEndX, y: tanEndY }
    }) - 1
  }

  line(from :Vector, to :Vector) {
    let end = this.vectorNetwork.vertices.push(from)
    this.vectorNetwork.vertices.push(to)
    this.vectorNetwork.segments.push({ start: end-1, end })
  }

  circle(center :Vector, radius :number) {
    let n = this.vertex(center.x, center.y - radius),
        e = this.vertex(center.x + radius, center.y),
        s = this.vertex(center.x, center.y + radius),
        w = this.vertex(center.x - radius, center.y)
    const tan = circleTangent * (radius * 1)
    let segmentIndices = [
      this.segment(n, e, tan, 0, 0, -tan),
      this.segment(e, s, 0, tan, tan, 0),
      this.segment(s, w, -tan, 0, 0, tan),
      this.segment(w, n, 0, -tan, -tan, 0),
    ]
    this.vectorNetwork.regions.push({
      windingRule: "NONZERO",
      loops: [segmentIndices]
    })
  }
}


export function initVectorNetworkAPI(env :ScriptEnv) {

  function createVectorNetworkContext(init? :VectorNetwork|null) :MutVectorNetworkContext {
    return new MutVectorNetworkContextImpl({
      vertices: [], segments: [], regions: [],
      ...( init ? (JSON.parse(JSON.stringify(init)) as MutVectorNetwork) : {} )
    })
  }

  function buildVector(
    init    :scriptenv.NodeProps<VectorNode>|null|undefined,
    builder :(c:MutVectorNetworkContext)=>void,
  ) :VectorNode

  function buildVector(
    builder :(c:MutVectorNetworkContext)=>void,
  ) :VectorNode

  function buildVector(
    arg0 :scriptenv.NodeProps<VectorNode>|null|undefined | ((c:MutVectorNetworkContext)=>void),
    arg1? :(c:MutVectorNetworkContext)=>void,
  ) :VectorNode {
    let init = arg0 as scriptenv.NodeProps<VectorNode>|null|undefined
    let builder = arg1 as (c:MutVectorNetworkContext)=>void
    if (!arg1) {
      init = null
      builder = arg0 as (c:MutVectorNetworkContext)=>void
    }

    const ctx = createVectorNetworkContext(init ? init.vectorNetwork : null)

    builder(ctx)

    if (init) {
      return env.createVector({...init, vectorNetwork: ctx.vectorNetwork })
    }
    const n = figma.createVector()
    n.vectorNetwork = ctx.vectorNetwork
    return n
  }

  env.createVectorNetworkContext = createVectorNetworkContext
  env.buildVector = buildVector
}
