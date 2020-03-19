export function delayed<R>(delay :number, f :()=>Promise<R>) :Promise<R> {
  return new Promise<R>((resolve, reject) => {
    setTimeout(() => f().then(resolve).catch(reject), delay)
  })
}

export function sortedObject<T extends {}>(obj :T) :T {
  let b :T = {} as T
  for (let k of Object.keys(obj).sort()) {
    b[k] = obj[k]
  }
  return b
}
