import { SourceMapConsumer, SourceMapGenerator } from "../misc/source-map"
import { dlog } from "./util"

export async function resolveOrigSourcePos(
  pos :SourcePos,
  lineOffset :number,
  sourceMapJSON :string,
) :Promise<SourcePos> {
  if (!sourceMapJSON) {
    return { line:0, column:0 }
  }

  ;(SourceMapConsumer as any).initialize({
    "lib/mappings.wasm": "source-map-" + SOURCE_MAP_VERSION + "-mappings.wasm",
  })

  // scripter:1.ts -> scripter:1.js
  let map1 = JSON.parse(sourceMapJSON)
  // map1.file = "script.js"
  // map1.sources = ["script.ts"]
  let sourceMap1 = await new SourceMapConsumer(map1)
  // print("map1:", JSON.stringify(map1, null, 2))
  if (lineOffset == 0) {
    let pos1 = sourceMap1.originalPositionFor(pos)
    sourceMap1.destroy()
    return pos1
  }

  // script.js -> wrapped-script.js
  let map2 = new SourceMapGenerator({ file: "script.js" })
  sourceMap1.eachMapping(m => {
    map2.addMapping({
      original: { line: m.originalLine, column: m.originalColumn },
      generated: { line: m.generatedLine + lineOffset, column: m.generatedColumn },
      source: m.source,
      name: m.name,
    })
  })
  // print("map2:", JSON.stringify(map2.toJSON(), null, 2));
  let sourceMap2 = await SourceMapConsumer.fromSourceMap(map2)

  // search for column when column is missing in pos
  let pos2 :SourcePos
  if (pos.column > 0) {
    pos2 = sourceMap2.originalPositionFor(pos) as SourcePos
  } else {
    let pos1 = {...pos}
    for (let col = 0; col < 50; col++) {
      pos1.column += col
      pos2 = sourceMap2.originalPositionFor(pos1) as SourcePos
      if (pos2.line !== null) {
        break
      }
    }
    if (pos2.line === null) {
      pos2.line = 0
      pos2.column = 0
    }
  }

  // dlog("originalPositionFor(" + JSON.stringify(pos) + ")", JSON.stringify(pos2, null, 2))

  sourceMap1.destroy()
  sourceMap2.destroy()

  return pos2
}
