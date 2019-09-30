import { WindowSize } from "./messages"

export function width(ws :WindowSize) :number {
  switch (ws) {
  case WindowSize.SMALL:  return 300
  case WindowSize.MEDIUM: return 500
  case WindowSize.LARGE:  return 700
  default:
    console.error(`[plugin] unexpected windowWidth ${ws}`)
    return 500
  }
}

export function height(ws :WindowSize) :number {
  switch (ws) {
  case WindowSize.SMALL:  return 300
  case WindowSize.MEDIUM: return 500
  case WindowSize.LARGE:  return 700
  default:
    console.error(`[plugin] unexpected windowHeight ${ws}`)
    return 500
  }
}
