import { isMac } from "./util"

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

Try running this script using the ► button in the toolbar, or by pressing ${kb("⌘↩︎", "Ctrl+Return")}
*/
print(\`Today is \${Date()}\`)
print(\`You are using Figma API v\${apiVersion}\`)
/*

There are more examples in the menu ☰.
Open the menu using the ☰ button in the bottom left corner.

This editor provides automatic completions of all available functionality, including the Figma API.
Type "figma." to start exploring the API.

Editor basics
• Scripts are saved automatically, locally
• Manage your scripts in the menu.
• Double-click a script in the menu to rename,
  pressing RETURN to commit a name change or
  ESC to cancel.
• Rename a script "" (nothing) to delete it.

Keyboard shortcuts
 ${kb("⌘↩", "Ctrl+Return")} runs the current script
 ${kb("⇧⌘↩", "Ctrl+Shift+Return")} stop a running script
 ${kb("⌥⌘P", "Ctrl+Alt+P")} closes Scripter
 ${kb("⌃M", "Ctrl+M")} toggles the menu
 ${kb("⌘+", "Ctrl+Plus")} increases text size
 ${kb("⌘−", "Ctrl+Minus")} decreases text size
 ${kb("⌘0", "Ctrl+0")} resets text size
 ${kb("F1", "F1")} opens the VS Code commander

*/
`),



s("Create rectangles", `
// This script creates some rectangles on the current page
const numberOfRectangles = 5

let nodes: SceneNode[] = []
for (let i = 0; i < numberOfRectangles; i++) {
  let r = Rect({ x: i * 150, fills: [ ORANGE.paint ] })
  nodes.push(r)
}

// select our new rectangles
setSelection(nodes)

// pan & zoom the viewport to show the rectangles
viewport.scrollAndZoomIntoView(nodes)
`),


s("Trim whitespace", `
// Select some text and run this script to trim away linebreaks and space.
for (let n of selection()) {
  if (isText(n)) {
    n.characters = n.characters.trim()
  }
}
`),


s("Trim line indentation", `
// Select some text and run this script to trim away whitespace from the
// beginning of lines
for (let n of selection()) {
  if (isText(n)) {
    n.characters = n.characters.replace(/\\n\\s+/g, "\\n")
  }
}
`),


s("Select all images", `
let images = await find(n => isImage(n) && n)
setSelection(images)

// More node type filters:
//   isDocument, isPage
//   isFrame, isGroup, isSlice
//   isRect, isRectangle
//   isLine
//   isEllipse, isPolygon, isStar
//   isVector
//   isText
//   isBooleanOperation
//   isComponent, isInstance
//   isSceneNode, isContainerNode, isShape
//
// These can also be used as type guards:
//
// let n = selection(0)
// // here, n's type is the generic BaseNode
// if (isRect(n)) {
//   // but here n's type is RectangleNode
// }
`),


s("Set images to fit", `
// Loop over images in the selection
for (let shape of await find(selection(), n => isImage(n) && n)) {
  // Update image paints to use "FIT" scale mode
  shape.fills = shape.fills.map(p =>
    isImage(p) ? {...p, scaleMode: "FIT"} : p)
}
`),


s("Timers", `
// Timers allows waiting for some time to pass
// or to execute some code after a delay.
await timer(200)
print("200ms passed")

// Timers are promises with a cancel() function
let t = timer(200)
print("timer started")
// cancel the timer before it expires.
// Comment this line out to see the effect.
t.cancel()
// wait for timer
try {
  await t
  print("Rrrriiiiing!")
} catch (_) {
  print("timer canceled")
}

// Timers accept an optional handler function:
timer(200, canceled => {
  print("timer expired.", {canceled})
})
// .cancel() // uncomment to try canceling
`),



s("Advanced timers", `
// Advanced use of multiple timers to implement timeout

// Try changing this from 200 to 300:
await doSlowThing(200)
async function doSlowThing(timeout :number) {
  let result = await withTimeout(getFromSlowInternet(), timeout)
  if (result === "TIMEOUT") {
    print("network request timed out :-(")
  } else {
    print("network request finished on time :-)", result)
  }
}

// Function that simulates a slow, cancellable network fetch
function getFromSlowInternet() :CPromise<Object> {
  // fake network request result
  return timer(250).catch(_=>{}).then(() => ({message: "Hello"}))
}

// Use timer to implement timeout
function withTimeout<
    T extends CPromise<R>,
    R = T extends Promise<infer U> ? U : T,
  >(p :T, timeout :number) :Promise<R|"TIMEOUT"> {
  let t = timer(timeout) // Start our timeout timer
  let to = false // set to true when timeout timer expired
  return new Promise<R|"TIMEOUT">((resolve, reject) => {
    p.then(r => {
      resolve(r)
      t.cancel() // cancel the timeout timer
    })
    t.then(() => {
      resolve("TIMEOUT") // signal timeout
      p.cancel() // cancel the user promise
    }).catch(()=>{})
  })
}

// Cancellable promise type
interface CPromise<R> extends Promise<R> { cancel():void }

`),


s("Tick tock, tick tock, tick tock", `
// Demonstrates continously-running scripts.
// This loops forever until you restart or
// stop the script.

for (let i = 1; true; i++) {
  print(i % 2 ? "Tick" : "Tock")
  await timer(1000)  // wait for 1 second
}
`),


s("Animation", `
// Rudimentary animation with animate()
// Moves a rectangle around in a "figure eight" pattern.
//
// Create rectangle
let r = Rect({ fills:[BLACK.paint] })
try {
  // setup viewport
  viewport.scrollAndZoomIntoView([r])
  viewport.zoom = 1

  // extent of motion in dp
  const size = 500 - r.width

  // animation loop
  await animate(time => {
    // This function is called at a high frequency with
    // time incrementing for every call.
    time *= 3 // speed things up
    let scale = size / (3 - Math.cos(time * 2))
    r.x = scale * Math.cos(time) - (r.width / 2)
    r.y = scale * Math.sin(2 * time) / 2 - (r.height / 2)
  })
} finally {
  // When the script is stopped, remove the rectangle
  r.remove()
}
`),


] as ExampleScript[]
