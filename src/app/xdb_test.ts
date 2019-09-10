import * as xdb from "./xdb"

const print = console.log.bind(console)

const DB_VERSION = 1
let db :xdb.Database

async function openDatabase() {
  print("deleting database")
  await xdb.delete("mydb", () => print("delete is blocked -- waiting"))

  print("opening database")
  db = await xdb.open("mydb", DB_VERSION, async t => {
    print(`upgrade database ${t.prevVersion} -> ${t.nextVersion}`)
    let articles = t.createStore("articles", { keyPath: "id" })
    // articles.createIndex("hours", "hours", { unique: false })
    await articles.add({ id: "hello", code: `print("hello")` })
    // let rec = await articles.get("hello")
    // let store2 = t.createStore("articles2", { keyPath: "id" })
    print("upgrade done")
  })

  print("opened database")

  let script = await db.get("articles", "hello")
  print(`db.get("articles", "hello") =>`, script)
  script = await db.get("articles", "helloz")
  print(`db.get("articles", "helloz") =>`, script)

  await db.put("articles", { id: "meow", meow: "Meow meow" })
  print(`db.get("articles", "meow") =>`, await db.get("articles", "meow"))

  print("getAll =>", await db.getAll("articles"))
  print("getAllKeys =>", await db.getAllKeys("articles"))

  // print("deleting a record that exists")
  // await db.modify(["articles"], s => s.delete("hello"))

  // print("deleting a record that does not exist")
  // await db.modify(["articles"], s => s.delete("hellozzzz"))

  ;[script] = await db.read(["articles"], s => s.get("hello"))
  print(`db.read(["articles"], s => s.get("hello")) =>`, script)

  // await new Promise(r => setTimeout(r, 100))

  // simulate the user deleting the database in the browser
  // db.db.onclose(undefined as any as Event)

  // print("db.get()...")
  // script = await db.get("articles", "hello")
  // print("script:", script)

  print("db.put() ...")
  let key = await db.put("articles", { id: "closetest", message: "close event test" })
  print(`db.put("articles", {...}) => ${key}`)
  script = await db.get("articles", "closetest")
  print("script:", script)

  // setInterval(
  //   () => {
  //     (async () => {
  //       await db.put("articles", { id: "closetest", message: "close event test" })
  //       script = await db.get("articles", "closetest")
  //       print("script:", script)
  //     })().catch(err => console.error(err.stack))
  //   },
  //   1000
  // )

  // print("making transaction and aborting it")
  // try {
  //   let t = db.transaction("readonly", "articles")
  //   t.abort()
  //   await t
  //   print("transaction completed")
  // } catch (e) {
  //   print("transaction failed: " + e)
  // }
}
