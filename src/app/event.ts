type EventHandler<T=any> = (data :T)=>void

export class EventEmitter<EventMap = {[k:string]:any}> {
  _events = new Map<keyof EventMap,Set<EventHandler>>()

  addListener<K extends keyof EventMap>(e :K, handler :EventHandler<EventMap[K]>) {
    let s = this._events.get(e)
    if (s) {
      s.add(handler)
    } else {
      this._events.set(e, new Set<EventHandler>([handler]))
    }
  }

  on<K extends keyof EventMap>(e :K, handler :EventHandler<EventMap[K]>) {
    return this.addListener(e, handler)
  }

  removeListener<K extends keyof EventMap>(e :K, handler :EventHandler<EventMap[K]>) {
    let s = this._events.get(e)
    if (s) {
      s.delete(handler)
      if (s.size == 0) {
        this._events.delete(e)
      }
    }
  }

  removeListeners<K extends keyof EventMap>(e :K) {
    this._events.delete(e)
  }

  removeAllListeners() {
    this._events.clear()
  }

  triggerEvent<K extends keyof EventMap>(e :K, data? :EventMap[K]) {
    let s = this._events.get(e)
    if (s) for (let handler of s) {
      handler(data)
    }
  }
}

EventEmitter.prototype.on = EventEmitter.prototype.addListener
