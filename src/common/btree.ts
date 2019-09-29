type byte = number
type int = number

// ANY_BYTE represents "any byte"
export const ANY_BYTE = 0x100

export interface BTreeNode<T> {
  k  :ArrayLike<byte>
  v  :T
  L? :BTreeNode<T>
  R? :BTreeNode<T>
}

export class BTree<T> {
  readonly root :BTreeNode<T>
  constructor(root :BTreeNode<T>) {
    this.root = root
  }

  // returns the entry which exactly matches key
  get(key :ArrayLike<byte>) :T|null {
    return lookup(key, this.root)
  }

  // returns the first entry which is a prefix of `key`
  getPrefixMatch(key :ArrayLike<byte>) :T|null {
    return lookupPrefix(key, this.root)
  }

  // returns a list of all entries which is a prefix of `key`
  getPrefixMatches(key :ArrayLike<byte>) :T[] {
    return lookupPrefixM(key, this.root)
  }
}

function lookup<T>(key :ArrayLike<byte>, n :BTreeNode<T>) :T|null {
  while (n) {
    const c = bufcmp(key, n.k)
    if (c == -1) {
      n = n.L as BTreeNode<T>
    } else if (c == 1) {
      n = n.R as BTreeNode<T>
    } else if (key.length == n.k.length) {
      return n.v
    } else {
      break
    }
  }
  return null
}

// Find first entry which is a prefix of key
function lookupPrefix<T>(key :ArrayLike<byte>, n :BTreeNode<T>) :T|null {
  // let inkey = (key as Array<number>).slice(0, 10).map(v => v.toString(16))
  // console.log(`lookupPrefix ${inkey}`)
  while (n) {
    // let kname = (n.k as Array<number>).map(v => v.toString(16))
    const c = bufcmpPrefix(key, n.k)
    // console.log(`             <> ${kname} (${JSON.stringify(n.v)})`)
    if (c == -1) {
      // console.log(`             -> L`)
      n = n.L as BTreeNode<T>
    } else if (c == 1) {
      // console.log(`             -> R`)
      n = n.R as BTreeNode<T>
    } else {
      // console.log(`             => match`)
      return n.v
    }
  }
  return null
}

function lookupPrefixM<T>(key :ArrayLike<byte>, n :BTreeNode<T>) :T[] {
  let matches :T[] = []
  _lookupPrefixM<T>(key, n, matches)
  return matches
}
function _lookupPrefixM<T>(key :ArrayLike<byte>, n :BTreeNode<T>, matches :T[]) :void {
  while (n) {
    const c = bufcmpPrefix(key, n.k)
    if (c == -1) {
      n = n.L as BTreeNode<T>
    } else if (c == 1) {
      n = n.R as BTreeNode<T>
    } else {
      matches.push(n.v)
      if (n.L && n.R) {
        // fork
        _lookupPrefixM(key, n.L as BTreeNode<T>, matches)
        n = n.R as BTreeNode<T>
      } else if (n.L) {
        n = n.L as BTreeNode<T>
      } else if (n.R) {
        n = n.R as BTreeNode<T>
      } else {
        break
      }
    }
  }
}

function bufcmp(a :ArrayLike<byte>, b :ArrayLike<byte>) :int {
  const aL = a.length, bL = b.length, L = (aL < bL ? aL : bL)
  for (let i = 0; i != L; ++i) {
    if (a[i] != ANY_BYTE && b[i] != ANY_BYTE) {
      if (a[i] < b[i]) { return -1 }
      if (b[i] < a[i]) { return 1 }
    }
  }
  return (
    aL < bL ? -1 :
    bL < aL ? 1 :
    0
  )
}

// inputKey may be longer than testKey.
// only inputKey[0:testKey.length] is considered for comparison.
function bufcmpPrefix(inputKey :ArrayLike<byte>, testKey :ArrayLike<byte>) :int {
  const inputKeyLen = inputKey.length,
        testKeyLen = testKey.length,
        L = (inputKeyLen < testKeyLen ? inputKeyLen : testKeyLen)
  for (let i = 0; i != L; ++i) {
    if (inputKey[i] != ANY_BYTE && testKey[i] != ANY_BYTE) {
      if (inputKey[i] < testKey[i]) { return -1 }
      if (testKey[i] < inputKey[i]) { return 1 }
    }
  }
  return (
    inputKeyLen < testKeyLen ? -1 :
    // Note: considered match even if inputKeyLen > testKeyLen
    0
  )
}


// function lookup<T>(key :ArrayLike<byte>, n :BTreeNode<T>) :T|null {
//   let c = bufcmp(key, n.k)
//   return (
//     (c == -1) ? n.L ? lookup(key, n.L) : null :
//     (c == 1) ? n.R ? lookup(key, n.R) : null :
//     (key.length == n.k.length) ? n.v :
//     null
//   )
// }
