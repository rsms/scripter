type int = number
type byte = number

export type ColorType = "GREY"       // grayscale:            1,2,4,8,16 bit
                      | "GREY_ALPHA" // grayscale with alpha: 8,16 bit
                      | "RGB"        // RGB:                  8,16 bit
                      | "RGBA"       // RGB with alpha:       8,16 bit
                      | "PALETTE"    // palette:              1,2,4,8 bit
                      | "invalid"

export interface PngInfo {
  width      :int
  height     :int
  bitDepth   :byte  // bits per pixel [1-32]
  colorType  :ColorType
  interlaced :boolean
}

export function pngInfoBuf(buf :ArrayLike<byte>) :PngInfo {
  if (buf[0] != 137 || buf[1] != 80 || buf[2] != 78 || buf[3] != 71 ||  // \x89PNG
      buf[4] != 13 || buf[5] != 10 || buf[6] != 26 || buf[7] != 10) {  // \r\n\x1a\n
    throw new Error("not a png")
  }

  if (readI32(buf, 8) != 13) {
    // header size is expected be 13 bytes
    throw new Error("not a png (invalid header size)")
  }

  if (buf[12] != 73 || buf[13] != 72 || buf[14] != 68 || buf[15] != 82) {
    // expect "IHDR"
    throw new Error("not a png (missing IHDR)")
  }

  let width = readI32(buf, 16)
  let height = readI32(buf, 20)
  let bitDepth = buf[24]

  let colorType :ColorType
  switch (buf[25]) {
    case 0:  colorType = "GREY"; break
    case 2:  colorType = "RGB"; break
    case 3:  colorType = "PALETTE"; break
    case 4:  colorType = "GREY_ALPHA"; break
    case 6:  colorType = "RGBA"; break
    default: colorType = "invalid"; break
  }

  // 26 is compression method, which is always 0
  // 27 is filter method, which is always 0
  // 28 is interlaced method, which is 0 or 1
  let interlaced = buf[28] > 0

  return { width, height, bitDepth, colorType, interlaced }
}

function readI32(buf :ArrayLike<byte>, offs :int) :int {
  return (
    (buf[offs]     << 24) |
    (buf[offs + 1] << 16) |
    (buf[offs + 2] << 8) |
     buf[offs + 3]
  ) >>> 0
}


// if (DEBUG) (function test(){
//   let a = new Uint8Array([
//     0x89, 0x50, 0x4E, 0x47,
//      0xD,  0xA, 0x1A,  0xA,
//        0,    0,    0,  0xD,
//     0x49, 0x48, 0x44, 0x52,
//        0,    0,    0, 0x80,
//        0,    0,    0, 0x80,

//      0x8,  0x4,    0,    0,
//        0, 0x69, 0x37, 0xA9,
//     0x40,    0,    0,    0,
//      0x4, 0x67, 0x41, 0x4D,
//     0x41,    0,    0, 0xB1,
//     0x8F,  0xB, 0xFC, 0x61,
//      0x5,    0,    0,    0,
//      0x1, 0x73, 0x52, 0x47
//   ])
//   try {
//     console.log(pngInfoBuf(a))
//   } catch (e) {
//     console.error("png test failed", e.stack)
//   }
// })()

/*
Part of this source file ported from lodepng and is dual licensed with
the addition of the following license:

Copyright (c) 2005-2019 Lode Vandevenne

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

    1. The origin of this software must not be misrepresented; you must not
    claim that you wrote the original software. If you use this software
    in a product, an acknowledgment in the product documentation would be
    appreciated but is not required.

    2. Altered source versions must be plainly marked as such, and must not be
    misrepresented as being the original software.

    3. This notice may not be removed or altered from any source
    distribution.
*/
