import { EventEmitter } from "./event"

const print = console.log.bind(console)

const _indexedDB = (typeof window != "undefined") ? (
   window.indexedDB
|| window["mozIndexedDB"]
|| window["webkitIndexedDB"]
|| window["msIndexedDB"]) : null as unknown as IDBFactory


export const supported = !!_indexedDB


// UpgradeFun is a function provided to Database.open and is called when an upgrade is needed.
// The function can modify object stores and indexes during immediate execution.
// In other words: Any code in a promise (or after await) can not modify object stores or indexes.
type UpgradeFun = (t :UpgradeTransaction)=>Promise<void>


interface StoreInfo {
  readonly autoIncrement: boolean
  readonly indexNames: DOMStringList
  readonly keyPath: string | string[]
}

interface DatabaseSnapshot {
  readonly storeNames :string[]
  readonly storeInfo  :Map<string,StoreInfo>
}

interface StoreChangeEvent {
  store :string
  type  :"clear"
}
interface RecordDeleteEvent {
  store :string
  type  :"delete"
  key   :IDBValidKey|IDBKeyRange  // input key, not effective key
}
interface RecordUpdateEvent {
  store :string
  type  :"update"  // put or add
  key   :IDBValidKey
  value :any  // always undefined for remote events
}
type ChangeEvent = StoreChangeEvent | RecordDeleteEvent | RecordUpdateEvent

interface DatabaseEventMap {
  "open": undefined
  "change": ChangeEvent
  "remotechange": ChangeEvent
}

// interface Migrator {
//   // upgradeSchema is called for every version step, i.e. upgrading from
//   // version 3 -> 5 will call:
//   // - upgradeSchema(3, 4, t)
//   // - upgradeSchema(4, 5, t)
//   upgradeSchema(prevVersion :number, newVersion :number, t :UpgradeTransaction)

//   // migrateData is called only once and after all calls to upgradeSchema.
//   migrateData(prevVersion :number, newVersion :number)
// }


// open opens a database, creating and/or upgrading it as needed.
export function open(name :string, version :number, upgradefun? :UpgradeFun) :Promise<Database> {
  let db = new Database(name, version)
  return db.open(upgradefun).then(() => db)
}


// delete removes an entire database
//
export { _delete as delete };function _delete(name :string, onblocked? :()=>void) :Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let r = _indexedDB.deleteDatabase(name)
    r.onblocked = onblocked || (() => {
      r.onblocked = undefined
      r.onsuccess = undefined
      r.onerror = undefined
      reject(new Error("db blocked"))
    })
    r.onsuccess = () => {
      if (navigator.userAgent.match(/Safari\//)) {
        // Safari <=12.1.1 has a race condition bug where even after onsuccess is called,
        // the database sometimes remains but without and actual object stores.
        // This condition causes a subsequent open request to succeed without invoking an
        // upgrade handler, and thus yielding an empty database.
        // Running a second pass of deleteDatabase seem to work around this bug.
        let r = _indexedDB.deleteDatabase(name)
        r.onsuccess = () => { resolve() }
        r.onerror = () => { reject(r.error) }
      } else {
        resolve()
      }
    }
    r.onerror = () => { reject(r.error) }
  })
}


export class Database extends EventEmitter<DatabaseEventMap> {
  readonly db      :IDBDatabase  // underlying object
  readonly name    :string
  readonly version :number

  // autoReopenOnClose controls if the database should be reopened and recreated when the
  // user deletes the underlying data in their web browser. When this is false, all operations
  // will suddenly start failing if the user deleted the database, while when this is true,
  // operations always operate in transactions either on the old (before deleting) database or
  // a new recreated database.
  autoReopenOnClose :boolean = true

  readonly isOpen = false

  _lastSnapshot :DatabaseSnapshot
  _broadcastChannel :BroadcastChannel|undefined
  _requirePromise :Promise<Database|null>|null = null

  constructor(name :string, version :number) {
    super()
    this.name = name
    this.version = version
  }

