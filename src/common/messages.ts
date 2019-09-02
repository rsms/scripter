export interface EvalRequestMsg {
  type    :"eval"
  id      :string  // opaque eval request ID
  js      :string
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
  reqId   :string
  srcPos  :{line:number,column:number}  // source code position where error originated
  srcLineOffset :number  // line offset of source code (for sourcemap)
}
