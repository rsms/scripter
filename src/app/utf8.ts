interface TextEncodeOptions { stream?: boolean; }
interface TextDecoderOptions { fatal?: boolean; ignoreBOM?: boolean; }
interface TextDecodeOptions { stream?: boolean; }
declare class TextEncoder  {
  encoding :string // always "utf-8" since Firefox >=48 and Chrome >=53 (always utf-8)
  constructor(label?: string) // label ignored since Firefox >=48 and Chrome >=53 (always utf-8)
  encode(input? :string, options? :TextEncodeOptions) :Uint8Array
}
declare class TextDecoder {
  encoding: string
  fatal: boolean
  ignoreBOM: boolean
  constructor(label?: string, options?: TextDecoderOptions)
  decode(input?: ArrayBufferView|ArrayBuffer, options?: TextDecodeOptions): string
}


const utf8Decoder = new TextDecoder("utf-8")
const utf8Encoder = new TextEncoder("utf-8")

export function encode(text :string) :Uint8Array {
  return utf8Encoder.encode(text)
}

export function decode(data :ArrayBufferView|ArrayBuffer) :string {
  return utf8Decoder.decode(data)
}