  // require is a high-level function that can be used instead of open() to cause a database
  // to be opened lazily and just once. It also provides an easy safety net for hosts that
  // lack IndexedDB support.
  //
  // Example use:
  //
  //   const db = new xdb.Database("mydb", 1)
  //   const useDB = () => localdb.require(async t => {
  //     log(`upgrade database ${t.prevVersion} -> ${t.nextVersion}`)
  //     if (t.prevVersion < 1) {
  //       t.createStore("users", { keyPath: "email" })
  //     }
  //   })
  //   async function saveUser(user) {
  //     if (await useDB()) {
  //       return db.set("users", user)
  //     }
  //   }
  //
  require(upgradefun? :UpgradeFun) :Promise<Database|null> {
    if (!supported) {
      return Promise.resolve(null)
    }
    if (!this._requirePromise) {
      this._requirePromise = this.open(upgradefun).then(() => this)
    }
    return this._requirePromise
  }

  // open the database, creating and/or upgrading it as needed using optional upgradefun
  open(upgradefun? :UpgradeFun) :Promise<void> {
    return openDatabase(this, upgradefun).then(() => {
      this._setupCoordination()
      return this._onopen(upgradefun)
    })
  }

  _reopen(upgradefun? :UpgradeFun) :Promise<void> {
    // print("_reopen (database is closing)")
    if (!this.autoReopenOnClose) {
      return
    }

    let db = this
    let delayedTransactions :DelayedTransaction<any>[] = []

    this.transaction = function(mode: IDBTransactionMode, ...stores :string[]) :Transaction<any> {
      let resolve :()=>void
      let reject  :(e:Error)=>void
      let t = new DelayedTransaction<any>((_resolve, _reject) => {
        resolve = _resolve
        reject = _reject
      })
      t._resolve = resolve
      t._reject = reject
      t._db = db
      t._stores = stores
      t._mode = mode
      delayedTransactions.push(t)
      return t
    }

    // reopen
    return openDatabase(this, upgradefun).then(db => {
      delete this.transaction  // remove override
      for (let t of delayedTransactions) {
        t._flushDelayed()
      }
      return this._onopen(upgradefun)
    })
  }

  async _onopen(upgradefun? :UpgradeFun) :Promise<void> {
    this._snapshot()
    this.db.onclose = () => {
      ;(this as any).isOpen = false
      this._reopen(upgradefun)
    }
    ;(this as any).isOpen = true
    this.triggerEvent("open")
  }

  _snapshot() {
    let storeNames = this.storeNames
    let storeInfo = new Map<string,StoreInfo>()
    if (storeNames.length > 0) {
      let t = this.db.transaction(storeNames, "readonly")
      // @ts-ignore workaround for Safari bug
      // eval("1+1")
      for (let storeName of storeNames) {
        let s = t.objectStore(storeName)
        storeInfo.set(storeName, {
          autoIncrement: s.autoIncrement,
          indexNames: s.indexNames,
          keyPath: s.keyPath,
        } as StoreInfo)
      }
    }
    this._lastSnapshot = {
      storeNames,
      storeInfo,
    }
  }

  _setupCoordination() {
    if (typeof BroadcastChannel == "undefined") {
      // environment doesn't support BroadcastChannel. No coordination.
      return
    }
    this._broadcastChannel = new BroadcastChannel(`xdb:${this.name}.${this.version}`)
    this._broadcastChannel.onmessage = ev => {
      this.triggerEvent("remotechange", ev.data as ChangeEvent)
    }
  }

  _broadcastChange(ev :ChangeEvent) {
    if (this._broadcastChannel) {
      this._broadcastChannel.postMessage(ev)
    }
    this.triggerEvent("change", ev)
  }

  // close the database.
  //
  // The connection is not actually closed until all transactions created using this
  // connection are complete. No new transactions can be created for this connection once
  // this method is called. Methods that create transactions throw an exception if a closing
  // operation is pending.
  close() :void {
    // Note: This does NOT cause a "close" event to be emitted. There's a disctinction
    // between calling close() on a database object vs the "close" event occurring.
    //
    // - Calling close() causes the database object to become invalid and allows for
    //   Database.delete.
    //
    // - The "close" event occurs when the user deletes the database. However, any instance
    //   of a database object remains valid.
    //
    // A "close" event occurs when the database is deleted by the user, for instance
    // via "delete website data" in web browser settings or use of developer console.
    // Since that action renders the database object useless, we automatically reopen
    // the database when this happens, and run the upgrade function which will handle
    // initialization of the database.
    //
    ;(this as any).isOpen = false
    this.db.close()
  }


