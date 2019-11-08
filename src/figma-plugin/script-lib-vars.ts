import { LibUI } from "./script-lib-ui"
import * as M from "../common/messages"

export function create_libvars(libui :LibUI) {

  class Var<T> {
    _value :T
    onchange :()=>void = ()=>{}
    constructor(value :T){
      this._value = value
    }
    get value() :T { return this._value }
    set value(v :T) {
      if (this._value != v) {
        this._value = v
        this.onchange()
      }
    }

    async showSlider(init? :M.UIRangeInputInit) :Promise<number> {
      if (typeof this._value != "number") {
        throw new Error(`Var is not a number. Sliders can only be shown for numberic vars.`)
      }
      let self = this as unknown as Var<number>
      for await (let val of libui.rangeInput({ ...init, value: self.value })) {
        self.value = val
      }
      return self.value
    }
  }


  class VarBindings {
    vars = new Set<Var<any>>()

    nextUpdateResolve :(continueIteration:bool)=>void
    nextUpdateP :Promise<bool>
    updateTimer :any = null
    coalesceDuration :number

    constructor(coalesceDuration :number = 10) {
      this.coalesceDuration = coalesceDuration
      this.nextUpdateP = new Promise(resolve => {
        this.nextUpdateResolve = resolve
      })
    }

    addVar<T>(value :T) :Var<T> {
      let v = new Var<T>(value)
      this.vars.add(v)
      v.onchange = () => { this._setHasUpdates() }
      if (this.vars.size == 1) {
        this.nextUpdateResolve(false)  // end iteration
        this.nextUpdateP = new Promise(resolve => {
          this.nextUpdateResolve = resolve
        })
      }
      return v
    }

    addVars<T = any>(count :number, value :T) :Var<T>[] {
      let vars :Var<T>[] = []
      while (count--) {
        vars.push(this.addVar<T>(value))
      }
      return vars
    }

    removeVar(v :Var<any>) {
      this.vars.delete(v)
      if (this.vars.size == 0) {
        this.nextUpdateResolve(false)  // end iteration
        clearTimeout(this.updateTimer) ; this.updateTimer = null
      }
    }

    removeAllVars() {
      this.nextUpdateResolve(false)  // end iteration
      clearTimeout(this.updateTimer) ; this.updateTimer = null
    }

    _setHasUpdates() {
      if (this.updateTimer === null) {
        this.updateTimer = setTimeout(
          () => { this._update() },
          this.coalesceDuration
        )
      }
    }

    _update() {
      clearTimeout(this.updateTimer) ; this.updateTimer = null
      this.nextUpdateResolve(true)
      this.nextUpdateP = new Promise(resolve => {
        this.nextUpdateResolve = resolve
      })
    }

    async * updates() {
      while (await this.nextUpdateP) {
        yield
      }
    }
  }

  return {
    VarBindings,
  }

}
