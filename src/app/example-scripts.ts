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

export default (samples => {
  let categories :{[k:string]:ExampleScript[]} = {}
  for (let s of samples) {
    let [category, title] = s.name.split("/", 2)
    if (!title) {
      title = category
      category = ""
    } else {
      s.name = title
    }
    let ss = categories[category]
    if (ss) {
      ss.push(s)
    } else {
      categories[category] = [ s ]
    }
  }
  return categories
})([


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


s("Figma/Create rectangles", `
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


s("Figma/Trim whitespace", `
// Select some text and run this script to trim away linebreaks and space.
for (let n of selection()) {
  if (isText(n)) {
    n.characters = n.characters.trim()
  }
}
`),


s("Figma/Trim line indentation", `
// Select some text and run this script to trim away whitespace from the
// beginning of lines
for (let n of selection()) {
  if (isText(n)) {
    n.characters = n.characters.replace(/\\n\\s+/g, "\\n")
  }
}
`),


s("Figma/Select all images", `
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


s("Figma/Set images to fit", `
// Loop over images in the selection
for (let shape of await find(selection(), n => isImage(n) && n)) {
  // Update image paints to use "FIT" scale mode
  shape.fills = shape.fills.map(p =>
    isImage(p) ? {...p, scaleMode: "FIT"} : p)
}
`),


s("Basics/UI messaging", `
// There are a few ways to show messages
// in the UI

// alert(message) shows a message dialog.
// Blocks the UI. Useful for important messages.
alert("Something very important")

// confirm(question) asks the user a yes or no
// question via a message dialog. Blocks the UI.
// Returns true if the user answered "yes".
print(await confirm("Would you like a kitten?"))

// notify(message, options?) shows a message in
// the bottom of the user's screen.
// Does not block the UI.
notify("Notification", { timeout: 2000 })
`),


s("Basics/Working with paths", `
// The Path library provides functions for working
// with pathnames.
let path = "/foo/bar/baz.png"
print(Path.ext(path))
print(Path.dir(path))
print(Path.base(path))
print(Path.clean("a/c//b/../k"))
print(Path.isAbs(path))
print(Path.join("foo", "//bar/", "baz", "internet"))
print(Path.split(path))
`),


s("Basics/Working with files", `
// Scripter doesn't support interfacing with your file system,
// but it does provide functions for working with file data.

// fileType can be used to investigate what type of file a
// filename represents:
print(fileType("foo/bar.zip"))

// fileType can even guess the file type based on the first
// few bytes of some file data:
print(fileType([0xFF, 0xD8, 0xFF])) // JPEG image data
`),


s("Basics/Showing images", `
// The Img function and class can be used to describe images
// and load image data for a few common image types.
// Passing an Img to print vizualizes the image.

// Img can take a URL which is then loaded by the web browser
print(Img("https://rsms.me/scripter/icon.png"))

// We can specify the size if we want
print(Img("https://rsms.me/scripter/icon.png", {width:128, height:16}))

// Img.load() allows us to load the image data
let icon = await Img("https://rsms.me/scripter/icon.png").load()
print(icon.data)
// A loaded image may also have information that was read from
// the image data itself, like mime type and bitmap dimensions:
print(icon, icon.type, icon.meta)

// fetchImg is a shorthand function for loading an Img
let loadedIcon = await fetchImg("https://rsms.me/scripter/icon.png")
print(loadedIcon, loadedIcon.meta)

// Img also accepts image data as its input,
// in common image formats like png, gif and jpeg.
let gifData = Bytes(\`
  47 49 46 38 39 61
  0A 00 0A 00 91 00 00
  FF FF FF FF 00 00 00 00 FF 00 00 00
  21 F9 04 00 00 00 00 00
  2C 00 00 00 00 0A 00 0A 00 00
  02 16 8C 2D 99 87 2A 1C DC 33 A0 02 75
  EC 95 FA A8 DE 60 8C 04 91 4C 01 00
  3B
\`)
print(Img(gifData, 32))

// Img also supports JPEG in addition to PNG and GIF
let im1 = Img("https://rsms.me/scripter/sample/colors.jpg")
await im1.load()
print(im1, [im1])
`),


s("Basics/Timers", `
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



s("HTTP/Fetch", `
// fetch can be used to fetch resources across the interwebs.
// It's the standard fetch API you might already be used to.
let r = await fetch("https://jsonplaceholder.typicode.com/users/1")
print(await r.json())

// Scripter provides a few shorthand functions for common tasks:
print(await fetchJson("https://jsonplaceholder.typicode.com/users/1"))
print(await fetchText("https://jsonplaceholder.typicode.com/users/1"))
print(await fetchImg("https://rsms.me/scripter/icon.png"))
print(await fetchData("https://rsms.me/scripter/icon.png"))
`),


s("HTTP/Figma API", `
// This script demonstrates accessing the Figma HTTP API
//
// First, generate an access token for yourself using the
// "+ Get personal access token" function on this page:
// https://www.figma.com/developers/api#access-tokens
const figmaHttpApiToken = "your_access_token_here"

// We can now fetch JSON representations of files via the HTTP API
let file = await fetchFigmaFile("jahkK3lhzuegZBQXz5BbL7")
print(Img(file.thumbnailUrl), file)

// Simple helper function for GETing files from Figma servers
async function fetchFigmaFile(fileKey :string) :Promise<any> {
  let json = await fetchJson(
    "https://api.figma.com/v1/files/" + encodeURIComponent(fileKey),
    { headers: { "X-FIGMA-TOKEN": figmaHttpApiToken } }
  )
  if (json.status && json.err) {
    throw new Error(\`API error: \${json.err}\`)
  }
  return json
}
`),


s("Advanced/Timers", `
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


s("Advanced/Tick tock, tick tock, tick tock", `
// Demonstrates continously-running scripts.
// This loops forever until you restart or
// stop the script.

for (let i = 1; true; i++) {
  print(i % 2 ? "Tick" : "Tock")
  await timer(1000)  // wait for 1 second
}
`),


s("Advanced/Animation", `
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


] as ExampleScript[])