  // storeNames is a list of objects store names that currently exist in the database.
  // Use ObjectStore.indexNames to list indexes of a given store.
  get storeNames() :string[] { return Array.from(this.db.objectStoreNames) }


  // getStore starts a new transaction in mode on the named store.
  // You can access the transaction via ObjectStore.transaction.
  getStore<T=any>(store :string, mode :IDBTransactionMode) :ObjectStore<T> {
    return this.transaction<T>(mode, store).objectStore(store)
  }


  // transaction starts a new transaction.
  //
  // Its operations need to be defined immediately after creation.
  // Transactions are Promises and complete when the transaction finishes.
  //
  // It's usually better to use read() or modify() instead of transaction() as those methods
  // handle transaction promise as part of operation promises.
  //
  transaction<T=any>(mode: IDBTransactionMode, ...stores :string[]) :Transaction<T> {
    return createTransaction<T>(this, this.db.transaction(stores, mode))
  }


  // modify encapsulates operations on object stores in one transaction.
  // Returns the results of the input functions' results.
  //
  // This is uesful since working simply with transaction objects, it's easy to forget to catch
  // all cases of promise resolution. Consider the following code:
  //
  //   let [foo] = this.readwrite("foo")
  //   await foo.add({ message: "hello" })
  //   await foo.transaction
  //
  // What happens if the record already exists and the "add" call fails?
  // An error is thrown early and we never get to await the transaction (= unhandled rejection.)
  //
  // To fix this, we would need to rewrite the above code as:
  //
  //   let [foo] = this.readwrite("foo")
  //   await Promise.all([
  //     foo.add({ message: "hello" }),
  //     foo.transaction,
  //   ])
  //
  // And that's exactly what this function does.  We can rewrite the above as:
  //
  //   await this.modify(["foo"], foo => foo.add({ message: "hello" }))
  //
  // For multiple independent operations, you can provide multiple functions:
  //
  //   await this.modify(["foo"],
  //     foo => foo.add({ message: "hello" }),
  //     asnyc foo => {
  //       let msg = await foo.get("1")
  //       await foo.put({ message: msg.message + " (copy)" })
  //     },
  //   )
  //
  modify(stores :string[], ...f :((...s:ObjectStore<any>[])=>Promise<any>)[]) :Promise<any[]> {
    let t = this.transaction("readwrite", ...stores)
    let sv = stores.map(name => t.objectStore(name))
    return Promise.all([ t, ...f.map(f => f(...sv)) ]).then(r => (r.shift(), r))
  }


  // read is like modify but operates on a read-only snapshot of the database.
  // To read a single object, perfer to use get() instead.
  // Returns the values of the input functions' results.
  //
  // Example of retrieving two objects:
  //
  //   let [message, user] = await db.read(["messages", "users"],
  //     (m, _) => m.get("hello"),
  //     (_, u) => u.get("robin@lol.cat")
  //   )
  //
  read(stores :string[], ...f :((...s:ObjectStore<any>[])=>Promise<any>)[]) :Promise<any[]> {
    let t = this.transaction("readonly", ...stores)
    let sv = stores.map(name => t.objectStore(name))
    return Promise.all(f.map(f => f(...sv)))  // note: ignore transaction promise
  }


  // get a single object from store. See ObjectStore.get
  get<T=any>(store :string, query :IDBValidKey|IDBKeyRange) :Promise<T|null> {
    return this.getStore<T>(store, "readonly").get(query)
  }

  // getAll retrieves multiple values from store. See ObjectStore.getAll
  getAll(store :string, query?: IDBValidKey|IDBKeyRange, count?: number): Promise<any[]> {
    return this.getStore(store, "readonly").getAll(query, count)
  }

  // add a single object to store. See ObjectStore.add
  add(store :string, value :any, key? :IDBValidKey): Promise<IDBValidKey> {
    let s = this.getStore(store, "readwrite")
    return Promise.all([s.add(value, key), s.transaction]).then(v => v[0])
  }

