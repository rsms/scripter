
const print = console.log.bind(console)

const _indexedDB = (window.indexedDB
                 || window["mozIndexedDB"]
                 || window["webkitIndexedDB"]
                 || window["msIndexedDB"]) as IDBFactory


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
export { _delete as delete };function _delete(name :string, onblocked? :()=>void) :Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let r = _indexedDB.deleteDatabase(name)
    r.onblocked = onblocked || (() => {
      r.onblocked = undefined
      r.onsuccess = undefined
      r.onerror = undefined
      reject(new Error("db blocked"))
    })
    r.onsuccess = () => { resolve() }
    r.onerror = () => { reject(r.error) }
  })
}


export class Database {
  readonly db      :IDBDatabase  // underlying object
  readonly name    :string
  readonly version :number

  // autoReopenOnClose controls if the database should be reopened and recreated when the
  // user deletes the underlying data in their web browser. When this is false, all operations
  // will suddenly start failing if the user deleted the database, while when this is true,
  // operations always operate in transactions either on the old (before deleting) database or
  // a new recreated database.
  autoReopenOnClose :boolean = true

  _isClosing = false
  _lastSnapshot :DatabaseSnapshot

  constructor(name :string, version :number) {
    this.name = name
    this.version = version
  }

  // open the database, creating and/or upgrading it as needed using optional upgradefun
  open(upgradefun? :UpgradeFun) :Promise<void> {
    return openDatabase(this.name, this.version, upgradefun).then(db => {
      ;(this as any).db = db
      this._onopen(upgradefun)
    })
  }

