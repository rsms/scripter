import * as xdb from "./xdb"

const print = console.log.bind(console)

const DB_VERSION = 1
export const db = new xdb.Database("scripter", DB_VERSION)

// let dbPromiseResolve :(v:xdb.Database)=>void
// let dbPromiseReject :(e:Error)=>void
// export const dbPromise = new Promise<xdb.Database>((resolve, reject) => {
//   dbPromiseResolve = resolve
//   dbPromiseReject = reject
// })


export class Script {
  readonly name       :string  // unique
  readonly createdAt  :Date
  readonly modifiedAt :Date

  body :Uint8Array

  constructor(name :string, body? :Uint8Array) {
    this.name = name
    this.body = body || new Uint8Array()
  }

  static async load(name :string) :Promise<Script|null> {
    let script = await db.get("scripts", name)
    if (!script) {
      return null
    }
    script.__proto__ = this.prototype
    return script
  }

  async save() {
    await db.put("scripts", this)
  }

  async rename(newName :string) {
    return db.modify(["scripts"], async s => {
      s.delete(this.name)
      let oldName = this.name
      ;(this as any).name = newName
      try {
        await s.add(this)
      } catch (e) {
        ;(this as any).name = oldName
        throw e
      }
    })
  }
}


class Settings {
  lastOpenScript :string = ""

  async load() {
    let settings = await db.get("settings", "main")
    if (!settings) {
      return
    }
    for (let k in settings) {
      ;(this as any)[k] = settings[k]
    }
  }
}

export const settings = new Settings()


export async function initData() {
  print("deleting database")
  await xdb.delete("scripter")

  print("opening database")
  await db.open(async t => {
    print(`upgrade database ${t.prevVersion} -> ${t.nextVersion}`)

    let settings = t.createStore("settings")

    let scripts = t.createStore("scripts", { keyPath: "name" })
    scripts.createIndex("modified", "modifiedAt", { unique: false })
    scripts.createIndex("created", "createdAt", { unique: false })

    await scripts.add({ name: "hello", code: `print("hello")` })

    // let rec = await scripts.get("hello")
    // let store2 = t.createStore("scripts2", { keyPath: "name" })

    print("upgrade done")
  })
  // .then(() => dbPromiseResolve(db)).catch(e => {
  //   dbPromiseReject(e)
  //   throw e
  // })

  print("opened database")

  print("loading settings")
  await settings.load()
  print("settings:", settings)


  let script = await db.get("scripts", "hello")
  print(`db.get("scripts", "hello") =>`, script)
  script = await db.get("scripts", "helloz")
  print(`db.get("scripts", "helloz") =>`, script)

  await db.put("scripts", { name: "meow", meow: "Meow meow" })
  print(`db.get("scripts", "meow") =>`, await db.get("scripts", "meow"))

  print("getAll =>", await db.getAll("scripts"))
  print("getAllKeys =>", await db.getAllKeys("scripts"))

  // print("deleting a record that exists")
  // await db.modify(["scripts"], s => s.delete("hello"))

  // print("deleting a record that does not exist")
  // await db.modify(["scripts"], s => s.delete("hellozzzz"))

  ;[script] = await db.read(["scripts"], s => s.get("hello"))
  print(`db.read(["scripts"], s => s.get("hello")) =>`, script)
}