  // put a single object in store. See ObjectStore.put
  put(store :string, value: any, key?: IDBValidKey): Promise<IDBValidKey> {
    let s = this.getStore(store, "readwrite")
    return Promise.all([s.put(value, key), s.transaction]).then(v => v[0])
  }

  // delete a single object from store. See ObjectStore.delete
  delete(store :string, key :IDBValidKey|IDBKeyRange): Promise<void> {
    let s = this.getStore(store, "readwrite")
    return Promise.all([s.delete(key), s.transaction]) as any as Promise<void>
  }

  // getAllKeys retrieves all keys. See ObjectStore.getAllKeys
  getAllKeys(
    store :string,
    query? :IDBValidKey|IDBKeyRange,
    count? :number,
  ) :Promise<IDBValidKey[]> {
    return this.getStore(store, "readonly").getAllKeys(query, count)
  }
}


export class UpgradeTransaction {
  readonly prevVersion :number
  readonly nextVersion :number

  _t  :Transaction<any>  // the one transaction all upgrade operations share
  db :Database

  constructor(db :Database, t :IDBTransaction, prevVersion :number, nextVersion :number) {
    this._t = createTransaction(db, t)
    this.db = db
    this.prevVersion = prevVersion
    this.nextVersion = nextVersion
  }

  // storeNames is a list of objects store names that currently exist in the database.
  // Use ObjectStore.indexNames to list indexes of a given store.
  get storeNames() :string[] { return Array.from(this.db.db.objectStoreNames) }

  // hasStore returns true if the database contains the named object store
  hasStore(name :string) :boolean {
    return this.db.db.objectStoreNames.contains(name)
  }

  // getStore retrieves the names object store
  getStore<T=any>(name :string) :ObjectStore<T> {
    return this._t.objectStore(name)
  }

  // createStore creates a new object store
  createStore<T=any>(name :string, params? :IDBObjectStoreParameters) :ObjectStore<T> {
    let os = this.db.db.createObjectStore(name, params)
    return new ObjectStore<T>(this.db, os, this._t)
  }

  // deleteStore deletes the object store with the given name
  deleteStore(name :string) :void {
    this.db.db.deleteObjectStore(name)
  }
}


export class Transaction<T> extends Promise<void> {
  readonly db :Database
  transaction :IDBTransaction  // underlying transaction object

  readonly aborted :boolean = false  // true if abort() was called

  // when true, abort() causes the transaction to be rejected (i.e. error.)
  // when false, abort() causes the transaction to be fulfilled.
  errorOnAbort :boolean = true

  abort() :void {
    ;(this as any).aborted = true
    this.transaction.abort()
  }

  objectStore(name :string) :ObjectStore<T> {
    return new ObjectStore<T>(this.db, this.transaction.objectStore(name), this)
  }
}


export class ObjectStore<T> {
  readonly db            :Database
  readonly store         :IDBObjectStore
  readonly transaction   :Transaction<T>   // associated transaction

  // autoIncrement is true if the store has a key generator
  get autoIncrement() :boolean { return this.store.autoIncrement }

  // indexNames is the names of indexes
  get indexNames() :DOMStringList { return this.store.indexNames }

  // name of the store. Note: Can be "set" _only_ within an upgrade transaction.
  get name() :string { return this.store.name }
  set name(name :string) { this.store.name = name }

  constructor(db :Database, store :IDBObjectStore, transaction: Transaction<T>) {
    this.db = db
    this.store = store
    this.transaction = transaction
  }


  // clear deletes _all_ records in store
  clear() :Promise<void> {
    return this._promise(() => this.store.clear()).then(() => {
      this.db._broadcastChange({ type:"clear", store: this.store.name })
    })
  }

  // count the number of records matching the given key or key range in query
  count(key? :IDBValidKey|IDBKeyRange) :Promise<number> {
    return this._promise(() => this.store.count(key))
  }


  // get retrieves the value of the first record matching the given key or key range in query.
  // Returns undefined if there was no matching record.
  get(query :IDBValidKey|IDBKeyRange) :Promise<any|undefined> {
    return this._promise(() => this.store.get(query))
  }

