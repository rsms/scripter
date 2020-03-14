export function delayed<R>(delay :number, f :()=>Promise<R>) :Promise<R> {
  return new Promise<R>((resolve, reject) => {
    setTimeout(() => f().then(resolve).catch(reject), delay)
  })
}
