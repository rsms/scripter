import * as xdb from "./xdb"

const print = console.log.bind(console)

const DB_VERSION = 1
let db :xdb.Database

async function openDatabase() {
  print("deleting database")
  await xdb.delete("scripter")

  print("opening database")
  db = await xdb.open("scripter", DB_VERSION, async t => {
    print(`upgrade database ${t.prevVersion} -> ${t.nextVersion}`)
    let scripts = t.createStore("scripts", { keyPath: "id" })
    // scripts.createIndex("hours", "hours", { unique: false })
    await scripts.add({ id: "hello", code: `print("hello")` })
    // let rec = await scripts.get("hello")
    // let store2 = t.createStore("scripts2", { keyPath: "id" })
    print("upgrade done")
  })

  print("opened database")

  let script = await db.get("scripts", "hello")
  print(`db.get("scripts", "hello") =>`, script)
  script = await db.get("scripts", "helloz")
  print(`db.get("scripts", "helloz") =>`, script)

  await db.put("scripts", { id: "meow", meow: "Meow meow" })
  print(`db.get("scripts", "meow") =>`, await db.get("scripts", "meow"))

  print("getAll =>", await db.getAll("scripts"))
  print("getAllKeys =>", await db.getAllKeys("scripts"))

  // print("deleting a record that exists")
  // await db.modify(["scripts"], s => s.delete("hello"))

  // print("deleting a record that does not exist")
  // await db.modify(["scripts"], s => s.delete("hellozzzz"))

  ;[script] = await db.read(["scripts"], s => s.get("hello"))
  print(`db.read(["scripts"], s => s.get("hello")) =>`, script)

  // await new Promise(r => setTimeout(r, 100))

  // simulate the user deleting the database in the browser
  db.db.onclose(undefined as any as Event)

  // print("db.get()...")
  // script = await db.get("scripts", "hello")
  // print("script:", script)

  print("db.put() ...")
  let key = await db.put("scripts", { id: "closetest", message: "close event test" })
  print(`db.put("scripts", {...}) => ${key}`)
  script = await db.get("scripts", "closetest")
  print("script:", script)

  // setInterval(
  //   () => {
  //     (async () => {
  //       await db.put("scripts", { id: "closetest", message: "close event test" })
  //       script = await db.get("scripts", "closetest")
  //       print("script:", script)
  //     })().catch(err => console.error(err.stack))
  //   },
  //   1000
  // )

  // print("making transaction and aborting it")
  // try {
  //   let t = db.transaction("readonly", "scripts")
  //   t.abort()
  //   await t
  //   print("transaction completed")
  // } catch (e) {
  //   print("transaction failed: " + e)
  // }
}