  _reopen(upgradefun? :UpgradeFun) {
    // print("_reopen (database is closing)")
    if (!this.autoReopenOnClose) {
      return
    }
    this._isClosing = true

    let db = this
    let delayedTransactions :DelayedTransaction[] = []

    this.transaction = function(mode: IDBTransactionMode, ...stores :string[]) :Transaction {
      let resolve :()=>void
      let reject  :(e:Error)=>void
      let t = new DelayedTransaction((_resolve, _reject) => {
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
    openDatabase(this.name, this.version, upgradefun).then(db => {
      // print("db was reopened")
      ;(this as any).db = db
      this._isClosing = false
      delete this.transaction  // remove override
      for (let t of delayedTransactions) {
        t._flushDelayed()
      }
      this._onopen(upgradefun)
    })
  }

  _onopen(upgradefun? :UpgradeFun) {
    this._snapshot()
    this.db.onclose = () => { this._reopen(upgradefun) }
  }

  _snapshot() {
    let storeNames = this.storeNames
    let storeInfo = new Map<string,StoreInfo>()
    let t = this.db.transaction(storeNames, "readonly")
    for (let storeName of storeNames) {
      let s = t.objectStore(storeName)
      storeInfo.set(storeName, {
        autoIncrement: s.autoIncrement,
        indexNames: s.indexNames,
        keyPath: s.keyPath,
      } as StoreInfo)
    }
    this._lastSnapshot = {
      storeNames,
      storeInfo,
    }
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
    this.db.close()
  }


  // storeNames is a list of objects store names that currently exist in the database.
  // Use ObjectStore.indexNames to list indexes of a given store.
  get storeNames() :string[] { return Array.from(this.db.objectStoreNames) }


  // getStore starts a new transaction in mode on the named store.
  // You can access the transaction via ObjectStore.transaction.
  getStore(store :string, mode :IDBTransactionMode) :ObjectStore {
    return this.transaction(mode, store).objectStore(store)
  }


  // transaction starts a new transaction.
  //
  // Its operations need to be defined immediately after creation.
  // Transactions are Promises and complete when the transaction finishes.
  //
  // It's usually better to use read() or modify() instead of transaction() as those methods
  // handle transaction promise as part of operation promises.
  //
  transaction(mode: IDBTransactionMode, ...stores :string[]) :Transaction {
    return createTransaction(this.db.transaction(stores, mode))
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
  modify(stores :string[], ...f :((...s:ObjectStore[])=>Promise<any>)[]) :Promise<any[]> {
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
  read(stores :string[], ...f :((...s:ObjectStore[])=>Promise<any>)[]) :Promise<any[]> {
    let t = this.transaction("readonly", ...stores)
    let sv = stores.map(name => t.objectStore(name))
    return Promise.all(f.map(f => f(...sv)))  // note: ignore transaction promise
  }


  // get a single object from store. See ObjectStore.get
  get(store :string, query :IDBValidKey|IDBKeyRange) :Promise<any|null> {
    return this.getStore(store, "readonly").get(query)
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

  _t  :Transaction  // the one transaction all upgrade operations share
  db :IDBDatabase

  constructor(db :IDBDatabase, t :IDBTransaction, prevVersion :number, nextVersion :number) {
    this._t = createTransaction(t)
    this.db = db
    this.prevVersion = prevVersion
    this.nextVersion = nextVersion
  }

  // storeNames is a list of objects store names that currently exist in the database.
  // Use ObjectStore.indexNames to list indexes of a given store.
  get storeNames() :string[] { return Array.from(this.db.objectStoreNames) }

  // hasStore returns true if the database contains the named object store
  hasStore(name :string) :boolean {
    return this.db.objectStoreNames.contains(name)
  }

  // getStore retrieves the names object store
  getStore(name :string) :ObjectStore {
    return this._t.objectStore(name)
  }

  // createStore creates a new object store
  createStore(name :string, params? :IDBObjectStoreParameters) :ObjectStore {
    return new ObjectStore(this.db.createObjectStore(name, params), this._t)
  }

  // deleteStore deletes the object store with the given name
  deleteStore(name :string) :void {
    this.db.deleteObjectStore(name)
  }
}


export class Transaction extends Promise<void> {
  transaction :IDBTransaction  // underlying transaction object

  readonly aborted :boolean = false  // true if abort() was called

  // when true, abort() causes the transaction to be rejected (i.e. error.)
  // when false, abort() causes the transaction to be fulfilled.
  errorOnAbort :boolean = true

  abort() :void {
    ;(this as any).aborted = true
    this.transaction.abort()
  }

  objectStore(name :string) :ObjectStore {
    return new ObjectStore(this.transaction.objectStore(name), this)
  }
}


export class ObjectStore {
  readonly store         :IDBObjectStore
  readonly transaction   :Transaction   // associated transaction

  // autoIncrement is true if the store has a key generator
  get autoIncrement() :boolean { return this.store.autoIncrement }

  // indexNames is the names of indexes
  get indexNames() :DOMStringList { return this.store.indexNames }

  // name of the store. Note: Can be "set" _only_ within an upgrade transaction.
  get name() :string { return this.store.name }
  set name(name :string) { this.store.name = name }

  constructor(store :IDBObjectStore, transaction: Transaction) {
    this.store = store
    this.transaction = transaction
  }


  // clear deletes _all_ records in store
  clear() :Promise<void> {
    return this._promise(() => this.store.clear())
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
    return this._promise(() => this.store.add(value, key))
  }

  // put inserts or updates a record.
  put(value :any, key? :IDBValidKey) :Promise<IDBValidKey> {
    return this._promise(() => this.store.put(value, key))
  }

  // delete removes records in store with the given key or in the given key range in query.
  // Deleting a record that does not exists does _not_ cause an error but succeeds.
  delete(key :IDBValidKey|IDBKeyRange) :Promise<void> {
    return this._promise(() => this.store.delete(key))
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
  getIndex(name :string) :IDBIndex {
    return this.store.index(name)
  }

  _promise<R,T extends IDBRequest = IDBRequest>(f :()=>IDBRequest<R>) :Promise<R> {
    return new Promise<R>((resolve, reject) => {
      let r = f()
      r.onsuccess = () => { resolve(r.result) }
      r.onerror = () => { reject(r.error) }
    })
  }
}


// used for zero-downtime database re-opening
class DelayedTransaction extends Transaction {
  _db      :Database
  _mode    :IDBTransactionMode
  _stores  :string[]
  _resolve :()=>void
  _reject  :(e:Error)=>void
  _delayed :DelayedObjectStore[] = []

  _flushDelayed() {
    print("DelayedTransaction _flushDelayed")
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

  objectStore(name :string) :ObjectStore {
    let info = this._db._lastSnapshot.storeInfo.get(name)!
    if (!info) { throw new Error("object store not found") }
    let os = new DelayedObjectStore({
      name,
      autoIncrement: info.autoIncrement,
      indexNames: info.indexNames,
      keyPath: info.keyPath,
    } as any as IDBObjectStore, this)
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


class DelayedObjectStore extends ObjectStore {
  _delayed :DelayedObjectStoreAction<any>[] = []

  _flushDelayed() {
    print("DelayedObjectStore _flushDelayed", this._delayed)
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



function activateDelayedTransaction(t :DelayedTransaction) {
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

function createTransaction(tr :IDBTransaction) :Transaction {
  // Note: For complicated reasons related to Promise implementation in V8, we
  // can't customize the Transaction constructor.
  var t = new Transaction((resolve, reject) => {
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
  t.transaction = tr
  return t
}


function openDatabase(name :string, version :number, upgradef? :UpgradeFun) :Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((_resolve, reject) => {
    // Note on pcount: upgradef may take an arbitrary amount of time to complete.
    // The semantics of open() are so that open() should complete when the database
    // is ready for use, meaning we need to include any upgrades into the "open" action.
    // The onsuccess handler is called whenever the last operation in an update function
    // completes, which may be sooner than when other code in the upgrade function completes,
    // like for instance "post upgrade" code run that e.g. logs on the network.
    // To solve for this, we simply count promises with pcount and resolve when pcount
    // reaches zero (no outstanding processes.)
    let openReq = _indexedDB.open(name, version)
    let pcount = 1  // promise counter; starts with 1 outstanding process (the "open" action)

    let resolve = () => {
      if (--pcount == 0) {
        _resolve(openReq.result)
      }
    }

    openReq.onsuccess = () => { resolve() }

    openReq.onerror = () => { reject(openReq.error) }

    if (upgradef) openReq.onupgradeneeded = ev => {
      let db = openReq.result
      let u = new UpgradeTransaction(db, openReq.transaction, ev.oldVersion, ev.newVersion)
      pcount++
      let onerr = err => {
        // abort the upgrade if upgradef fails
        try { u._t.abort() } catch(_) {}
        reject(err)
      }
      try {
        upgradef(u).then(resolve).catch(onerr)
      } catch (err) {
        onerr(err)
      }
    }
  })
}
