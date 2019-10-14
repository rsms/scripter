export interface UIInput<ValueT = any> {
  readonly el :HTMLElement
  readonly value :ValueT

  onMountDOM() :void
  onUnmountDOM() :void

  on(event:"input", f:(value:ValueT)=>void)
  on(event:"change", f:(value:ValueT)=>void)

  removeListener(event:"input", f:(value:ValueT)=>void)
  removeListener(event:"change", f:(value:ValueT)=>void)
}
