import * as base62 from "./base62"

export const genBytes :()=>Uint8Array = (
  typeof crypto == "object" && typeof crypto.getRandomValues == "function" ?
  function genBytes() :Uint8Array {
    let buf = new Uint8Array(16)
    crypto.getRandomValues(buf)
    return buf
  } :
  function genBytes() :Uint8Array {
    let buf = new Uint8Array(16)
    for (let i = 0; i < buf.length; i++) {
      buf[i] = (Math.random() * 255) >>> 0
    }
    return buf
  }
)

export function gen() :string {
  return base62.encode(genBytes())
}