  // getAll retrieves the values of the records matching the given key or key range in query,
  // up to count, if provided.
  getAll(query? :IDBValidKey|IDBKeyRange, count? :number) :Promise<any[]> {
    return this._promise(() => this.store.getAll(query, count))
  }

  // Retrieves the key of the first record matching the given key or key range in query.
  // Returns undefined if there was no matching key.
  getKey(query :IDBValidKey|IDBKeyRange) :Promise<IDBValidKey|undefined> {
    return this._promise(() => this.store.getKey(query))
  }

  // getAllKeys retrieves the keys of records matching the given key or key range in query,
  // up to count if given.
  getAllKeys(query? :IDBValidKey|IDBKeyRange, count? :number) :Promise<IDBValidKey[]> {
    return this._promise(() => this.store.getAllKeys(query, count))
  }

  // add inserts a new record. If a record already exists in the object store with the key,
  // then an error is raised.
  add(value :any, key? :IDBValidKey) :Promise<IDBValidKey> {
    return this._promise(() => this.store.add(value, key)).then(key =>
      (this.db._broadcastChange({ type: "update", store: this.store.name, key, value }), key)
    )
  }

  // put inserts or updates a record.
  put(value :any, key? :IDBValidKey) :Promise<IDBValidKey> {
    return this._promise(() => this.store.put(value, key)).then(key =>
      (this.db._broadcastChange({ type: "update", store: this.store.name, key, value }), key)
    )
  }

  // delete removes records in store with the given key or in the given key range in query.
  // Deleting a record that does not exists does _not_ cause an error but succeeds.
  delete(key :IDBValidKey|IDBKeyRange) :Promise<void> {
    return this._promise(() => this.store.delete(key)).then(() =>
      (this.db._broadcastChange({ type: "delete", store: this.store.name, key }), undefined)
    )
  }


  // createIndex creates a new index in store with the given name, keyPath and options and
  // returns a new IDBIndex. If the keyPath and options define constraints that cannot be
  // satisfied with the data already in store the upgrade transaction will abort with
  // a "ConstraintError" DOMException.
  // Throws an "InvalidStateError" DOMException if not called within an upgrade transaction.
  createIndex(name :string, keyPath :string|string[], options? :IDBIndexParameters) :IDBIndex {
    return this.store.createIndex(name, keyPath, options)
  }

  // deleteIndex deletes the index in store with the given name.
  // Throws an "InvalidStateError" DOMException if not called within an upgrade transaction.
  deleteIndex(name :string) :void {
    this.store.deleteIndex(name)
  }

  // getIndex retrieves the named index.
  getIndex<IT=T>(name :string) :Index<IT> {
    return new Index<IT>(this, this.store.index(name))
  }

  _promise<R,T extends IDBRequest = IDBRequest>(f :()=>IDBRequest<R>) :Promise<R> {
    return new Promise<R>((resolve, reject) => {
      let r = f()
      r.onsuccess = () => { resolve(r.result) }
      r.onerror = () => { reject(r.error) }
    })
  }
}


class Index<T> {
  readonly store :ObjectStore<T>
  readonly index :IDBIndex

  constructor(store :ObjectStore<T>, index :IDBIndex) {
    this.store = store
    this.index = index
  }


  get keyPath(): string | string[] { return this.index.keyPath }
  get multiEntry(): boolean { return this.index.multiEntry }

  get name(): string { return this.index.name }
  set name(v :string) { this.index.name = v }  // only valid during upgrade

  get unique(): boolean { return this.index.unique }


  count(key? :IDBValidKey|IDBKeyRange) :Promise<number> {
    return this._promise(() => this.index.count(key))
  }

  get(key :IDBValidKey|IDBKeyRange) :Promise<T|undefined> {
    return this._promise(() => this.index.get(key))
  }

  getAll(query? :IDBValidKey|IDBKeyRange, count? :number) :Promise<T[]> {
    return this._promise(() => this.index.getAll(query, count))
  }

  // TOOD: implement more methods

  _promise<R,T extends IDBRequest = IDBRequest>(f :()=>IDBRequest<R>) :Promise<R> {
    return new Promise<R>((resolve, reject) => {
      let r = f()
      r.onsuccess = () => { resolve(r.result) }
      r.onerror = () => { reject(r.error) }
    })
  }
}


