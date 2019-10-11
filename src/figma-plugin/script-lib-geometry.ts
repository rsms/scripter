export class Rect {
  constructor(
    public x     :number,
    public y     :number,
    public width :number,
    public height :number,
  ) {}

  position() :Vec {
    return new Vec(this.x, this.y)
  }

  containsPoint(v :Vec) {
    return (
      v.x >= this.x && v.x <= this.x + this.width &&
      v.y >= this.y && v.y <= this.y + this.width
    )
  }

  translate(v :Vec) {
    return new Rect(this.x + v.x, this.y + v.y, this.width, this.height)
  }

  toString() :string {
    return `(${this.x}, ${this.y}, ${this.width}, ${this.height})`
  }
}


export class Vec implements Vector {
  x :number
  y :number

  constructor(x :number, y :number)
  constructor(v :Vector)
  constructor(xv :number|Vector, y? :number) {
    if (y === undefined) {
      this.x = (xv as Vector).x
      this.y = (xv as Vector).y
    } else {
      this.x = xv as number
      this.y = y
    }
  }

  isInside(r :Rect) {
    return (
      this.x >= r.x && this.x <= r.x + r.width &&
      this.y >= r.y && this.y <= r.y + r.width
    )
  }

  distanceTo(v :Vec) :number {
    let x = this.x - v.x
    let y = this.y - v.y
    return Math.sqrt(x * x + y * y)
  }

  sub(v :Vec|number) :Vec {
    return (typeof v == "number" ?
      new Vec(this.x - v, this.y - v) :
      new Vec(this.x - v.x, this.y - v.y) )
  }
  add(v :Vec|number) :Vec {
    return (typeof v == "number" ?
      new Vec(this.x + v, this.y + v) :
      new Vec(this.x + v.x, this.y + v.y) )
  }
  mul(v :Vec|number) :Vec {
    return (typeof v == "number" ?
      new Vec(this.x * v, this.y * v) :
      new Vec(this.x * v.x, this.y * v.y) )
  }
  div(v :Vec|number) :Vec {
    return (typeof v == "number" ?
      new Vec(this.x / v, this.y / v) :
      new Vec(this.x / v.x, this.y / v.y) )
  }

  toString() :string {
    return `(${this.x}, ${this.y})`
  }
}
