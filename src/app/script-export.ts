import { Script, ScriptMeta } from "./script"
import { scriptsData } from "./script-data"
import { saveZipArchive, ZipInputFile } from "./zip"
import { dlog } from "./util"


export async function exportAllScripts() {
  const scripts = scriptsData.scripts.filter(s => s.isUserScript)

  let files :ZipInputFile[] = await Promise.all(scripts.map(async (script) => {
    await script.loadIfEmpty()
    return {
      name:     script.name + ".ts",
      contents: script.body,
      mtime:    script.modifiedAt,
    } as ZipInputFile
  }))

  let datetime = (new Date).toLocaleString().replace(/\//g, "-").replace(/:/g, ".")
  let name = `Scripter Scripts ${datetime}`
  await saveZipArchive(`${name}.zip`, {
    name,
    files
  })
}
