import { FetchRequestMsg, FetchResponseMsg } from "../common/messages"
import * as utf8 from "./utf8"


class FetchReadableStream<R = any> implements ReadableStream<R> {
  readonly locked: boolean = false

  cancel(reason?: any): Promise<void> { return Promise.resolve() }

  getReader(options: { mode: "byob" }): ReadableStreamBYOBReader;
  getReader(): ReadableStreamDefaultReader<R>;
  getReader(options?: { mode: "byob" }): ReadableStreamDefaultReader<R>|ReadableStreamBYOBReader {
    return undefined as unknown as ReadableStreamDefaultReader<R>
  }

  pipeThrough<T>(
    { writable, readable }: { writable: WritableStream<R>, readable: ReadableStream<T> },
    options?: PipeOptions,
  ): ReadableStream<T> {
    return undefined as unknown as ReadableStream<T>
  }

  pipeTo(dest: WritableStream<R>, options?: PipeOptions): Promise<void> {
    return Promise.reject(new Error("unsupported"))
  }

  tee(): [ReadableStream<R>, ReadableStream<R>] {
    return [null,null] as unknown as [ReadableStream<R>, ReadableStream<R>]
  }
}


export class FetchHeaders implements Headers {
  _headers :{[k:string]:string}

  constructor(init? :HeadersInit) {
    // Headers | string[][] | Record<string, string>
    this._headers = {}
    if (init) {
      if (Array.isArray(init)) {
        // string[][]
        for (let e of init) {
          this._headers[e[0]] = String(e[1]).toLowerCase()
        }
      } else {
        // Headers | Record<string, string>
        if (init instanceof FetchHeaders) {
          init = init._headers
        }
        for (let k of Object.keys(init)) {
          this._headers[k] = String(init[k]).toLowerCase()
        }
      }
    }
  }

  // Headers interface
  append(name: string, value: string): void {
    name = name.toLowerCase()
    if (name in this._headers) {
      this._headers[name] += "," + value
    }
  }

  delete(name: string): void {
    delete this._headers[name.toLowerCase()]
  }

  get(name: string): string | null {
    let v = this._headers[name.toLowerCase()]
    return v === undefined ? null : v
  }

  has(name: string): boolean {
    return name.toLowerCase() in this._headers
  }

  set(name: string, value: string): void {
    this._headers[name.toLowerCase()] = value
  }

  forEach(f: (value: string, key: string, parent: Headers) => void, thisArg?: any): void {
    let self :any = thisArg || this
    for (let k of Object.keys(this._headers)) {
      f.call(self, this._headers[k], k, this)
    }
  }
}


// type FormDataEntryValue = File | string;


export class FetchFormData implements FormData {
  _m :{[k:string]:Set<FormDataEntryValue>} = {}

  constructor(init? :HTMLFormElement) {
    if (init) {
      throw new Error("<form> element not supported by scripter")
    }
  }

  set(name: string, value: string|Blob, _fileName?: string): void {
    if (typeof value != "string") {
      throw new Error("Blobs not supported by scripter")
    }
    this._m[name] = new Set([value])
  }

  append(name: string, value: string|Blob, _fileName?: string): void {
    if (typeof value != "string") {
      throw new Error("Blobs not supported by scripter")
    }
    let s = this._m[name]
    if (s) {
      s.add(value)
    } else {
      this._m[name] = new Set([value])
    }
  }

  delete(name: string): void {
    delete this._m[name]
  }

  get(name: string): FormDataEntryValue|null {
    let s = this._m[name]
    if (s) for (let v of s) {
      return v
    }
    return null
  }

  getAll(name: string): FormDataEntryValue[] {
    let s = this._m[name]
    return s ? Array.from(s) : []
  }

  has(name: string): boolean {
    return name in this._m
  }

  forEach(f: (value: FormDataEntryValue, key: string, parent: FormData) => void, thisArg?: any): void {
    let self :any = thisArg || this
    for (let k of Object.keys(this._m)) {
      for (let v of this._m[k]) {
        f.call(self, v, k, this)
      }
    }
  }
}


function parseFormData(s :string) :FormData {
  let d = new FormData()
  // TODO
  return d
}


