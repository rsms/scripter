export interface UIInput<ValueT = any> {
  readonly el :HTMLElement
  readonly value :ValueT

  // onDidMountElement() :void
  // onWillUnmountElement() :void

  on(event:"input", f:(value:ValueT)=>void)
  on(event:"change", f:(value:ValueT)=>void)

  removeListener(event:"input", f:(value:ValueT)=>void)
  removeListener(event:"change", f:(value:ValueT)=>void)
}
