type EventHandler<T=any> = (data :T)=>void

const events = Symbol('events')

export class EventEmitter<EventMap = {[k:string]:any}> {
  _events :Map<keyof EventMap,Set<EventHandler>>

  addListener<K extends keyof EventMap>(e :K, handler :EventHandler<EventMap[K]>) {
    let m = this._events
    let s :Set<EventHandler>
    if (!m) {
      this._events = m = new Map()
    } else if (s = m.get(e)) {
      s.add(handler)
      return
    }
    s = new Set<EventHandler>([handler])
    m.set(e, s)
  }

  on<K extends keyof EventMap>(e :K, handler :EventHandler<EventMap[K]>) {
    return this.addListener(e, handler)
  }

  removeListener<K extends keyof EventMap>(e :K, handler :EventHandler<EventMap[K]>) {
    let m = this._events
    let s :Set<EventHandler>
    if (m && (s = m.get(e))) {
      s.delete(handler)
      if (s.size == 0) {
        m.delete(e)
      }
    }
  }

  emitEvent<K extends keyof EventMap>(e :K, data? :EventMap[K]) {
    let m = this._events
    let s :Set<EventHandler<EventMap[K]>>
    if (m && (s = m.get(e))) {
      for (let handler of s) {
        handler(data)
      }
    }
  }
}