export class FetchResponse implements Response {
  // Response interface
  readonly headers: Headers  // actually FetchHeaders
  readonly ok: boolean
  readonly redirected: boolean
  readonly status: number
  readonly statusText: string
  readonly trailer: Promise<Headers>  // always rejected
  readonly type: ResponseType
  readonly url: string

  // Body interface
  readonly bodyUsed: boolean
  readonly body: ReadableStream<Uint8Array>|null  // actually FetchReadableStream

  // local
  readonly _bodybuf :Uint8Array

  constructor(r :FetchResponseMsg) {
    this.headers = new FetchHeaders(r.headers)
    this.ok = r.status >= 200 && r.status < 300
    this.redirected = r.redirected
    this.status = r.status
    this.statusText = r.statusText
    this.trailer = Promise.reject(new Error("Response.trailer unsupported in Scripter"))
    this.type = r.resType
    this.url = r.url
    this.bodyUsed = !!r.body
    this.body = this.bodyUsed ? new FetchReadableStream() : null
    this._bodybuf = r.body ? r.body : new Uint8Array(0)
  }

  // Response interface
  clone(): Response {
    throw new Error("not implemented")
    // return null as unknown as Response
  }

  // Body interface
  arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(this._bodybuf.buffer)
  }

  blob(): Promise<Blob> {
    throw new Error("Blob not supported")
  }

  formData(): Promise<FormData> {
    return this.text().then(parseFormData)
  }

  json(): Promise<any> {
    return this.text().then(JSON.parse)
  }

  text(): Promise<string> {
    // TODO: look at this.headers.get("content-type") and decode non-UTF8 when needed
    return Promise.resolve(utf8.decode(this._bodybuf))
  }
}


class FetchAbortSignal /*implements AbortSignal*/ {
  readonly aborted: boolean = false;

  set onabort(f :((this: AbortSignal, ev: Event)=>any)|null) {
    throw new Error("AbortSignal unsupported")
  }

  // EventTarget interface
  addEventListener(
    // type: string,
    // listener: ((ev:Event)=>any)|null,
    // options?: EventListenerOptions|boolean,
  ): void {
    throw new Error("AbortSignal unsupported")
  }

  dispatchEvent(/*ev: Event*/): boolean {
    return false
  }

  removeEventListener(
    // type: string,
    // listener: ((ev:Event)=>any)|null | null,
    // options?: EventListenerOptions|boolean,
  ): void {
  }
}


export class FetchRequest implements Request {
  // Request interface
  readonly cache: RequestCache;
  readonly credentials: RequestCredentials;
  readonly destination: RequestDestination;
  readonly headers: Headers;
  readonly integrity: string;
  readonly isHistoryNavigation: boolean = false
  readonly isReloadNavigation: boolean = false
  readonly keepalive: boolean;
  readonly method: string;
  readonly mode: RequestMode;
  readonly redirect: RequestRedirect;
  readonly referrer: string;
  readonly referrerPolicy: ReferrerPolicy;
  readonly signal: AbortSignal;
  readonly url: string;

  // Body interface
  readonly bodyUsed: boolean = false
  readonly body: ReadableStream<Uint8Array>|null = null


  constructor(input: RequestInfo, init?: RequestInit) {
    let p :RequestInit = {}
    if (typeof input == "string") {
      this.url = input
    } else {
      for (let k of Object.keys(FetchRequest.prototype)) {
        let v = input[k]
        if (v !== undefined) {
          this[k] = v
        }
      }
    }

    this.cache = p.cache || "default"
    this.credentials = p.credentials || "same-origin"
    this.destination = ""
    this.headers = new FetchHeaders(p.headers)
    this.integrity = p.integrity || ""
    this.keepalive = !!p.keepalive
    this.method = p.method || "GET"
    this.mode = p.mode || "cors"
    this.redirect = p.redirect || "follow"
    this.referrer = p.referrer || "about:scripter"
    this.referrerPolicy = p.referrerPolicy || ""
    this.signal = new FetchAbortSignal() as AbortSignal
  }


  clone(): Request {
    // TODO implement
    throw new Error("clone not supported")
  }

  // Body interface

  arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0))
  }

  blob(): Promise<Blob> {
    throw new Error("Blob not supported")
  }

  formData(): Promise<FormData> {
    return Promise.resolve(new FormData())
  }

  json(): Promise<any> {
    return Promise.resolve(null)
  }

  text(): Promise<string> {
    return Promise.resolve("")
  }
};

