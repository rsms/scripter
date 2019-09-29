// TODO: to support good old windows...
// const iswin32 = typeof process != 'undefined' && process.platform == 'win32'
// and check for \ in paths.

type int = number


const SL = 0x2F  // '/'
    , DOT = 0x2E // .'


// dir returns the directory part of a path, or "." if no directory part.
//
export function dir(path :string) :string {
  if (path.indexOf('/') == -1) {
    return '.'
  }
  path = clean(path)
  let p = path.lastIndexOf('/')
  return (
    p == -1 ? '.' :
    p == path.length - 1 ? path : // "/"
    path.substr(0, p)
  )
}

// TEST("dir", () => {
//   assert(dir("/a/b/c") == "/a/b")
//   assert(dir("a/b/c") == "a/b")
//   assert(dir("a/b") == "a")
//   assert(dir("/") == "/")
//   assert(dir("a") == ".")
//   assert(dir("") == ".")
// })


// base returns the base of the path
//
export function base(path :string) :string {
  if (path == "") {
    return "."
  }
  path = path.replace(/\/+$/, "")  // strip trailing "/"
  let i = path.lastIndexOf('/')
  if (i != -1) {
    path = path.substr(i+1)
  }
  if (path == "") {
    return "/"
  }
  return path
}


export function ext(name :string) :string {
  let a = name.lastIndexOf("/")
  let b = name.lastIndexOf(".")
  if (a > b) {
    return ""
  }
  return name.substr(b+1)
}



class lazybuf {
  // The code in this class has been ported from Go and the following
  // license applies:
  //   Copyright 2009 The Go Authors. All rights reserved.
  //   Use of this source code is governed by a BSD-style
  //   license that can be found in the LICENSE file.
  //   https://golang.org/LICENSE

  buf :string|null = null
  w   :int = 0

  constructor(
    public s :string,
  ) {}

  index(i :int) :int {
    return this.buf !== null ? this.buf.charCodeAt(i) : this.s.charCodeAt(i)
  }

  append(c :int) {
    if (this.buf === null) {
      if (this.w < this.s.length && this.s.charCodeAt(this.w) == c) {
        this.w++
        return
      }
      this.buf = this.s.substr(0, this.w)
    }
    if (this.w < this.buf.length-1) {
      // w was reverted
      this.buf = this.buf.substr(0, this.w)
    }
    this.buf += String.fromCharCode(c) // ugh, javascript...
    this.w++
  }

  toString() :string {
    return (
      this.buf === null ? this.s.substr(0,this.w) :
      this.buf.substr(0, this.w)
    )
  }
}


// clean
//
export function clean(path :string) :string {
  // The code in this function has been ported from Go and the following
  // license applies:
  //   Copyright 2009 The Go Authors. All rights reserved.
  //   Use of this source code is governed by a BSD-style
  //   license that can be found in the LICENSE file.
  //   https://golang.org/LICENSE

  if (path == "") {
    return "."
  }

  const rooted = path.charCodeAt(0) == SL
  const n = path.length

  // Invariants:
  //  reading from path; r is index of next byte to process.
  //  writing to buf; w is index of next byte to write.
  //  dotdot is index in buf where .. must stop, either because
  //    it is the leading slash or it is a leading ../../.. prefix.
  let out = new lazybuf(path)
  let r = 0, dotdot = 0

  if (rooted) {
    out.append(SL)
    r = 1
    dotdot = 1
  }

  while (r < n) {
    const c0 = path.charCodeAt(r)
    if (c0 == SL) {
      // empty path element
      r++
    } else if (c0 == DOT && (r+1 == n || path.charCodeAt(r+1) == SL)) {
      // . element
      r++
    } else if (
      c0 == DOT &&
      path.charCodeAt(r+1) == DOT &&
      (r+2 == n || path.charCodeAt(r+2) == SL)
    ) {
      // .. element: remove to last /
      r += 2
      if (out.w > dotdot) {
        // can backtrack
        out.w--
        while (out.w > dotdot && out.index(out.w) != SL) {
          out.w--
        }
      } else if (!rooted) {
        // cannot backtrack, but not rooted, so append .. element.
        if (out.w > 0) {
          out.append(SL)
        }
        out.append(DOT)
        out.append(DOT)
        dotdot = out.w
      }
    } else {
      // real path element.
      // add slash if needed
      if (rooted && out.w != 1 || !rooted && out.w != 0) {
        out.append(SL)
      }
      // copy element
      // for (; r < n && path.charCodeAt(r) != SL; r++) {
      //   out.append(path.charCodeAt(r))
      // }
      let c :int
      for (; r < n; r++) {
        c = path.charCodeAt(r)
        if (c == SL) {
          break
        }
        out.append(c)
      }
    }
  }

  // Turn empty string into "."
  if (out.w == 0) {
    return "."
  }

  return out.toString()
}

// TEST("clean", () => {
//   function t(input :string, expect :string) {
//     const result = clean(input)
//     assert(result == expect,
//       `expected ${JSON.stringify(input)} => ${JSON.stringify(expect)}` +
//       ` but instead got ${JSON.stringify(result)}`)
//   }
//   t("a/c", "a/c")
//   t("a/c/", "a/c")
//   t("/a/c", "/a/c")
//   t("a//c", "a/c")
//   t("a/c/.", "a/c")
//   t("a/c/b/..", "a/c")
//   t("/../a/c", "/a/c")
//   t("/../a/b/../././/c", "/a/c")
//   t("", ".")
//   t("/", "/")
// })


// isAbs returns true if the path is absolute
//
export function isAbs(path :string) :bool {
  return path.charCodeAt(0) == SL
}

// TEST("isAbs", () => {
//   assert(isAbs("/foo/bar") === true)
//   assert(isAbs("foo/bar") === false)
// })


// join glues paths together
//
export function join(...paths :string[]) :string {
  if (paths.length == 1 && Array.isArray(paths[0])) {
    // support calling join(["a", "b"])
    paths = (paths as any)[0] as string[]
  }
  let s = ''
  for (let i = 0; i < paths.length; i++) {
    if (paths[i] != '') {
      return clean((i == 0 ? paths : paths.slice(i)).join('/'))
    }
  }
  return s
}

// TEST("join", () => {
//   function t(inputs :string[], expect :string) {
//     const result = join.apply(null, inputs)
//     assert(result == expect,
//       `expected ${JSON.stringify(inputs)} => ${JSON.stringify(expect)}` +
//       ` but instead got ${JSON.stringify(result)}`)
//   }
//   t(["a", "b", "c"], "a/b/c")
//   t(["a", "b/c"], "a/b/c")
//   t(["a/b/", "c"], "a/b/c")
//   t(["a/b//", "//c"], "a/b/c")
//   t(["/a/b//", "//c"], "/a/b/c")
//   t(["/a/b//", "//c/"], "/a/b/c")
//   t(["", ""], "")
//   t(["a", ""], "a")
//   t(["", "a"], "a")
// })


export function split(path :string) :string[] {
  path = path.replace(/^\/+/, "/")  // collapse leading "/"
  path = path.replace(/\/+$/, "")  // strip trailing "/"
  return path.split(/\/+/)
}
