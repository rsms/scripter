import { isMac } from "./util"

interface ExampleScript {
	guid :string
	name :string
	code :string
}

function s(guid :string, name :string, code :string) :ExampleScript {
	return {
		guid: "examples/" + guid,
		name,
		code: code.replace(/^\s*\n|\n\s*$/, "") + "\n",
	}
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


s("intro", "Introduction", `
/**
Hello hi and welcome to Scripter.

Scripts are written in relaxed TypeScript.
This grey text here is a comment.

Try running this script using the ► button in the toolbar, or by pressing ${kb("⌘↩︎", "Ctrl+Return")}
*/
print(\`Today is \${Date()}\`)
print("Your viewport:", viewport.bounds)

/**
There are more examples in the menu ☰.
Open the menu using the ☰ button in the bottom left corner.
Create a new script using the + button in the top toolbar.

This editor provides automatic completions of all available functionality, including the Figma API.
Type "figma." to start exploring the API.

Scripts are automatically saved locally and securely.
You can also load and save scripts to the current Figma file.
To save a script, press the "Save to Figma File" button in the toolbar.
Changes to the script are not automatically saved both to the Figma file
as well as locally to your computer.
To remove a script from a Figma file, simply delete the frame in the Figma file's page.
To share a script with someone else, save it to a Figma file and invite others to the file.
To load a script from a Figma file, select the script's frame in Figma and then start Scripter.

Editor basics
• Scripts are automatically saved locally
• Scripts can optionally by saved to the Figma file
• Manage your scripts in the menu.
• Double-click a script in the menu to rename,
  pressing RETURN to commit a name change or
  ESC to cancel.
• Rename a script "" (nothing) to delete it.

Keyboard shortcuts
	Runs the current script                ${kb("⌘↩",    "Ctrl+Return")}
	Stop a running script                  ${kb("⇧⌘↩",  "Ctrl+Shift+Return")}
	Closes Scripter                        ${kb("⌥⌘P",   "Ctrl+Alt+P")}
	Toggle the menu                        ${kb("⌃M",     "Ctrl+M")}
	Increases text size                    ${kb("⌘+",     "Ctrl+Plus")}
	Decreases text size                    ${kb("⌘−",     "Ctrl+Minus")}
	Resets text size                       ${kb("⌘0",     "Ctrl+0")}
	Opens quick commander                  ${kb("F1 ",     "F1")} or ${kb(" ⇧⌘P", "Ctrl+Shift+P")}
	Goes to defintion of selected symbol   ${kb("⌘F12 ",  "Ctrl+F12")} or ${kb(" F12", "F12")}
	Peek definitions of selected symbol    F11
	Show references to selected symbol     ${kb("⇧F12",   "Shift+F12")}
	Quick navigator                        ${kb("⇧⌘O ",   "Ctrl+Shift+O")} or ${kb(" ⌘P", "Ctrl+P")}
	Go back in history                     ${kb("⇧⌘[ ",  "Ctrl+Shift+[")} or ${kb(" ⌃-", "Alt+←")}
	Go forward in history                  ${kb("⇧⌘] ",  "Ctrl+Shift+]")} or ${kb(" ⌃⇧-",   "Alt+→")}

*/
`),


//------------------------------------------------------------------------------------------------


s("figma/rects", "Figma/Create rectangles", `
// Create some rectangles on the current page
let rectangles = range(0, 5).map(i =>
	Rectangle({ x: i * 150, fills: [ ORANGE.paint ] }))

// select our new rectangles and center the viewport
viewport.focusAnimated(setSelection(rectangles))
`),


s("figma/trim-ws", "Figma/Trim whitespace", `
// Select some text and run this script to trim away linebreaks and space.
for (let n of selection()) {
	if (isText(n)) {
		n.characters = n.characters.trim()
	}
}
`),


s("figma/trim-line-indent", "Figma/Trim line indentation", `
// Select some text and run this script to trim away whitespace from the beginning of lines
for (let n of selection()) {
	if (isText(n)) {
		n.characters = n.characters.replace(/\\n\\s+/g, "\\n")
	}
}
`),


s("figma/select-all-images", "Figma/Select all images", `
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
let n = selection(0)
// here, n's type is the generic BaseNode
if (isRect(n)) {
	// but here n's type is RectangleNode
}
`),


s("figma/set-images-fit", "Figma/Set images to fit", `
// Loop over images in the selection
for (let shape of await find(selection(), n => isImage(n) && n)) {
	// Update image paints to use "FIT" scale mode
	shape.fills = shape.fills.map(p =>
		isImage(p) ? {...p, scaleMode: "FIT"} : p)
}
`),


s("figma/viewport-intro", "Figma/Viewport", `
// This demonstrates use of the viewport API

// Helper pause function
const pause = () => timer(1000)

// Save current viewport and then change it
viewport.save()
viewport.center = {x:1000,y:0}

// wait for a little while so we can see the effect
await pause()

// restore the last saved viewport
viewport.restore()
await pause()


// Viewports are saved on a stack. We can save multiple:
viewport.save() // viewport 1
viewport.center = {x:1000,y:0}
await pause()
viewport.save() // viewport 2
viewport.center = {x:-1000,y:0}
await pause()
viewport.restore() // restore viewport 2
await pause()
viewport.restore() // restore viewport 1


// save() returns a handle to a specific viewport
let vp1 = viewport.save() // viewport 1
viewport.center = {x:1000,y:0}
viewport.save(false) // viewport 2
viewport.center = {x:-1000,y:0}
await pause()
viewport.restore(vp1) // restore viewport 1


// We can also animate viewport changes.
// This makes use of animate.transition()
viewport.save()
await viewport.setAnimated({x:0,y:0}, 2.0, 0.5)
await pause()
await viewport.restoreAnimated(0.5, animate.easeInOutExpo)
await pause()

// Finally, the first saved viewport is automatically
// restored when a script ends:
viewport.save()
viewport.center = {x:1000,y:0}
await pause()
// viewport.restore() called automatically
`),


//------------------------------------------------------------------------------------------------


s("basics/paths", "Basics/Working with paths", `
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


s("basics/files", "Basics/Working with files", `
// Scripter doesn't support interfacing with your file system,
// but it does provide functions for working with file data.

// fileType can be used to investigate what type of file a
// filename represents:
print(fileType("foo/bar.zip"))

// fileType can even guess the file type based on the first
// few bytes of some file data:
print(fileType([0xFF, 0xD8, 0xFF])) // JPEG image data
`),


s("basics/images", "Basics/Showing images", `
// The Img function and class can be used to describe images
// and load image data for a few common image types.
// Passing an Img to print vizualizes the image.

// Img can take a URL which is then loaded by the web browser
print(Img("https://scripter.rsms.me/icon.png"))

// We can specify the size if we want
print(Img("https://scripter.rsms.me/icon.png", {width:128, height:16}))

// Img.load() allows us to load the image data
let icon = await Img("https://scripter.rsms.me/icon.png").load()
print(icon.data)
// A loaded image may also have information that was read from
// the image data itself, like mime type and bitmap dimensions:
print(icon, icon.type, icon.meta)

// fetchImg is a shorthand function for loading an Img
let loadedIcon = await fetchImg("https://scripter.rsms.me/icon.png")
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
let im1 = Img("https://scripter.rsms.me/sample/colors.jpg")
await im1.load()
print(im1, [im1])
`),


s("basics/timers", "Basics/Timers", `
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



s("basics/range", "Basics/Ranges", `
// The range() function creates a sequence of numbers in the
// range [start–end), incrementing in steps. Steps defaults to 1.
print(range(1, 10))
print(range(1, 10, 3))
print(range(100, 0, 20))

// Ranges are iterable
for (let n of range(1,4)) {
	print(n) ; await timer(200)
}

// If we want a pre-allocated array, we can call the array() function
print(range(10).array())
// or use Array.from, since ranges are iterables
print(Array.from(range(1, 10)))

// range is often useful for graphics. We can represent columns or
// rows similar to the Layout Grids feature in Figma:
let columns = range(80, 512, 64)
print(\`64dp wide columns with 80dp offset: \${columns}\`)

// range() returns a LazySeq, which has several functions commonly
// found for Array, like for instance map():
print(range(-4, 4).map(v => \`0x\${(v*10).toString(16)}\`))

// Since the sequence created by range() is lazy, values are allocated
// only as needed, making range() feasible to represent very large
// imaginary ranges.
// For instance, the following only uses very little memory:
print(range(0, 90000000, 2).at(1234567))

// We can even use Inifite to descrive never-ending sequences.
print(range(0, Infinity, 3).at(1234567918383))
// Be careful when iterating over an infinite sequence since it's easy
// to lock Figma if you forget to explicitly stop iteration.
// Scripter will do its best to stop you from doing this: passing an
// infinite sequence to print() or calling toString() on the sequence
// will only show the first 50 entries followed by "... ∞" to indicate
// that it goes on forever:
print(range(0, Infinity, 3))

// Calling functions which only makes sense on finite sequences—like
// map(), array() or join()—on an infinite sequence throws an error:
try {
	range(0, Infinity).array()
} catch (e) {
	print(e)
}
`),



s("basics/jsx", "Basics/JSX", `
/**
 * Scripter supports JSX for creating nodes.
 * JSX tags map 1:1 to Scripter's node constructor functions,
 * like for instance Rectangle() and Frame().
 **/

<Rectangle fills={[ RED.paint ]} />

/**
 * You may notice that the above line does not actually add a
 * rectangle to the current page. This is an intentional
 * difference between the regular constructor form:
 *   Rectangle(...)
 * and the JSX form:
 *   <Rectangle ... />
 * The regular constructor form adds the object to the current
 * page automatically, while the JSX form does not add the node
 * to the page on creation. Instead you call appendChild or
 * addToScene explicitly.
 **/

let frame :FrameNode =
<Frame height={130} fills={[ WHITE.paint ]}>
	<Rectangle fills={[ RED.paint ]} />
	<Text characters="Hello" x={8} y={110} />
</Frame>

// Try uncommenting this to see the frame added to the page
// addToPage(frame)

// Here is an example of using the regular node constructors:
let g = Group(
	Rectangle(),
	Text({characters:"Hello", y:110}),
)

// remove the group since the regular constructor form automatically
// adds nodes to the current page.
g.remove()
`),


s("basics/animate.transition", "Basics/Animated transitions", `
// This demonstrates use of animate.transition()
// See Misc/Animation for custom animation examples.

// First, save & set the viewport to 0,0
viewport.setSave({x:0,y:0}, 1)

// Create a temporary circle
let n = Ellipse({ width:200, height:200, fills:[RED.paint] })
scripter.onend = () => n.remove()

// Animate the circle moving from left to right by 400dp
await animate.transition(2.0, progress => {
	n.x = progress * -400
})

// Pause for a little while
await timer(500)

// Animate the circle back to 0,using a different timing function
await animate.transition(1.0, animate.easeOutElastic, progress => {
	n.x = -400 + (progress * 400)
})

// Pause for a little while before ending
await timer(500)
`),


//------------------------------------------------------------------------------------------------


s("ui/dialogs", "UI input/Dialogs & Messaging", `
const { notify } = libui

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



s("ui/range-slider", "UI input/Range sliders", `
// Example of using interactive range slider to move a rectangle
const { rangeInput } = libui

// Save viewport and create a red rectangle
let origViewport = { zoom: viewport.zoom, center: viewport.center }
let r = addToPage(Rectangle({ fills: [ORANGE.paint], cornerRadius: 10 }))
try {
	// Set viewport to focus on the rectangle
	viewport.zoom = 1
	viewport.center = {y: r.y, x: r.x}

	// Show a slider and move rectangle as it changes
	for await (let v of rangeInput({min:-300, max:300})) {
		r.x = Math.sin(v * 0.03) * 200
		r.y = Math.cos(v * 0.05) * 80
	}
} finally {
	// Remove the rectangle and restore viewport
	r.remove()
	viewport.center = origViewport.center
	viewport.zoom = origViewport.zoom
}
`),


s("ui/async-gen", "UI input/Async generators", `
// Async generator functions allows creation of iterators which
// may take some amount of time to produce their results.
//
// In this example we use a range input control to generate lists
// of strings upon user moving the slider
async function* meowGenerator(max :number) {
	for await (let count of libui.rangeInput({max, value:1, step:1})) {
		yield range(0, count).map(() => "Meow")
	}
}

// We can now use our meow generator like this:
for await (const meows of meowGenerator(10)) {
	print(meows)
}
`),


//------------------------------------------------------------------------------------------------


s("http/fetch", "HTTP/Fetch", `
// fetch can be used to fetch resources across the interwebs.
// It's the standard fetch API you might already be used to.
let r = await fetch("https://jsonplaceholder.typicode.com/users/1")
print(await r.json())

// Scripter provides a few shorthand functions for common tasks:
print(await fetchJson("https://jsonplaceholder.typicode.com/users/1"))
print(await fetchText("https://jsonplaceholder.typicode.com/users/1"))
print(await fetchImg("https://scripter.rsms.me/icon.png"))
print(await fetchData("https://scripter.rsms.me/icon.png"))
`),


s("http/figma", "HTTP/Figma REST API", `
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


//------------------------------------------------------------------------------------------------


s("worker/basics", "Workers/Worker Basics", `
/**
Workers are new in Scripter since July 2020. Workers is a way to execute code in parallel inside a full WebWorker environment, with access to features like script loading and OffscreenCanvas. There are also iframe-based workers as an option when you need a full complete web DOM with access to the full Web API.

Let's get started with a simple worker:
*/

let w = createWorker(async w => {
  let r = await w.recv()  // wait for input
  let result = "Hello ".repeat(r).trim()  // compute some stuff
  w.send(result)  // send the result
  w.close()  // close the worker
})
w.send(4)  // send some input
print(await w.recv())  // wait for a reply

/**
The above worker is written in idiomatic Scripter style using send() and recv() calls.

If that's not your jam, you can alternatively use the event-based WebWorker API. The following example also shows how you can pass a worker script as a string:
*/

let w2 = createWorker(\`w => {
  w.onmessage = ev => {
    let result = "Bye ".repeat(ev.data).trim()
    w.postMessage(result)
    w.close()
  }
}\`)
w2.postMessage(4)
w2.onmessage = ev => {
  print(ev.data)
}
// We must await the worker or it will be closed immediately
// as the script ends.
await w2

/**
Since Scripter is fully async-await capable, it's usually easier to use the send() and recv() functions instead of postMessage & onmessage events.

send() and recv() are optionally typed, which can be useful when you are writing more complicated scripts or simply prefer to have stricter types:
*/
let w3 = createWorker(async w => {
  let r = await w.recv<number>()  // r is a number
  let result = "Hej ".repeat(r).trim()
  w.send(result)  // type inferred from result
  w.close()
})
w3.send<number>(4)  // this call now only accepts numbers
print(await w3.recv<string>())

/**
One final example: worker requests
The request-response patterns is common with many worker uses and so there is a function-and-event pair to save you time from managing your own request IDs over send & recv:
*/

let w4 = createWorker(async w => {
  w.onrequest = req => {
    return "Hi ".repeat(req.data).trim()  // compute some stuff
  }
})
const r1 = w4.request(/* input: */ 4, /* timeout: */ 1000)
const r2 = w4.request(/* input: */ 9, /* timeout: */ 1000)
print(await r1)
print(await r2)
`),



s("worker/import", "Workers/Importing libraries", `
/**
Workers can import scripts from the Internet and NPM, using w.import().
This opens up a world of millions of JavaScript libraries to Scripter!
Browse libraries at https://www.npmjs.com/

Let's import the lru_map package:
*/
let w = createWorker(async w => {
	let { LRUMap } = await w.import("lru_map")
	let c = new LRUMap(3)
	c.set('sam', 42)
	c.set('john', 26)
	c.set('angela', 24)
	w.send(c.toString())
	c.get('john') // touch entry to make it "recently used"
	w.send(c.toString())
})
print(await w.recv())
print(await w.recv())

/**
You can import any URL; you are not limited to NPM. Additionally, using the importAll function we can import multiple packages at once:
*/
w = createWorker(async w => {
	let [{ LRUMap }, d3] = await w.importAll(
		"https://unpkg.com/lru_map@0.4.0/dist/lru.js",
		"d3@5",
	)
	w.send(\`d3: \${typeof d3}, LRUMap: \${typeof LRUMap}\`)
})
print(await w.recv())

// Note that TypeScript types are not supported for imported modules.
// Scripter considers the API exposed by an imported library as "any".
`),



s("worker/iframe-d3-density-contours", "Workers/IFrame workers", `
/**
Sometimes a worker needs a full Web DOM or access to a Web API only available in full-blown documents, like WebGL. That's when iframe-based workers comes in handy.

This example shows how to load an external library which manipulates SVG in a DOM to create complex graphs. Specifically, the chart generated shows the relationship between idle and eruption times for Old Faithful. (Source: https://observablehq.com/@d3/density-contours)
*/

let w = createWorker({iframe:true}, async w => {
  // load d3 library
  const d3 = await w.import("d3@5")

  // load dataset and add labels to the array
  const data = Object.assign(
    await w.recv<{x:number,y:number}[]>(),
    {x: "Idle (min.)", y: "Erupting (min.)"}
  )

  const width = 800
  const height = 800
  const margin = {top: 20, right: 30, bottom: 30, left: 40}

  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => d.x)).nice()
    .rangeRound([margin.left, width - margin.right])

  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.y)).nice()
    .rangeRound([height - margin.bottom, margin.top])

  const xAxis = g => g.append("g")
    .attr("transform", \`translate(0,\${height - margin.bottom})\`)
    .call(d3.axisBottom(x).tickSizeOuter(0))
    .call(g => g.select(".domain").remove())
    .call(g => g.select(".tick:last-of-type text").clone()
      .attr("y", -3)
      .attr("dy", null)
      .attr("font-weight", "bold")
      .text(data.x))

  const yAxis = g => g.append("g")
    .attr("transform", \`translate(\${margin.left},0)\`)
    .call(d3.axisLeft(y).tickSizeOuter(0))
    .call(g => g.select(".domain").remove())
    .call(g => g.select(".tick:last-of-type text").clone()
      .attr("x", 3)
      .attr("text-anchor", "start")
      .attr("font-weight", "bold")
      .text(data.y))

  const contours = d3.contourDensity()
    .x(d => x(d.x))
    .y(d => y(d.y))
    .size([width, height])
    .bandwidth(30)
    .thresholds(30)
    (data)

  const svg = d3.create("svg")
      .attr("viewBox", [0, 0, width, height]);

  svg.append("g").call(xAxis);

  svg.append("g").call(yAxis);

  svg.append("g")
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-linejoin", "round")
    .selectAll("path")
    .data(contours)
    .enter().append("path")
      .attr("stroke-width", (d, i) => i % 5 ? 0.25 : 1)
      .attr("d", d3.geoPath());

  svg.append("g")
      .attr("stroke", "white")
    .selectAll("circle")
    .data(data)
    .enter().append("circle")
      .attr("cx", d => x(d.x))
      .attr("cy", d => y(d.y))
      .attr("r", 2);

  // respond with SVG code
  w.send(svg.node().outerHTML)
})

// load sample data
const data = await fetchJson("https://scripter.rsms.me/sample/old-faithful.json")

// Send data to the worker for processing.
// The second argument causes data to be transferred
// instead of copied.
w.send(data, [data])

// await a response, then add SVG to Figma document
let svg = await w.recv<string>()
let n = figma.createNodeFromSvg(svg)
figma.viewport.scrollAndZoomIntoView([n])
`),


s("worker/window-basics", "Workers/Windows", `
/**
Workers backed by an iframe can be made visible and interactive via the "visible" property passed to createWorker.
*/
const w1 = createWorker({iframe:{visible:true,width:100}}, async w => {
	w.document.body.innerHTML = \`<p>Hello</p>\`
})

/**
createWindow is a dedicated function for creating windows that house workers. To explore the options and the API, either place your pointer over createWindow below and press F12 or ALT-click the createWindow call to jump to the API documentation.
*/
const w2 = createWindow({width:300,height:100}, async w => {
	let time :any
	const ui = w.createElement("div", {
		style: {
			display: "flex",
			"flex-direction": "column",
			font: "12px sans-serif",
		}},
		w.createElement("button", { onclick() { w.send("ping") } }, "Ping!"),
		w.createElement("button", { onclick() { w.close() } }, "Close window"),
		time = w.createElement("p", {}, "")
	)
	w.document.body.appendChild(ui)

	function updateTime() {
		time.innerText = \`Time: \${(new Date).toTimeString()}\`
	}
	updateTime()
	setInterval(updateTime, 1000)
})

w2.onmessage = ev => {
	// click the "Ping!" button in the window
	print(ev.data)
}

// wait until both windows have been closed
await Promise.all([w1,w2])
`),


s("worker/window-advanced1", "Workers/Windows advanced", `
/**
This is a version of the "IFrame worker" example which uses the d3 library inside a window to create a data visualization. However, instead of adding the generating graph to the Figma document, its shown in an interactive window instead. (Source: https://observablehq.com/@d3/density-contours)

A second window is opened as well, loading a Three.js WebGL via an external URL.
*/
const w1 = createWindow({title:"d3",width:800}, async w => {
  // load data
  const datap = fetch("https://scripter.rsms.me/sample/old-faithful.json").then(r => r.json())

  // load d3 library
  const d3 = await w.import("d3@5")

  // wait for dataset and add labels
  const data = Object.assign(
    await datap,
    {x: "Idle (min.)", y: "Erupting (min.)"}
  )

  const width = 800
  const height = 800
  const margin = {top: 20, right: 30, bottom: 30, left: 40}

  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => d.x)).nice()
    .rangeRound([margin.left, width - margin.right])

  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.y)).nice()
    .rangeRound([height - margin.bottom, margin.top])

  const xAxis = g => g.append("g")
    .attr("transform", \`translate(0,\${height - margin.bottom})\`)
    .call(d3.axisBottom(x).tickSizeOuter(0))
    .call(g => g.select(".domain").remove())
    .call(g => g.select(".tick:last-of-type text").clone()
      .attr("y", -3)
      .attr("dy", null)
      .attr("font-weight", "bold")
      .text(data.x))

  const yAxis = g => g.append("g")
    .attr("transform", \`translate(\${margin.left},0)\`)
    .call(d3.axisLeft(y).tickSizeOuter(0))
    .call(g => g.select(".domain").remove())
    .call(g => g.select(".tick:last-of-type text").clone()
      .attr("x", 3)
      .attr("text-anchor", "start")
      .attr("font-weight", "bold")
      .text(data.y))

  const contours = d3.contourDensity()
    .x(d => x(d.x))
    .y(d => y(d.y))
    .size([width, height])
    .bandwidth(30)
    .thresholds(30)
    (data)

  const svg = d3.create("svg")
      .attr("viewBox", [0, 0, width, height]);

  svg.append("g").call(xAxis);

  svg.append("g").call(yAxis);

  svg.append("g")
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-linejoin", "round")
    .selectAll("path")
    .data(contours)
    .enter().append("path")
      .attr("stroke-width", (d, i) => i % 5 ? 0.25 : 1)
      .attr("d", d3.geoPath());

  svg.append("g")
      .attr("stroke", "white")
    .selectAll("circle")
    .data(data)
    .enter().append("circle")
      .attr("cx", d => x(d.x))
      .attr("cy", d => y(d.y))
      .attr("r", 2);

  // respond with SVG code
  w.document.body.appendChild(svg.node())
})

const w2 = createWindow(
  {title:"Three.js"},
  "https://threejs.org/examples/webgl_postprocessing_unreal_bloom.html")

// wait until both windows have been closed
await Promise.all([w1,w2])
`),


//------------------------------------------------------------------------------------------------


s("advanced/timeout", "Misc/Timeout", `
// Example of using withTimeout for limiting the time
// of a long-running process.

// Try changing the delay here from 200 to 300:
await doSlowThing(200)
async function doSlowThing(timeout :number) {
	let result = await withTimeout(getFromSlowInternet(), timeout)
	if (result == "TIMEOUT") {
		print("network request timed out :-(")
	} else {
		print("network request finished on time :-)", result)
	}
}

// Function that simulates a slow, cancellable network fetch.
// In parctice, this would be some some actual long-running thing
// like fetch call or timer.
function getFromSlowInternet() :CancellablePromise<Object> {
	return timer(250).catch(_=>{}).then(() => ({message: "Hello"}))
}
`),


s("advanced/tick-tock", "Misc/Tick tock, tick tock, tick tock", `
// Demonstrates continously-running scripts.
// This loops forever until you restart or
// stop the script.

for (let i = 1; true; i++) {
	print(i % 2 ? "Tick" : "Tock")
	await timer(1000)  // wait for 1 second
}
`),


s("advanced/animation", "Misc/Animation", `
// Example of using animate() to create custom animations

// Create a temporary rectangle
let r = Rectangle({ fills:[ORANGE.paint], rotation: 45 })
scripter.onend = () => r.remove()

// save viewport and focus on the rectangle
viewport.focusSave(r, 1.0)

// extent of motion in dp and shorthand functions
const size = viewport.bounds.width / 2 - r.width
const { cos, sin, abs, PI } = Math

// animation loop
await animate(time => {
	// This function is called at a high frequency with
	// time incrementing for every call.
	time *= 3 // alter speed
	let scale = size / (3 - cos(time * 2))
	r.x = scale * cos(time) - (r.width / 2)
	r.y = scale * sin(3 * time) / 1.5 - (r.height / 2)
	r.rotation = cos(time) * 45
})
`),


// Note: There's a reference to the name of this in scripter-env.d.ts
s("misc/timing-function-viz", "Misc/Timing Functions", `
// This generates a grid of graphs visualizing the different
// timing functions available from animate.ease*
// See Misc/Animation for examples of how to use these functions.

viewport.focus(getTimingFunctions().map(createGraph))

function createGraph(f :(n:number)=>number, index :int) {
	const width = 200, height = 200, step = 2
	const columns = 6
	const spacing = Math.round(width * 0.75)
	const xoffs = (index % columns) * (width + spacing)
	const yoffs = Math.ceil((index + 1) / columns) * (height + spacing)
	let n = buildVector({ width, height, strokeWeight: 2 }, c => {
		let prevy = 0
		for (let x of range(step, width, step)) {
			let y = f(x / width) * height
			c.line(
				{x: xoffs + x,        y: yoffs + prevy},
				{x: xoffs + x + step, y: yoffs + y}
			)
			prevy = y
		}
	}) as SceneNode
	n = figma.flatten([n]) // merge into a line
	if (f.name) {
		let t = createText({
			characters: f.name,
			x: xoffs,
			y: yoffs + height + 10,
			width: width,
		})
		n = createGroup({expanded:false}, n, t)
		n.name = f.name
	}
	return n
}

function getTimingFunctions() :SAnimationTimingFunction[] {
	// collect timing functions, using a set to ignore aliases
	let v = new Set<SAnimationTimingFunction>()
	for (let k of Object.keys(animate)) {
		if (k.startsWith("ease")) {
			v.add(animate[k])
		}
	}
	return Array.from(v)
}
`),


s("advanced/poisson-disc-gen", "Misc/Poisson-disc generator", `
/**
Progressively generates Poisson-disc pattern.
Poisson-disc sampling produces points that are tightly-packed, but no closer to each other than a specified minimum distance, resulting in a more natural pattern.
This implementation is based on https://bl.ocks.org/mbostock/dbb02448b0f93e4c82c3 and uses a worker which computes Poisson-disc samples using a generator. Samples are sent from the worker to the Scripter script which then creates discs on the Figma canvas.
*/

// Constants controlling the resulting graphic
const width  = 900
const height = 800
const density      = 8  // average distance between vertices
const circleRadius = 2  // radius of dots drawn for each vertex

// Simple 2D vector used for vertices
type Vec = [number,number]

// Request data that the Poisson-disc generator worker accepts
interface PoissonDiscGenRequest {
	width  :number  // size of area to fill
	height :number  // size of area to fill
	radius :number  // density of vertices
}

// Poisson-disc generator worker
const w = createWorker({iframe:{visible:false}}, async w => {

	const r = await w.recv<PoissonDiscGenRequest>()

	let sendq :Vec[] = []
	for (const v of poissonDiscSampler(r.width, r.height, r.radius)) {
		sendq.push(v)
		if (sendq.length >= 100) {
			await w.recv()
			w.send(sendq)
			sendq.length = 0
		}
	}
	// send possibly last samples and finally an empty list,
	// which signals the end for the Scripter script.
	w.send(sendq)
	w.send([])

	function* poissonDiscSampler(width :int, height :int, radius :number) :Generator<Vec> {
		// Based on https://bl.ocks.org/mbostock/dbb02448b0f93e4c82c3
		const k = 30, // maximum number of samples before rejection
		      radius2 = radius * radius,
		      radius2_3 = 3 * radius2,
		      cellSize = radius * Math.SQRT1_2,
		      gridWidth = Math.ceil(width / cellSize),
		      gridHeight = Math.ceil(height / cellSize),
		      grid = new Array<Vec>(gridWidth * gridHeight),
		      queue :Vec[] = []

		// Pick the first sample.
		yield sample(
			width / 2 + Math.random() * radius,
			height / 2 + Math.random() * radius)

		// Pick a random existing sample from the queue.
		pick: while (queue.length) {
			const i = Math.random() * queue.length | 0
			const parent = queue[i]

			// Make a new candidate between [radius, 2 * radius] from the existing sample.
			for (let j = 0; j < k; ++j) {
				const a = 2 * Math.PI * Math.random(),
				      r = Math.sqrt(Math.random() * radius2_3 + radius2),
				      x = parent[0] + r * Math.cos(a),
				      y = parent[1] + r * Math.sin(a)

				// Accept candidates that are inside the allowed extent
				// and farther than 2 * radius to all existing samples.
				if (0 <= x && x < width && 0 <= y && y < height && far(x, y)) {
					//yield {add: sample(x, y), parent}
					yield sample(x, y)
					continue pick
				}
			}

			// If none of k candidates were accepted, remove it from the queue.
			const r = queue.pop()
			if (i < queue.length) queue[i] = r as Vec
		}

		function far(x :number, y :number) :bool {
			const i = x / cellSize | 0,
			      j = y / cellSize | 0,
			      i0 = Math.max(i - 2, 0),
			      j0 = Math.max(j - 2, 0),
			      i1 = Math.min(i + 3, gridWidth),
			      j1 = Math.min(j + 3, gridHeight)
			for (let j = j0; j < j1; ++j) {
				const o = j * gridWidth
				for (let i = i0; i < i1; ++i) {
					const s = grid[o + i]
					if (s) {
						const dx = s[0] - x
						const dy = s[1] - y
						if (dx * dx + dy * dy < radius2) return false
					}
				}
			}
			return true
		}

		function sample(x :number, y :number) :Vec {
			const i = gridWidth * (y / cellSize | 0) + (x / cellSize | 0)
			const s = grid[i] = [x, y]
			queue.push(s)
			return s
		}
	}

})

// Ask the worker to generate vertices with poisson-disc distribution
w.send<PoissonDiscGenRequest>({
	width,
	height,
	radius: density,
})

// make a frame to house the results
const frame = Frame({ width, height, expanded: false })
figma.viewport.scrollAndZoomIntoView([frame])

// color spectrum
const colors :(t :number)=>RGB = rgbSpline([
	"#ff0000", "#d53e4f", "#f46d43",
	"#fdae61", "#fee08b", // "#ffffbf", "#e6f598",
	"#abdda4", "#66c2a5", "#3288bd", "#5e4fa2"
])

// add dots as they arrive from the worker
const center :Vec = [ width * 0.5, height * 0.5 ]
const farDistance = squareDistance([0,0], center)
while (true) {
	w.send(1)
	const vertices = await w.recv<Vec[]>()
	if (vertices.length == 0) {
		break
	}
	for (let v of vertices) {
		frame.appendChild(
			// Create a shape.
			// Try changing "Ellipse" to "Star" or "Rectangle"
			Ellipse({
				fills: [ {
					type: "SOLID",
					color: colors(squareDistance(center, v) / farDistance)
				} ],
				x: v[0] - circleRadius,
				y: v[1] - circleRadius,
				width: circleRadius * 2,
				height: circleRadius * 2,
				constrainProportions: true
			})
		)
	}
}

function squareDistance(a :Vec, b :Vec) :number {
	let x = a[0] - b[0]
	let y = a[1] - b[1]
	return Math.sqrt(x * x + y * y)
}

// little color gradient function for making interpolateable ramps
function rgbSpline(colors :string[]) :(t:number)=>RGB {
	const n = colors.length
	const r = new Float64Array(n)
	const g = new Float64Array(n)
	const b = new Float64Array(n)
	let color = { r:0, g:0, b:0 }

	for (let i = 0; i < n; ++i) {
		parseColor(colors[i], color)
		r[i] = color.r || 0
		g[i] = color.g || 0
		b[i] = color.b || 0
	}

	const rf = basisSpline(r),
	      gf = basisSpline(g),
	      bf = basisSpline(b)

	return (t :number) :RGB => {
		color.r = Math.max(0, Math.min(1, rf(t) / 255.0))
		color.g = Math.max(0, Math.min(1, gf(t) / 255.0))
		color.b = Math.max(0, Math.min(1, bf(t) / 255.0))
		return color  // borrow
		// return { r: rf(t), g: gf(t), b: bf(t) }  // alloc & copy
	}

	function basisSpline(values :ArrayLike<number>) :(t :number)=>number {
		const n = values.length - 1
		return (t :number) => {
			let i = (
				t <= 0 ? (t = 0) :
				t >= 1 ? (t = 1, n - 1) :
				Math.floor(t * n)
			)
			let v1 = values[i]
			let v2 = values[i + 1]
			let v0 = i > 0 ? values[i - 1] : 2 * v1 - v2
			let v3 = i < n - 1 ? values[i + 2] : 2 * v2 - v1
			let t1 = (t - i / n) * n
			let t2 = t1 * t1, t3 = t2 * t1
			return ((1 - 3 * t1 + 3 * t2 - t3) * v0
			     + (4 - 6 * t2 + 3 * t3) * v1
			     + (1 + 3 * t1 + 3 * t2 - 3 * t3) * v2
			     + t3 * v3) / 6;
		}
	}

	function parseColor(s :string, out :{ r :number, g :number, b :number }) {
		if (s[0] == '#') {
			s = s.substr(1)
		}
		let n = parseInt(s, 16)
		out.r = n >> 16 & 0xff
		out.g = n >> 8 & 0xff
		out.b = n & 0xff
	}
}
`),


] as ExampleScript[])
