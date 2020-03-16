import * as utf8 from "./utf8"
import * as base64 from "../common/base64"
import * as M from "../common/messages"
import { rpc } from "./rpc"
import { FetchResponse, FetchHeaders, FetchRequest } from "./fetch"
import { ScriptEnv } from "./scriptenv"

export const Base64 = {
  encode(data :Uint8Array|ArrayBuffer|string) :string {
    return base64.fromByteArray(
      typeof data == "string" ? utf8.encode(data) :
      data instanceof ArrayBuffer ? new Uint8Array(data) :
      data
    )
  },
  decode(encoded :string) :Uint8Array {
    return base64.toByteArray(encoded)
  },
}


export function confirm(question :string) :Promise<bool> {
  return rpc<M.UIConfirmRequestMsg,M.UIConfirmResponseMsg>(
    "ui-confirm", "ui-confirm-response", { question }
  ).then(r => r.answer)
}


export function fetch(input :any, init? :object) :Promise<FetchResponse> {
  return rpc<M.FetchRequestMsg,M.FetchResponseMsg>(
    "fetch-request", "fetch-response", { input, init }
  ).then(r => new FetchResponse(r))
}


export interface CancellablePromise<T=void> extends Promise<T> { cancel():void }


// type CancellablePromiseInit<R> = (
//   resolve :(v?:R)=>void,
//   reject? :(reason?:any)=>void,
//   cancel? :(reason? :any)=>void
// ) => void

// new <T>(
//   executor: (
//     resolve: (value?: T | PromiseLike<T>) => void,
//     reject: (reason?: any) => void
//   ) => void
// ): Promise<T>;


export function createCancellablePromise<T>(
  executor :(
    resolve  : (v? :T | PromiseLike<T>) => void,
    reject   : ((reason?:any)=>void),
    oncancel : (f:()=>void)=>void
  )=>void,
) :CancellablePromise<T> {
  let cancel :()=>void = ()=>{}
  let p = new Promise<T|"TIMEOUT">((resolve, reject) => {
    let done = false
    let cancelled = false
    const userResolve = (v? :T|PromiseLike<T>) => {
      resolve(v)
      done = true
    }
    const userReject = (reason? :any) => {
      done = true
      reject(reason)
    }
    let userCancel :()=>void
    const oncancel = (f :()=>void) => {
      userCancel = f
    }
    cancel = () => {
      if (!done && !cancelled) {
        cancelled = true
        if (!userCancel) {
          console.error("CancellablePromise cancelled without an oncancel handler")
        } else {
          userCancel()
        }
      }
    }
    executor(userResolve, userReject, oncancel)
  }) as CancellablePromise<T>
  p.cancel = cancel
  return p
}


export function withTimeout<
  P extends CancellablePromise<R>,
  R = P extends Promise<infer U> ? U : P
>(this :ScriptEnv, p :P, timeout :number) :CancellablePromise<R|"TIMEOUT"> {
  let t = this.Timer(timeout) // Start our timeout timer
  let done = false
  let cancel :()=>void = ()=>{}
  let p2 = new Promise<R|"TIMEOUT">((resolve, reject) => {
    cancel = () => {
      if (!done) {
        resolve("TIMEOUT") // signal timeout
        p.cancel() // cancel the user promise
        t.cancel() // cancel the time in case p2.cancel was called
        done = true
      }
    }
    p.then(r => {
      if (!done) {
        resolve(r)
        t.cancel() // cancel the timeout timer
        done = true
      }
    })
    t.then(() => { cancel() }).catch(()=>{})
  }) as CancellablePromise<R|"TIMEOUT">
  p2.cancel = cancel
  return p2
}