// used for zero-downtime database re-opening
class DelayedTransaction<T> extends Transaction<T> {
  _db      :Database
  _mode    :IDBTransactionMode
  _stores  :string[]
  _resolve :()=>void
  _reject  :(e:Error)=>void
  _delayed :DelayedObjectStore<T>[] = []

  _flushDelayed() {
    // print("DelayedTransaction _flushDelayed")
    this.abort = Transaction.prototype.abort
    this.objectStore = Transaction.prototype.objectStore

    this.transaction = this._db.db.transaction(this._stores, this._mode)
    activateDelayedTransaction(this)

    if (this.aborted) {
      this.abort()
    }
    for (let os of this._delayed) {
      os._flushDelayed()
    }
    this._delayed = []
  }

  abort() :void {
    ;(this as any).aborted = true
  }

  objectStore(name :string) :ObjectStore<T> {
    let info = this._db._lastSnapshot.storeInfo.get(name)!
    if (!info) { throw new Error("object store not found") }
    let os = new DelayedObjectStore<T>(
      this._db,
      {
        name,
        autoIncrement: info.autoIncrement,
        indexNames: info.indexNames,
        keyPath: info.keyPath,
      } as any as IDBObjectStore,
      this
    )
    // TODO: support ObjectStore.getIndex(name:string):IDBIndex
    this._delayed.push(os)
    return os
  }
}


interface DelayedObjectStoreAction<R> {
  resolve :(v:R)=>any
  reject  :(e:Error)=>void
  f       :()=>IDBRequest<R>
}


class DelayedObjectStore<T> extends ObjectStore<T> {
  _delayed :DelayedObjectStoreAction<any>[] = []

  _flushDelayed() {
    // print("DelayedObjectStore _flushDelayed", this._delayed)
    ;(this as any).store = this.transaction.transaction.objectStore(this.store.name)
    this._promise = ObjectStore.prototype._promise
    this._delayed.forEach(({ f, resolve, reject }) => {
      let r = f()
      r.onsuccess = () => { resolve(r.result) }
      r.onerror = () => { reject(r.error) }
    })
    this._delayed = []
  }

  _promise<R,T extends IDBRequest = IDBRequest>(f :()=>IDBRequest<R>) :Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this._delayed.push({ f, resolve, reject })
    })
  }
}


// export class MemoryDatabase extends Database {
//   close() :void {}
//   open(upgradefun? :UpgradeFun) :Promise<void> {
//     return Promise.resolve()
//   }

//   transaction(mode: IDBTransactionMode, ...stores :string[]) :MemTransaction {
//     return new MemTransaction(this, stores, mode)
//   }
// }

// class MemObjectStore extends ObjectStore {
//   _data = new Map<any,any>()

//   clear() :Promise<void> {
//     this._data.clear()
//     return Promise.resolve()
//   }

//   count(key? :IDBValidKey|IDBKeyRange) :Promise<number> {
//     // TODO count keys
//     return Promise.resolve(this._data.size)
//   }

//   get(query :IDBValidKey|IDBKeyRange) :Promise<any|undefined> {
//     return Promise.resolve(this._data.get(query))
//   }

//   getAll(query? :IDBValidKey|IDBKeyRange, count? :number) :Promise<any[]> {
//     // TOOD: get multiple
//     return Promise.resolve(this._data.get(query))
//   }

//   getKey(query :IDBValidKey|IDBKeyRange) :Promise<IDBValidKey|undefined> {
//     let key :IDBValidKey|undefined
//     for (let k of this._data.keys()) {
//       key = k as IDBValidKey
//       break
//     }
//     return Promise.resolve(key)
//   }

//   getAllKeys(query? :IDBValidKey|IDBKeyRange, count? :number) :Promise<IDBValidKey[]> {
//     return Promise.resolve(Array.from(this._data.keys()))
//   }

//   add(value :any, key? :IDBValidKey) :Promise<IDBValidKey> {
//     if (this._data.has(key)) {

//     }
//   }

