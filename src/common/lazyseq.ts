export interface LazySeq<T, OffsT = T|undefined, LenT = number|undefined> extends Iterable<T> {
  // duplicated in scripter-env.d.ts

  readonly length :LenT  // Infinity if unbounded
  map<R>(f :(value :T, index :number)=>R) :R[]
  array() :T[]
  at(index :number) :OffsT
}


export class LazyNumberSequence implements LazySeq<number,number,number> {
  readonly __scripter_lazy_seq__ = "n"
  readonly length :number
  readonly start  :number
  readonly end    :number
  readonly step   :number

  constructor(start :number, end :number, step :number) {
    this.length = Math.ceil(Math.max(0, end - start) / step)
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
    let a :R[] = []
    for (let i = 0, v = this.start; v < this.end; v += this.step) {
      a.push(f(v, i++))
    }
    return a
  }

  array() :number[] {
    let a :number[] = []
    for (let v = this.start; v < this.end; v += this.step) {
      a.push(v)
    }
    return a
  }

  at(index :number) :number {
    return this.start + (this.step * index)
  }
}

