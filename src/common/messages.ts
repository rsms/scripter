export interface EvalRequestMsg {
  type :"eval"
  id   :string  // opaque eval request ID
  js   :string
}

export interface EvalCancellationMsg {
  type :"eval-cancel"
  id   :string  // opaque eval request ID
}

export interface EvalResponseMsg {
  type :"eval-response"
  id   :string  // opaque eval request ID

  // when ok
  result? :any     // result of successful eval

  // when error
  error?         :string  // response is error when not undefined
  srcPos?        :{line:number,column:number}  // source code position where error originated
  srcLineOffset? :number  // line offset of source code (for sourcemap)
}

export interface PrintMsg {
  type    :"print"
  message :string
  reqId   :string  // eval request ID
  srcPos  :{line:number,column:number}  // source code position where error originated
  srcLineOffset :number  // line offset of source code (for sourcemap)
}

export interface ClosePluginMsg {
  type     :"close-plugin"
  message? :string  // optional message passed to figma.closePlugin()
}