//   // put inserts or updates a record.
//   put(value :any, key? :IDBValidKey) :Promise<IDBValidKey> {
//     return this._promise(() => this.store.put(value, key)).then(key =>
//       (this.db._broadcastChange({ type: "update", store: this.store.name, key }), key)
//     )
//   }

//   // delete removes records in store with the given key or in the given key range in query.
//   // Deleting a record that does not exists does _not_ cause an error but succeeds.
//   delete(key :IDBValidKey|IDBKeyRange) :Promise<void> {
//     return this._promise(() => this.store.delete(key)).then(key =>
//       (this.db._broadcastChange({ type: "delete", store: this.store.name, key }), key)
//     )
//   }
// }

// class MemTransaction extends Transaction {
//   db     :MemoryDatabase
//   stores :string[]
//   mode   :IDBTransactionMode

//   constructor(db :MemoryDatabase, stores :string[], mode: IDBTransactionMode) {
//     super(resolve => resolve())
//     this.db = db
//     this.stores = stores
//     this.mode = mode
//   }

//   abort() :void {
//     ;(this as any).aborted = true
//   }

//   objectStore(name :string) :ObjectStore {
//     let os = new MemObjectStore(
//       this._db,
//       {
//         name,
//         autoIncrement: info.autoIncrement,
//         indexNames: info.indexNames,
//         keyPath: info.keyPath,
//       } as any as IDBObjectStore,
//       this
//     )
//     // TODO: support ObjectStore.getIndex(name:string):IDBIndex
//     this._delayed.push(os)
//     return os
//   }
// }



function activateDelayedTransaction<T=any>(t :DelayedTransaction<T>) {
  let tr = t.transaction
  let resolve = t._resolve ; (t as any)._resolve = undefined
  let reject  = t._reject  ; (t as any)._reject = undefined
  tr.oncomplete = () => { resolve() }
  tr.onerror = () => { reject(tr.error) }
  tr.onabort = () => {
    ;(t as any).aborted = true
    if (t.errorOnAbort) {
      reject(new Error("transaction aborted"))
    } else {
      resolve()
    }
  }
}

function createTransaction<T=any>(db :Database, tr :IDBTransaction) :Transaction<T> {
  // Note: For complicated reasons related to Promise implementation in V8, we
  // can't customize the Transaction constructor.
  var t = new Transaction<T>((resolve, reject) => {
    tr.oncomplete = () => { resolve() }
    tr.onerror = () => { reject(tr.error) }
    tr.onabort = () => {
      ;(t as any).aborted = true
      if (t.errorOnAbort) {
        reject(new Error("transaction aborted"))
      } else {
        resolve()
      }
    }
  })
  ;(t as any).db = db
  t.transaction = tr
  return t
}


function openDatabase(db :Database, upgradef? :UpgradeFun) :Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((_resolve, reject) => {
    // Note on pcount: upgradef may take an arbitrary amount of time to complete.
    // The semantics of open() are so that open() should complete when the database
    // is ready for use, meaning we need to include any upgrades into the "open" action.
    // The onsuccess handler is called whenever the last operation in an update function
    // completes, which may be sooner than when other code in the upgrade function completes,
    // like for instance "post upgrade" code run that e.g. logs on the network.
    // To solve for this, we simply count promises with pcount and resolve when pcount
    // reaches zero (no outstanding processes.)
    let openReq = _indexedDB.open(db.name, db.version)
    let pcount = 1  // promise counter; starts with 1 outstanding process (the "open" action)

    let resolve = () => {
      if (--pcount == 0) {
        ;(db as any).db = openReq.result
        _resolve()
      }
    }

    if (upgradef) {
      openReq.onupgradeneeded = ev => {
        ;(db as any).db = openReq.result
        let u = new UpgradeTransaction(db, openReq.transaction, ev.oldVersion, ev.newVersion)

        let onerr = err => {
          // abort the upgrade if upgradef fails
          try { u._t.abort() } catch(_) {}
          reject(err)
        }

        pcount++
        u._t.then(resolve).catch(onerr)

        pcount++
        try {
          upgradef(u).then(resolve).catch(onerr)
        } catch (err) {
          onerr(err)
        }
      }
    }

    openReq.onsuccess = () => { resolve() }
    openReq.onerror = () => { reject(openReq.error) }
  })
}


