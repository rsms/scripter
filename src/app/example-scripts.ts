const isMac = navigator.platform.indexOf("Mac") != -1

interface ExampleScript {
  name :string
  code :string
}

function s(name :string, code :string) :ExampleScript {
  return { name, code: code.replace(/^\s*\n|\n\s*$/, "") }
}

function kb(mac :string, other :string) {
  return isMac ? mac : other
}

export default [


s("Introduction", `
/*
Hello hi and welcome to Scripter.

Scripts are written in relaxed TypeScript.
This grey text here is a comment.

Try running this script using the ► button in
the toolbar, or by pressing ${kb("⌘↩︎", "Ctrl+Return")}
*/
print(\`Hello world. Today is \${Date()}\`)
/*

Editor basics
• Scripts are saved automatically, locally
• Manage your scripts in the menu.
• Double-click a script in the menu to rename,
  pressing RETURN to commit a name change or
  ESC to cancel.
• Rename a script "" (nothing) to delete it.

Keyboard shortcuts
 ${kb("⌘↩︎", "Ctrl+Return")} runs the current script
 ${kb("⇧⌘X", "Ctrl+Shift+X")} stops a running script
 ${kb("⌥⌘P", "Ctrl+Alt+P")} closes Scripter
 ${kb("⌃M", "Ctrl+M")} toggles the menu
 ${kb("⌘+", "Ctrl+Plus")} increases text size
 ${kb("⌘−", "Ctrl+Minus")} decreases text size
 ${kb("⌘0", "Ctrl+0")} resets text size
 ${kb("F1", "F1")} opens the VS Code commander

*/
`),



s("Trim whitespace", `
// Select some text and run this script to
// trim away linebreaks and space.

for (let n of figma.currentPage.selection) {
  if (isText(n)) {
    n.characters = n.characters.trim()
  }
}

function isText(n :BaseNode) :n is TextNode {
  return n.type == "TEXT"
}
`),



s("Tick tock", `
// Demonstrates continously-running scripts.
// This loops forever until you restart or
// stop the script.

for (let i = 1; true; i++) {
  print(i % 2 ? "Tick" : "Tock")
  await timer(1000)  // wait for 1 second
}
`),


] as ExampleScript[]
