import * as xdb from "./xdb"


const print = console.log.bind(console)

const DB_VERSION = 2
export const db = new xdb.Database("scripter", DB_VERSION)

// let dbPromiseResolve :(v:xdb.Database)=>void
// let dbPromiseReject :(e:Error)=>void
// export const dbPromise = new Promise<xdb.Database>((resolve, reject) => {
//   dbPromiseResolve = resolve
//   dbPromiseReject = reject
// })


export async function initData() {
  // print("deleting database")
  // await xdb.delete("scripter", () => {
  //   print("delete is blocked (db opened in other tab). Waiting for db to close...")
  // })

  // print("opening database")

  await db.open(async t => {
    print(`upgrade database ${t.prevVersion} -> ${t.nextVersion}`)

    if (t.prevVersion < 1) {
      let config = t.createStore("config")

      let scripts = t.createStore("scripts", { keyPath: "id", autoIncrement: true })
      scripts.createIndex("modifiedAt", "modifiedAt", { unique: false })
      scripts.createIndex("createdAt", "createdAt", { unique: false })
      scripts.createIndex("tags", "tags", { unique: false, multiEntry: true })
      scripts.createIndex("name", "name", { unique: false })

      // scriptBody maps script-id => text
      t.createStore("scriptBody")

      // scriptViewState maps script-id => monaco-view-state
      t.createStore("scriptViewState")
    }

    if (t.prevVersion < 2) {
      // history holds history data (like navigationHistory)
      t.createStore("history")
    }
  })

  // print("opened database")

  // let script = await db.get("scripts", "one")
  // print(`db.get("scripts", "one") =>`, script)
  // script = await db.get("scripts", "helloz")
  // print(`db.get("scripts", "helloz") =>`, script)

  // await db.put("scripts", { id: "meow", meow: "Meow meow" })
  // print(`db.get("scripts", "meow") =>`, await db.get("scripts", "meow"))

  // print("getAll =>", await db.getAll("scripts"))
  // print("getAllKeys =>", await db.getAllKeys("scripts"))

  // print("deleting a record that exists")
  // await db.modify(["scripts"], s => s.delete("hello"))

  // print("deleting a record that does not exist")
  // await db.modify(["scripts"], s => s.delete("hellozzzz"))

  // ;[script] = await db.read(["scripts"], s => s.get("hello"))
  // print(`db.read(["scripts"], s => s.get("hello")) =>`, script)
}
