import { TransactionalMsg, RPCErrorResponseMsg } from "../common/messages"


interface Transaction<T extends TransactionalMsg = TransactionalMsg> {
  readonly id       :string
  readonly p        :Promise<T>
  readonly canceled :bool

  cancel() :void
  resolve(result: T) :void
  reject(reason? :any) :void
}


// transactions maps { resMsgType => { id => tx } }
const transactions = new Map<string,Map<string,Transaction>>()

function newTransactionId() :string {
  return "tx-" + (Date.now()).toString(36)
}

function enqueueTransaction<T extends TransactionalMsg>(resMsgType :string, tx :Transaction<T>) {
  let m = transactions.get(resMsgType)
  if (!m) {
    transactions.set(
      resMsgType,
      new Map<string,Transaction>([[tx.id, tx]])
    )
  } else {
    m.set(tx.id, tx)
  }
}

function dequeueTransaction(resMsgType :string, id :string) :bool {
  let m = transactions.get(resMsgType)
  if (m) {
    return m.delete(id)
  }
  return false
}

export function handleTransactionResponse<T>(msg :TransactionalMsg) :bool {
  let type = msg.type
  let isError = false
  if (type == "rpc-error-response") {
    isError = true
    type = (msg as RPCErrorResponseMsg).responseType
  }
  let m = transactions.get(type)
  if (m) {
    let tx = m.get(msg.id)
    if (tx) {
      try {
        if (isError) {
          let emsg = msg as RPCErrorResponseMsg
          let e = new Error()
          e.name = "RpcError"
          e.message = emsg.message
          e.stack = emsg.stack
          tx.reject(e)
        } else {
          tx.resolve(msg)
        }
      } catch (err) {
        console.error(`[rpc] error while resolving transaction ${tx.id}: ${err.stack||err}`)
      }
      return true // did handle the message
    }
  }
  return false // didn't handle the message
}


function cancel_canceled() {
  throw new Error("transaction already cancelled")
}


export function rpc<In extends TransactionalMsg, Out extends TransactionalMsg>(
  reqMsgType :In["type"],
  resMsgType :Out["type"],
  params? :Omit<In, "id"|"type">,
) :Promise<Out> {
  let id = newTransactionId()

  let tx :Transaction<Out> = {
    id: id,
    p: null as unknown as Promise<Out>,
    canceled: false,
    resolve: function(){},
    reject: function(){},

    cancel() :void {
      dequeueTransaction(resMsgType, id)
      ;(tx as any).canceled = true
      tx.cancel = cancel_canceled
    },
  }

  // create & setup promise
  ;(tx as any).p = new Promise<Out>((resolve, reject) => {
    tx.resolve = resolve
    tx.reject = reject
  })

  // register transaction
  enqueueTransaction(resMsgType, tx)

  // send request
  let msg = { type: reqMsgType, id }
  if (params && typeof params == "object") {
    msg = Object.assign(msg, params)
  }
  figma.ui.postMessage(msg)

  return tx.p
}
