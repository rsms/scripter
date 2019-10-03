export interface LazySeq<T, OffsT = T|undefined, LenT = number|undefined> extends Iterable<T> {
  // duplicated in scripter-env.d.ts

  readonly length :LenT  // Infinity if unbounded
  map<R>(f :(value :T, index :number)=>R) :R[]
  array() :T[]
  at(index :number) :OffsT
  join(glue :string) :string
}


export class LazyNumberSequence implements LazySeq<number,number,number> {
  readonly __scripter_lazy_seq__ = "n"
  readonly length :number
  readonly start  :number
  readonly end    :number
  readonly step   :number

  constructor(start :number, end :number, step :number) {
    this.length = end === Infinity ? Infinity : Math.ceil(Math.max(0, end - start) / step)
    this.start = start
    this.end = end
    this.step = step
  }

  [Symbol.iterator]() :Iterator<number> {
    let value = this.start, end = this.end, step = this.step
    return {
      next() :IteratorResult<number> {
        if (value >= end) {
          return {done:true, value:0}
        }
        let v = value
        value += step
        return {value: v, done:false}
      }
    }
  }

  map<R>(f :(value :number, index :number)=>R) :R[] {
    if (this.end === Infinity) {
      throw new Error("infinite sequence")
    }
    let a :R[] = []
    for (let i = 0, v = this.start; v < this.end; v += this.step) {
      a.push(f(v, i++))
    }
    return a
  }

  array() :number[] {
    if (this.end === Infinity) {
      throw new Error("infinite sequence")
    }
    let a :number[] = []
    for (let v = this.start; v < this.end; v += this.step) {
      a.push(v)
    }
    return a
  }

  toString() :string {
    let glue = ", "
    if (this.end === Infinity) {
      let s = ""
      let i = 0
      for (let val of this) {
        if (i > 0) {
          if (i > 50) {
            s += " ... ∞"
            break
          }
          s += glue
        }
        s += val
        i++
      }
      return s
    }
    return this.join(glue)
  }

  join(glue :string) :string {
    let s = ""
    let i = 0
    if (this.end === Infinity) {
      throw new Error("infinite sequence")
    } else {
      for (let val of this) {
        if (i > 0) {
          s += glue
        }
        s += val
        i++
      }
    }
    return s
  }

  at(index :number) :number {
    return this.start + (this.step * index)
  }
}

