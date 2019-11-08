import * as utf8 from "./utf8"
import * as base64 from "../common/base64"
import * as M from "../common/messages"
import { rpc } from "./rpc"
import { FetchResponse, FetchHeaders, FetchRequest } from "./fetch"

export function base64Encode(data :Uint8Array|ArrayBuffer|string) :string {
  return base64.fromByteArray(
    typeof data == "string" ? utf8.encode(data) :
    data instanceof ArrayBuffer ? new Uint8Array(data) :
    data
  )
}

export function base64Decode(encoded :string) :Uint8Array {
  return base64.toByteArray(encoded)
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
