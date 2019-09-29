export type TypedArray = Int8Array
                       | Uint8Array
                       | Uint8ClampedArray
                       | Int16Array
                       | Uint16Array
                       | Int32Array
                       | Uint32Array
                       | Float32Array
                       | Float64Array

// Note: BigInt64Array and BigUint64Array are intentionally left out of the TypedArray
// definition since their index signatures are different, making the TypedArray union
// less useful.

// isTypedArray is a type guard for TypedArray
export const isTypedArray :(v:any) => v is TypedArray = (() => {
  let v = new Uint8Array(0)
  if ((v as any).__proto__ !== Object.prototype &&
      typeof (v as any).__proto__.constructor == "function"
  ) {
    // for runtimes with an underlying TypedArray constructor, use that instead of
    // property testing. It's both more reliable and faster.
    let typedArrayProto :Function = (v as any).__proto__.constructor
    return (v:any) :v is TypedArray => {
      return v instanceof typedArrayProto
    }
  }
  // fallback implementation that makes a best-guess by looking for properties
  return (v:any) :v is TypedArray => {
    return v.buffer instanceof ArrayBuffer && "BYTES_PER_ELEMENT" in v
  }
})()
