import { ScriptEnv, scriptenv } from "./scriptenv"

export function initJSONAPI(env :ScriptEnv) {
  env.jsonfmt = function jsonfmt(value :any, pretty :number|boolean = true) :string {
    let indent = typeof pretty == "number" ? pretty : pretty ? 2 : 0
    return JSON.stringify(value, null, indent)
  }

  env.jsonparse = function jsonparse<T = any>(json :string) :T {
    try {
      return JSON.parse(json) as T
    } catch (_) {
      return (0,eval)(`0,${json}`) as T
    }
  }
}
