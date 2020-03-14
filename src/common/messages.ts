export interface SourcePos {
  line   :number
  column :number
}

export interface Msg {
  type :string
}
export interface TransactionalMsg extends Msg {
  id :string  // opaque transaction ID
}

export interface RPCErrorResponseMsg extends TransactionalMsg {
  type         :"rpc-error-response"
  responseType :string  // original response type
  name         :string
  message      :string
  stack        :string
}

export enum WindowSize {
  SMALL  = 100,
  MEDIUM = 200,
  LARGE  = 300,
  XLARGE = 500,
}

export interface WindowConfigMsg extends Msg {
  type   :"window-config"
  width  :WindowSize
  height :WindowSize
}

export interface EvalRequestMsg extends TransactionalMsg {
  type :"eval"
  js   :string
}

export interface EvalCancellationMsg extends TransactionalMsg {
  type :"eval-cancel"
}

export interface EvalResponseMsg extends TransactionalMsg {
  type :"eval-response"

  // when ok
  result? :any     // result of successful eval

  // when error
  error?   :string  // response is error when not undefined
  srcPos?  :SourcePos[]  // source code position of each stack frame
  srcLineOffset? :number  // line offset of source code (for sourcemap)
}

export interface PrintMsg extends Msg {
  type    :"print"
  message :string
  args?   :any[]   // raw input args. undefined if unable to clone
  reqId   :string  // eval request ID
  srcPos  :SourcePos  // source code position where error originated
  srcLineOffset :number  // line offset of source code (for sourcemap)
}

export interface ClosePluginMsg extends Msg {
  type     :"close-plugin"
  message? :string  // optional message passed to figma.closePlugin()
}

export interface UIConfirmRequestMsg extends TransactionalMsg {
  type     :"ui-confirm"
  question :string
}

export interface UIConfirmResponseMsg extends TransactionalMsg {
  type   :"ui-confirm-response"
  answer :boolean
}

export interface FetchRequestMsg extends TransactionalMsg {
  type  :"fetch-request"
  input :any
  init? :object
}

export interface FetchResponseMsg extends TransactionalMsg {
  type       : "fetch-response"

  headers    : Record<string,string>
  redirected : boolean
  status     : number
  statusText : string
  resType    : ResponseType
  url        : string
  body       : Uint8Array|null
  // trailer    : Promise<Headers>  // TODO add support?
}

export interface ScriptMsg {
  guid :string
  name :string
  body :string
}

// sent from UI to plugin to save a script to Figma
export interface SaveScriptMsg extends Msg {
  type   :"save-script"
  create :bool  // if true, a new node is created if none exists
  script :ScriptMsg
}

// sent from plugin to UI to load a script from Figma
export interface LoadScriptMsg extends Msg {
  type   :"load-script"
  script :ScriptMsg
}

export interface UpdateSavedScriptsIndexMsg extends Msg {
  type  :"update-save-scripts-index"
  guids :string[]
}

// --------------------------------------------------------------------------
// UIInput

export type UIInputType = "range"

export interface UIInputRequestMsg extends TransactionalMsg {
  type  :"ui-input-request"
  scriptReqId    :string  // script invocation id. == EvalRequestMsg.id
  instanceId     :string  // unique per iterator
  srcPos         :SourcePos
  srcLineOffset  :number  // line offset of source code (for sourcemap)
  controllerType :UIInputType
  init?          :object
}

export interface UIRangeInputRequestMsg extends UIInputRequestMsg {
  controllerType :"range"
  init?          :UIRangeInputInit
}

export interface UIRangeInputInit {
  value? :number
  min?   :number
  max?   :number
  step?  :number
}

export function isUIRangeInputRequest(r :UIInputRequestMsg) :r is UIRangeInputRequestMsg {
  return r.controllerType == "range"
}


export interface UIInputResponseMsg extends TransactionalMsg {
  type       : "ui-input-response"
  value      : any
  done?      : boolean
}


// export interface ShowImageRequestMsg extends TransactionalMsg {
//   type   :"show-image-request"
//   source :string|ArrayBuffer|Uint8Array
// }

// export interface ShowImageResponseMsg extends TransactionalMsg {
//   type   :"show-image-response"
// }
