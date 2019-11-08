/// <reference path="./evalscript.d.ts" />
import { rpc } from "./rpc"
import * as M from "../common/messages"
import { getTopLevelSourcePos } from "./script-lib-runtime"

export interface LibUI {
  notify(message: string, options?: NotificationOptions): NotificationHandler
  rangeInput(init? :M.UIRangeInputInit): AsyncIterable<number>
}

// libui
//
const libui_base = {
  notify: (figma as any).notify,  // TODO: update figplug
}
//
// Some of its functions makes use of script request ID and thus this returns
// a new object based on libui_base with additional functions with a closure
// around scriptReqId.
//
export function create_libui(scriptReqId :string) :LibUI { return {
  // Note: Spread "...other" is not supported in the plugin code (fig-js)
  __proto__: libui_base,

  rangeInput(init? :M.UIRangeInputInit): AsyncIterable<number> {
    if (init) {
      let step = init.step !== undefined ? init.step as number : 1
      let min  = init.min  !== undefined ? init.min as number : 0
      let max  = init.max  !== undefined ? init.max as number : 1
      if (step == 0) { throw new Error("zero step") }
      if (step > 0 && max < min) { throw new Error("max < min") }
      if (step < 0 && max > min) { throw new Error("max > min") }
    }
    let srcPos = getTopLevelSourcePos()
    return {
      [Symbol.asyncIterator]() {
        return new UIInputIterator<M.UIRangeInputRequestMsg>(srcPos, scriptReqId, "range", init)
      }
    }
  },

} as any as LibUI }


let nextInstanceId = 0


class UIInputIterator<ReqT extends M.UIInputRequestMsg = M.UIInputRequestMsg> {
  readonly srcPos      :M.SourcePos
  readonly scriptReqId :string
  readonly init?       :ReqT["init"]
  readonly type        :ReqT["controllerType"]
  readonly instanceId  :string

  // state
  value = 0
  done = false

  constructor(
    srcPos :M.SourcePos,
    scriptReqId :string,
    type :ReqT["controllerType"],
    init? :ReqT["init"],
  ) {
    this.srcPos = srcPos
    this.scriptReqId = scriptReqId
    this.init = init
    this.type = type
    this.instanceId = "instance-" + (nextInstanceId++).toString(36)
  }

  async next(...args: []): Promise<IteratorResult<number>> {
    if (this.done) {
      return { value: this.value, done: true }
    }

    // dlog("UIInputIterator send request instanceId=" + this.instanceId)

    let r = await rpc<ReqT, M.UIInputResponseMsg>("ui-input-request", "ui-input-response", {
      instanceId: this.instanceId,
      srcPos: this.srcPos,
      srcLineOffset: evalScript.lineOffset,
      scriptReqId: this.scriptReqId,
      controllerType: this.type,
      init: this.init,
    } as ReqT)

    if (r.done) {
      this.done = true
      if (this.value == r.value) {
        // no tail value
        return { value: this.value, done: true }
      }
    }

    this.value = r.value

    return { value: this.value, done: false }
  }

}
