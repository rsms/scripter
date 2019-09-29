// UTF-8

export const
  UniError = 0xFFFD,   // the "error" Rune or "Unicode replacement character"
  UniSelf  = 0x80,     // characters below UniSelf are represented as
                       // themselves in a single byte.
  UTFMax   = 4         // Maximum number of bytes of a UTF8-encoded char

const
  maxCp        = 0x10FFFF, // Maximum valid Unicode code point.
  // Code points in the surrogate range are not valid for UTF-8.
  surrogateMin = 0xD800,
  surrogateMax = 0xDFFF,
  // rune1Max = 1<<8 - 1  // 0x80
  rune2Max = 1<<11 - 1 // 0x400
  // rune3Max = 1<<16 - 1  // 0x8000


export let decode :(src :ArrayLike<byte>) => string
export let encode :(src :string) => Uint8Array

if (typeof TextDecoder != 'undefined') {
  const dec = new TextDecoder('utf-8')
  decode = (src :ArrayLike<byte>) => dec.decode(
    (src as any).buffer != undefined ? src as Uint8Array :
    new Uint8Array(src)
  )
} else {
  decode = (src :ArrayLike<byte>) => {
    let s = ""
    let end = src.length
    for (let i = 0; i < end; i++) {
      const end = src.length
      let offset = 0
      let b = src[i]
      let cp :int = b
      if (b >= UniSelf) {
        cp = (
          (b >> 5) == 0x6 ?
            i + 2 > end ? UniError :
            ((b << 6) & 0x7ff) +
            ((src[++i]) & 0x3f) :
          (b >> 4) == 0xe ?
            i + 3 > end ? UniError :
            ((b << 12) & 0xffff) +
            ((src[++i] << 6) & 0xfff) +
            ((src[++i]) & 0x3f) :
          (b >> 3) == 0x1e ?
            i + 4 > end ? UniError :
            ((b << 18) & 0x1fffff) +
            ((src[++i] << 12) & 0x3ffff) +
            ((src[++i] << 6) & 0xfff) +
             (src[++i] & 0x3f) :
          UniError
        )
      }
      s += String.fromCodePoint(cp)
    }
    return s
  }
}


if (typeof TextEncoder != 'undefined') {
  const enc = new TextEncoder()
  encode = (s :string) => enc.encode(s)
} else if (typeof Buffer != 'undefined') {
  encode = (s :string) => Buffer.from(s, 'utf8') as Uint8Array
} else {
  encode = (s :string) :Uint8Array => {
    let z = s.length
    let i = 0
    let v :byte[] = []
    while (i < z) {
      // read one codepoint from s
      let c = s.charCodeAt(i)  // UTF16 char
      let cp = UniError
      if (c < 0xD800 || c > 0xDFFF) {
        cp = c
      } else if (i != z - 1) {
        let c2 = s.charCodeAt(++i)
        if (0xDC00 <= c2 && c2 <= 0xDFFF) {
          // UTF16 -> UTF32
          cp = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF)
        }
        if (cp > maxCp || (surrogateMin <= cp && cp <= surrogateMax)) {
          // invalid codepoint
          cp = UniError
        }
      }
      i++
      // encode codepoint as utf8 to v
      if (cp < 0x800) {
        v.push((cp >> 6)   | 0xc0)
        v.push((cp & 0x3f) | 0x80)
      } else if (cp < 0x10000) {
        v.push((cp >> 12)         | 0xe0)
        v.push(((cp >> 6) & 0x3f) | 0x80)
        v.push((cp & 0x3f)        | 0x80)
      } else {
        v.push((cp >> 18)         | 0xf0)
        v.push(((cp >> 12) & 0x3f)| 0x80)
        v.push(((cp >> 6) & 0x3f) | 0x80)
        v.push((cp & 0x3f)        | 0x80)
      }
    }
    return new Uint8Array(v)
  }
}

