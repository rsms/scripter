import { ScriptEnv } from "./scriptenv"
import { scriptenv } from "./scriptenv"
import { rpc, sendMsg } from "./rpc"
import {
  WorkerCreateRequestMsg, WorkerCreateResponseMsg,
  WorkerMessageMsg, WorkerErrorMsg, WorkerCtrlMsg,
} from "../common/messages"

type ScripterWorkerFun = scriptenv.ScripterWorkerFun
type ScripterWorkerError = scriptenv.ScripterWorkerError
type ScripterCreateWorkerOptions = scriptenv.ScripterCreateWorkerOptions

interface ScripterWorker extends scriptenv.ScripterWorker {
  _onmessage(msg :WorkerMessageMsg) :void
  _onerror(err :ScripterWorkerError) :void
  _onclose() :void
}


const workerMap = new Map<string,ScripterWorker>()  // workerId => Worker


// called by plugin onmessage dispatch when a worker message is sent from the app
export function handleIncomingMessage(msg :any) {
  let workerId = msg.workerId as string
  let worker = workerMap.get(workerId)
  if (!worker) {
    // this happens naturally for close & terminate messages, as close & terminate
    // are naturally racey.
    dlog(`plugin/worker recv message for non-existing worker#${workerId}:`, msg)
    return
  }

  switch (msg.type) {

  case "worker-message":
    worker._onmessage(msg as WorkerMessageMsg)
    break

  case "worker-error": {
    let m = msg as WorkerErrorMsg
    worker._onerror({
      colno: m.error.colno,
      error: m.error.error,
      filename: m.error.filename,
      lineno: m.error.lineno,
      message: m.error.message,
    })
    break
  }

  case "worker-ctrl": {
    let m = msg as WorkerCtrlMsg
    if (m.signal == "close") {
      // worker closed
      worker._onclose()
      break
    }
    console.error("plugin/worker got unexpected control message: " +
      JSON.stringify(msg, null, 2))
    break
  }

  default:
    console.warn(`plugin/worker recv unexpected message`, msg)
  }
}


class _WorkerError extends Error implements ScripterWorkerError {
  constructor(init? :ScripterWorkerError) {
    super()
    if (init) {
      for (let k in init) {
        ;(this as any)[k] = init[k]
      }
    }
    this.name = "ScripterWorkerError"
  }
}


export function createCreateWorker(env :ScriptEnv, scriptId :string) {

  let initialized = false
  function init() {
    if (initialized) { return }
    initialized = true
    env.scripter.addEndCallback(onScriptEnd)
  }

  function onScriptEnd() {
    // when script ends, end all workers
    // note: copy values as w.terminate might call workerMap.delete
    for (let w of Array.from(workerMap.values())) {
      w.terminate()
    }
    workerMap.clear()
  }

  return function createWorker(
    arg0  :ScripterCreateWorkerOptions | undefined | string | ScripterWorkerFun,
    arg1? :string | ScripterWorkerFun,
  ) :ScripterWorker {
    init()

    let script :string | ScripterWorkerFun = arg1 || (arg0 as string | ScripterWorkerFun)
    let opt :ScripterCreateWorkerOptions = (
      arg1 && arg0 ? (arg0 as ScripterCreateWorkerOptions) : {}
    )

    let js = script.toString()
    let sendq :{data:any,transfer?:Transferable[]}[] = []
    let workerId = ""
    let recvp :Promise<any>|null = null
    let recvr = { resolve: (m:any)=>{}, reject: (reason?:any)=>{} }
    let terminated = false
    let closed = false
    let lastError :ScripterWorkerError|null = null

    function checkTerminated() {
      if (terminated) {
        throw new Error("worker terminated")
      }
    }

    // create ScripterWorker object
    let workerPromiseResolve :()=>void
    let workerPromiseReject :(reason? :any)=>void
    let w = new Promise<void>((resolve, reject) => {
      workerPromiseResolve = resolve
      workerPromiseReject = reject
    }) as any as ScripterWorker

    w.postMessage = (data :any, transfer?: Transferable[]) => {
      checkTerminated()
      sendq.push({ data, transfer })
    }
    w.send = (data :any, transfer?: Transferable[]) => {
      w.postMessage(data, transfer)
    }
    w.recv = () :Promise<any> => {
      checkTerminated()
      if (!recvp) {
        recvp = new Promise((resolve, reject) => ( recvr = { resolve, reject } ))
      }
      return recvp
    }
    w.terminate = () => {
      terminated = true
      w._onclose()
      return w
    }
    w._onmessage = (msg :WorkerMessageMsg) => {
      if (terminated) {
        return
      }
      if (msg.evtype == "message") {
        if (w.onmessage) {
          ;(w as any).onmessage(msg.data)
        }
        if (recvp) {
          recvp = null
          recvr.resolve(msg.data)
        }
      } else {
        if (w.onmessageerror) {
          ;(w as any).onmessageerror(msg.data)
        }
        if (recvp) {
          recvp = null
          recvr.reject(msg.data)
        }
      }
    }
    w._onerror = (err :ScripterWorkerError) => {
      lastError = new _WorkerError(err)
      if (w.onerror) {
        w.onerror(lastError)
      }
    }
    w._onclose = () => {
      if (closed) {
        return
      }
      closed = true
      dlog(`worker#${workerId} closed`)
      terminated = true
      if (recvp) {
        // reject waiting recv() calls
        recvp = null
        recvr.reject(lastError || new Error("worker closed"))
      }
      if (w.onclose) {
        w.onclose()
      }
      if (lastError) {
        workerPromiseReject(lastError)
      } else {
        workerPromiseResolve()
      }
    }

    rpc<WorkerCreateRequestMsg, WorkerCreateResponseMsg>(
      "worker-create-req", "worker-create-res",
    {
      js,
      jsdom: opt.DOM,
    }).then(res => {
      dlog("Worker created", res)

      w.terminate = () => {
        w._onclose()
        if (!terminated) {
          terminated = true
          workerMap.delete(workerId)
          dlog(`[worker] terminating worker#${workerId}`)
          sendMsg<WorkerCtrlMsg>({
            type: "worker-ctrl",
            signal: "terminate",
            workerId,
          })
        }
        return w
      }

      if (terminated) {
        // worker terminated already
        dlog(`[worker] note: worker#${workerId} terminated before it started`)
        w.terminate()
        return
      }

      workerId = res.workerId
      workerMap.set(workerId, w)
      if (w.onerror && res.error) {
        return (w as any).onerror(new _WorkerError(res.error))
      }
      w.postMessage = (data :any, transfer?: Transferable[]) => {
        checkTerminated()
        sendMsg<WorkerMessageMsg>({
          type: "worker-message",
          evtype: "message",
          workerId,
          data,
        })
      }

      // send buffered messages
      for (let ent of sendq) {
        w.postMessage(ent.data, ent.transfer)
      }
      sendq = []
    }).catch(err => {
      console.error(`createWorker: ${err.stack||err}`)
      if (w.onerror) {
        ;(w as any).onerror(new _WorkerError(err))
      }
    })

    return w
  }
}
