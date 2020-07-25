// Automatically generated from src/common/scripter-env.d.ts by misc/build-scriptenv.js.
// Do not edit manually -- instead, run misc/build-scriptenv.js

export type ScriptEnv = typeof scriptenv
declare namespace scriptenv {
//
// The Scripter environment.
//
// What's declared here is available to scripts in their global namespace.
//



// symbolic type aliases
type int   = number
type float = number
type byte  = number
type bool  = boolean

/** Outputs a message to the console and on screen */
function print(...args :any[]) :void

/** Throws an error if condition is not thruthy */
function assert(condition :any, ...message :any[]) :void

/** Promise which can be cancelled */
interface CancellablePromise<T=void> extends Promise<T> { cancel():void }

/**
 * Creates a cancellable Promise.
 *
 * Example:
 * ```
 * let p = createCancellablePromise((resolve, reject, oncancel) => {
 *   let timer = setTimeout(() => resolve("ok"), 600)
 *   oncancel(() => {
 *     clearTimeout(timer)
 *     reject("cancelled")
 *   })
 * })
 * p.then(v => console.log("resolved", v))
 *  .catch(v => console.warn("rejected", v))
 * setTimeout(() => { p.cancel() }, 500)
 * ```
 */
function createCancellablePromise<T>(
  executor :(
    resolve  : (v? :T | PromiseLike<T>) => void,
    reject   : ((reason?:any)=>void),
    oncancel : (f:()=>void)=>void
  )=>void,
) :CancellablePromise<T>

// timer functions
function clearInterval(id?: number): void;
function clearTimeout(id?: number): void;
function setInterval(handler: string|Function, timeout?: number, ...arguments: any[]): number;
function setTimeout(handler: string|Function, timeout?: number, ...arguments: any[]): number;

/** Start a timer that expires after `duration` milliseconds */
function Timer(duration :number, handler? :(canceled?:boolean)=>any) :Timer
function timer(duration :number, handler? :(canceled?:boolean)=>any) :Timer
interface Timer<T = void> extends CancellablePromise<T> {
  cancel() :void

  then<R1=T,R2=never>(
    onfulfilled?: ((value: T) => R1|PromiseLike<R1>)|undefined|null,
    onrejected?: ((reason: any) => R2|PromiseLike<R2>)|undefined|null,
  ): Timer<R1>;

  catch(onrejected?: ((reason: any) => any|PromiseLike<any>)|undefined|null): Timer<T>;
}

class TimerCancellation extends Error {
  readonly name :"TimerCancellation"
}

/**
 * Adds a timeout to a cancellable process.
 * When timeout is reached, "TIMEOUT" is returned instead R.
 */
function withTimeout<
  T extends CancellablePromise<R>,
  R = T extends Promise<infer U> ? U : T
>(p :T, timeout :number) :CancellablePromise<R|"TIMEOUT">

var animate :SAnimate
interface SAnimate {
  /**
   * animate(f) calls f at a high enough frequency to animate things.
   * The time argument to f is a monotonically-incrementing number of seconds, starting at the
   * call to animate(). It has millisecond precision.
   * Return or throw "STOP" to end animation, which resolves the promise.
   */
  (f :SAnimationCallback) :SAnimation

  /**
   * transition is used to create animated transitions over a set amount of time (duration).
   * The provided function f is called with progress (not time) in the range [0-1] with an optional
   * timing function. If no timing function is provided, animate.easeInOut is used.
   * Note that duration is defined in seconds (not milliseconds.)
   * See https://easings.net/ for a visual overview of timing functions.
   */
  transition(duration :number, timingf :SAnimationTimingFunction|null, f :SAnimationCallback) :SAnimation

  /**
   * transition is used to create animated transitions over a set amount of time (duration).
   * The provided function f is called with progress (not time) in the range [0-1].
   * The animate.easeInOut timing function is used.
   * Note that duration is defined in seconds (not milliseconds.)
   */
  transition(duration :number, f :SAnimationCallback) :SAnimation

  // Timing functions
  // See https://easings.net/ for a visual overview of timing functions.
  readonly easeIn           :SAnimationTimingFunction  // == easeInQuad
  readonly easeOut          :SAnimationTimingFunction  // == easeOutQuad
  readonly easeInOut        :SAnimationTimingFunction  // == easeInOutQuad
  readonly easeInQuad       :SAnimationTimingFunction
  readonly easeOutQuad      :SAnimationTimingFunction
  readonly easeInOutQuad    :SAnimationTimingFunction
  readonly easeInCubic      :SAnimationTimingFunction
  readonly easeOutCubic     :SAnimationTimingFunction
  readonly easeInOutCubic   :SAnimationTimingFunction
  readonly easeInQuart      :SAnimationTimingFunction
  readonly easeOutQuart     :SAnimationTimingFunction
  readonly easeInOutQuart   :SAnimationTimingFunction
  readonly easeInQuint      :SAnimationTimingFunction
  readonly easeOutQuint     :SAnimationTimingFunction
  readonly easeInOutQuint   :SAnimationTimingFunction
  readonly easeInSine       :SAnimationTimingFunction
  readonly easeOutSine      :SAnimationTimingFunction
  readonly easeInOutSine    :SAnimationTimingFunction
  readonly easeInExpo       :SAnimationTimingFunction
  readonly easeOutExpo      :SAnimationTimingFunction
  readonly easeInOutExpo    :SAnimationTimingFunction
  readonly easeInCirc       :SAnimationTimingFunction
  readonly easeOutCirc      :SAnimationTimingFunction
  readonly easeInOutCirc    :SAnimationTimingFunction
  readonly easeInBack       :SAnimationTimingFunction
  readonly easeOutBack      :SAnimationTimingFunction
  readonly easeInOutBack    :SAnimationTimingFunction
  readonly easeInElastic    :SAnimationTimingFunction
  readonly easeOutElastic   :SAnimationTimingFunction
  readonly easeInOutElastic :SAnimationTimingFunction
  readonly easeInBounce     :SAnimationTimingFunction
  readonly easeInOutBounce  :SAnimationTimingFunction
}

/** Cancellable and waitable animation handle */
interface SAnimation extends Promise<void> {
  cancel() :void
}

type SAnimationCallback = (t :number) => void|undefined|"STOP"

/**
 * Animation easing function receives time in the range [0-1] and
 * outputs normalized position in the range [0-1].
 */
type SAnimationTimingFunction = (t :number) => number


/** Set to true if the script was canceled by the user */
var canceled :boolean;

/** Ignored value */
var _ :any;

/**
 * Shows a modal dialog with question and yes/no buttons.
 *
 * Returns true if the user answered "yes".
 */
function confirm(question: string): Promise<bool>;

/** Presents a message to the user in a disruptive way. */
function alert(message: string): void;

// ------------------------------------------------------------------------------------
// worker

/** Data that can be moved from Scripter to a worker */
type ScripterTransferable = ArrayBuffer;

/** Create a worker */
function createWorker(scriptOrURL :string | ScripterWorkerFun) :ScripterWorker

/** Create a iframe-based worker, with a full DOM */
function createWorker(
  opt :ScripterCreateWorkerOptions & { iframe: ScripterWorkerIframeConfig & {visible:true} },
  scriptOrURL :string | ScripterWorkerDOMFun
) :ScripterWindowedWorker

/** Create an iframe-based worker, with a full DOM */
function createWorker(
  opt :ScripterCreateWorkerOptions & { iframe: (ScripterWorkerIframeConfig & {visible?:false}) | true },
  scriptOrURL :string | ScripterWorkerDOMFun
) :ScripterWorker

/** Create a worker, with options */
function createWorker(
  opt :ScripterCreateWorkerOptions | undefined | null,
  scriptOrURL :string | ScripterWorkerFun
) :ScripterWorker

/**
 * Create an iframe-based worker in a visible window.
 * Equivalent to createWorker({iframe:{visible:true,...opt}},scriptOrURL)
 */
function createWindow(
  opt :(ScripterWorkerIframeConfig & { visible?: never }) | undefined | null,
  scriptOrURL :string | ScripterWorkerDOMFun
) :ScripterWindowedWorker

/**
 * Create an iframe-based worker in a visible window.
 * Equivalent to createWorker({iframe:{visible:true,...opt}},scriptOrURL)
 */
function createWindow(scriptOrURL :string | ScripterWorkerDOMFun) :ScripterWindowedWorker


/** Interface to a worker */
interface ScripterWorker extends Promise<void> {
  /** Event callback invoked when a message arrives from the worker */
  onmessage? :((ev :ScripterMessageEvent)=>void) | null

  /** Event callback invoked when a message error occurs */
  onmessageerror? :((ev :ScripterMessageEvent)=>void) | null

  /**
   * Event callback invoked when an error occurs.
   * When this happens, the worker should be considered defunct.
   */
  onerror? :((err :ScripterWorkerError)=>void) | null

  /** Event callback invoked when the worker closes */
  onclose? :()=>void

  /** Send a message to the worker */
  postMessage(msg :any, transfer?: ScripterTransferable[]) :void

  /** Send a message to the worker (alias for postMessage) */
  send<T=any>(msg :T, transfer?: ScripterTransferable[]) :void  // alias for postMessage

  /**
   * Receive a message from the worker. Resolves on the next message received.
   * This is an alternative to event-based message processing with `onmessage`.
   */
  recv<T=any>() :Promise<T>

  /**
   * Send a message to the worker and wait for a response.
   * If the worker responds to the onrequest event, that handler is used to fullfill
   * the request.
   * Otherwise, if the worker does not implement onrequest, the behavior is identical
   * to the following code: w.send(msg).then(() => w.recv<OutT>())
   *
   * timeout is given in milliseconds. Absense of timeout, zero or negative timeout
   * means "no timeout". When a request times out, the promise is rejected.
   */
  request<InT=any,OutT=any>(
    msg :InT,
    transfer?: ScripterTransferable[],
    timeout? :number,
  ) :Promise<OutT>

  request<InT=any,OutT=any>(msg :InT, timeout :number) :Promise<OutT>

  /** Request termination of the worker */
  terminate() :this
}

interface ScripterWindowedWorker extends ScripterWorker {
  /** Move and resize the window */
  setFrame(x :number, y :number, width :number, height :number) :void

  /** Close the window. Alias for ScripterWorker.terminate() */
  close() :void
}

interface ScripterCreateWorkerOptions {
  /**
   * If true, the worker will actually run in an iframe with a full DOM.
   * Note that iframes are a little slower and blocks the UI thread.
   * This is useful for making certain libraries work which depend on DOM features,
   * like for example the popular D3 library.
   */
  iframe?: ScripterWorkerIframeConfig | boolean | null
}

type ScripterWorkerFun = (self :ScripterWorkerEnv) => void|Promise<void>
type ScripterWorkerDOMFun = (self :ScripterWorkerDOMEnv) => void|Promise<void>

type WebDOMInterface = typeof WebDOM
type WebWorkerEnvInterface = typeof WebWorkerEnv

// type ScripterWorkerDOMEnv = ScripterWorkerBaseEnv & WebDOMInterface
// type ScripterWorkerEnv = ScripterWorkerBaseEnv & WebWorkerEnvInterface

interface ScripterWorkerEnv extends ScripterWorkerBaseEnv, WebWorkerEnvInterface {
}

interface ScripterWorkerDOMEnv extends ScripterWorkerBaseEnv, WebDOMInterface {
  /**
   * Import scripts into the worker process.
   * Consider using importAll(...urls) or import(url) instead as those functions
   * has better support for more modules and for loading from NPM.
   * This function is defined mainly to make WebWorker-based code portable.
   */
  importScripts(...urls: string[]): Promise<void>

  /**
   * React-style DOM builder.
   * Thin wrapper around document.createElement.
   */
  createElement<T extends WebDOM.Element>(
    name        :string,
    attrs?      :{[k:string]:any},
    ...children :any[]
  ) :T
}

interface ScripterWorkerBaseEnv {
  /** Close this worker */
  close(): void

  /**
   * Invoked when a request initiated by a call to ScripterWorker.request() is received.
   * The return value will be sent as the response to the request.
   */
  onrequest? :(req :ScripterWorkerRequest) => Promise<any>|any

  /** Send a message to the main Scripter script (alias for postMessage) */
  send<T=any>(msg :T, transfer?: WebDOM.Transferable[]) :void  // alias for postMessage

  /**
   * Receive a message from the main Scripter script.
   * Resolves on the next message received.
   * This is an alternative to event-based message processing with `onmessage`.
   */
  recv<T=any>() :Promise<T>

  /**
   * Wrapper around importScripts() for importing a script that expects a CommonJS
   * environment, i.e. module object and exports object. Returns the exported API.
   *
   * Caveat: If more than one call is performed at once, the results are undefined.
   * This because CommonJS relies on a global variable.
   */
  importCommonJS(url :string) :Promise<any>

  /**
   * Import an AMD- or CommonJS-compatible library. Returns its exported API.
   * Most libraries targeting web browsers support AMD or CommonJS.
   * See https://github.com/amdjs/amdjs-api for details in AMD modules.
   */
  import(url: string): Promise<any>

  /**
   * Import one or more AMD- or CommonJS-compatible libraries.
   * Returns its exported APIs in the same order as the input urls.
   * Most libraries targeting web browsers support AMD or CommonJS.
   * See https://github.com/amdjs/amdjs-api for details in AMD modules.
   *
   * @see import
   */
  importAll(...urls: string[]): Promise<any[]>
}


interface ScripterWorkerIframeConfig {
  /** If true, show the iframe rather than hiding it */
  visible? :boolean

  /** Width of the iframe */
  width? :number

  /** Height of the iframe */
  height? :number

  /** Position on screen of visible iframe's window (measured from top left) */
  x? :number

  /** Position on screen of visible iframe's window (measured from top left) */
  y? :number

  /** Sets the window title of visible iframes */
  title? :string
}

interface ScripterWorkerRequest {
  readonly id   :string
  readonly data :any
}

interface ScripterWorkerError {
  readonly colno?: number;
  readonly error?: any;
  readonly filename?: string;
  readonly lineno?: number;
  readonly message?: string;
}

/** Minimal version of the Web DOM MessageEvent type */
interface ScripterMessageEvent {
  readonly type: "message" | "messageerror";
  /** Data of the message */
  readonly data: any;
  readonly origin: string;
}

// ------------------------------------------------------------------------------------
// DOM

/** JSX interface for creating Figma nodes */
var DOM :DOM
interface DOM {
  /**
   * Create a node.
   * Nodes created with createElement are initially hidden and automatically
   * removed when the script ends, unless added to the scene explicitly.
   *
   * Can be used to created trees of nodes, e.g.
   *   let f = DOM.createElement(Frame, null,
   *     DOM.createElement(Rectangle),
   *     DOM.createElement(Text, {characters:"Hello", y:110}) )
   *   figma.currentPage.appendChild(f)
   */
  createElement<N extends BaseNode, P extends Partial<N>>(
    cons        :(props?:P|null)=>N,
    props?      :P | null,
    ...children :BaseNode[]
  ): N

  /**
   * Create a node by name.
   * Name starts with a lower-case character. e.g. "booleanOperation".
   */
  createElement(
    kind        :string,
    props?      :{[k:string]:any} | null,
    ...children :never[]
  ): SceneNode

  // TODO: Consider defining types for all known names.
  //       We could define a `nodeNames:{"name":RectangleNode, ...}` type which can
  //       then be used to do `keyof` to build a single type that expresses all node types.
  //
  // Note: Currently Monaco/TypeScript does not provide result type support for
  //       JSX, so doing this has little to no upside.
  //
  // createElement(
  //   kind        :"rectangle",
  //   props?      :Partial<RectangleNode> | null,
  //   ...children :never[]
  // ): RectangleNode
}


// ------------------------------------------------------------------------------------
// fetch

/**
 * Starts the process of fetching a resource from the network, returning a promise
 * which is fulfilled once the response is available.
 */
function fetch(input: WebDOM.RequestInfo, init?: WebDOM.RequestInit): Promise<WebDOM.Response>;

/** Shorthand for fetch().then(r => r.text()) */
function fetchText(input: WebDOM.RequestInfo, init?: WebDOM.RequestInit): Promise<string>;

/** Shorthand for fetch().then(r => r.json()) */
function fetchJson(input: WebDOM.RequestInfo, init?: WebDOM.RequestInit): Promise<any>;

/** Shorthand for fetch().then(r => r.arrayBuffer()).then(b => new Uint8Array(b)) */
function fetchData(input: WebDOM.RequestInfo, init?: WebDOM.RequestInit): Promise<Uint8Array>;

/** Shorthand for fetchData().then(data => Img(data)) */
function fetchImg(input: WebDOM.RequestInfo, init?: WebDOM.RequestInit): Promise<Img>;


// ------------------------------------------------------------------------------------
// Img

/** Drawable image. Accepts a URL or image data. Can be passed to print for display. */
interface Img<DataType=null|Uint8Array> {
  type        :string      // mime type
  width       :number      // 0 means "unknown"
  height      :number      // 0 means "unknown"
  pixelWidth  :number      // 0 means "unknown"
  pixelHeight :number      // 0 means "unknown"
  source      :string|Uint8Array // url or image data
  data        :DataType    // image data if loaded

  /** Type-specific metadata. Populated when image data is available. */
  meta :{[k:string]:any}

  /** Load the image. Resolves immediately if source is Uint8Array. */
  load() :Promise<Img<Uint8Array>>

  /** Get Figma image. Cached. Calls load() if needed to load the data. */
  getImage() :Promise<Image>

  /** Create a rectangle node with the image as fill, scaleMode defaults to "FIT". */
  toRectangle(scaleMode? :"FILL" | "FIT" | "CROP" | "TILE") :Promise<RectangleNode>
}
interface ImgOptions {
  type?   :string  // mime type
  width?  :number
  height? :number
}
interface ImgConstructor {
  new(data :ArrayBufferLike|Uint8Array|ArrayLike<number>, optionsOrWidth? :ImgOptions|number): Img<Uint8Array>;
  new(url :string, optionsOrWidth? :ImgOptions|number): Img<null>;
  (data :ArrayBufferLike|Uint8Array|ArrayLike<number>, optionsOrWidth? :ImgOptions|number): Img<Uint8Array>;
  (url :string, optionsOrWidth? :ImgOptions|number): Img<null>;
}
var Img: ImgConstructor;


// ------------------------------------------------------------------------------------
// path, file, data

namespace Path {
  /** Returns the filename extension without ".". Returns "" if none. */
  function ext(name :string) :string

  /** Returns the directory part of the path. E.g. "/foo/bar/baz" => "/foo/bar" */
  function dir(path :string) :string

  /** Returns the base of the path. E.g. "/a/b" => "b" */
  function base(path :string) :string

  /** Cleans up the pathname. E.g. "a/c//b/.." => "a/c" */
  function clean(path :string) :string

  /** True if the path is absolute */
  function isAbs(path :string) :bool

  /** Returns a path with paths joined together. E.g. ["foo/", "//bar", "baz"] => "foo/bar/baz" */
  function join(...paths :string[]) :string
  function join(paths :string[]) :string

  /** Returns a list of path components. E.g. "/foo//bar/" => ["", "foo", "bar"] */
  function split(path :string) :string[]
}

/**
 * Inspects the header (first ~20 or so bytes) of data to determine the type of file.
 * Similar to the POSIX "file" program. Returns null if unknown.
 */
function fileType(data :ArrayLike<byte>|ArrayBuffer) :FileTypeInfo|null
/** Returns mime type and other information for the file, based on the provided filename. */
function fileType(filename :string) :FileTypeInfo|null
/** Data returned by the fileType function, describing a type of file data */
interface FileTypeInfo {
  type :string    // mime type
  exts :string[]  // filename extensions
  description? :string
}


/**
 * Returns a Uint8Array of the input.
 * If the input is a string, it's expected to be a description of bytes, not a literal.
 * Example: "FF a7 0x9, 4" (whitespace, linebreaks and comma are ignored)
 * If the input is some kind of list, it is converted if needed to a Uint8Array.
 */
function Bytes(input :string|ArrayLike<byte>|ArrayBuffer|Iterable<byte>) :Uint8Array


// ------------------------------------------------------------------------------------
// Figma

/** A node that may have children */
type ContainerNode = BaseNode & ChildrenMixin

// [All nodes which extends DefaultShapeMixin]
/** Shape is a node with visible geometry. I.e. may have fill, stroke etc. */
type Shape = BooleanOperationNode
           | EllipseNode
           | LineNode
           | PolygonNode
           | RectangleNode
           | StarNode
           | TextNode
           | VectorNode

/** Get the current selection in Figma */
function selection() :ReadonlyArray<SceneNode>;
/** Get the nth currently-selected node in Figma */
function selection(index :number) :SceneNode|null;

/** Set the current selection. Non-selectable nodes of n, like pages, are ignored. */
function setSelection<T extends BaseNode|null|undefined|ReadonlyArray<BaseNode|null|undefined>>(n :T) :T;

/** Version of Figma plugin API that is currently in use */
var apiVersion :string

/** The "MIXED" symbol (figma.mixed), signifying "mixed properties" */
var MIXED :symbol

/** Current page. Equivalent to figma.currentPage */
var currentPage :PageNode

// ------------------------------------------------------------------------------------
// viewport

/** Viewport */
var viewport :SViewportAPI
interface SViewportAPI extends ViewportAPI {
  /**
   * Save the viewport state on a stack.
   * You can later call restore() to restore the last save()d viewport, or call
   * restore(state) to restore a from a specific call to save().
   * If autorestore=false, restore() will NOT be called when the script ends.
   * Returns an opaque value that identifies the viewport state, which can be used with restore().
   */
  save(autorestore? :boolean /*=true*/) :SViewportState

  /** Restore the most recently save()d viewport */
  restore() :void

  /** Restore a specific viewport */
  restore(state :SViewportState|null) :void

  /** Restore the most recently save()d viewport with animation */
  restoreAnimated(duration? :number, timingf? :SAnimationTimingFunction) :SAnimation

  /** Restore a specific viewport with animation */
  restoreAnimated(state :SViewportState|null, duration? :number, timingf? :SAnimationTimingFunction) :SAnimation


  /** Convenience function equivalent to setting viewport.center and viewport.zoom */
  set(center :Vector|null, zoom? :number|null) :void

  /**
   * Change viewport with transitional animation.
   * The returned SAnimation promise resolves when the animation completes.
   * Call cancel() on the returned SAnimation to cancel the animation.
   * When cancelled, the viewport will be left in whatever state it was during the animation.
   * duration defaults to 1.0 seconds, timingf defaults to default of animate.transition.
   */
  setAnimated(center :Vector|null, zoom? :number|null, duration? :number, timingf? :SAnimationTimingFunction) :SAnimation

  /**
   * Convenience function equivalent to calling viewport.save() and viewport.set().
   * If autorestore=false, restore() will NOT be called when the script ends.
   * Returns an opaque value that identifies the viewport state, which can be used with restore().
   */
  setSave(center :Vector|null, zoom? :number|null, autorestore? :boolean /*=true*/) :SViewportState

  /**
   * Adjust viewport position and zoom around the provided node or nodes.
   */
  focus(nodes: ReadonlyArray<BaseNode>|BaseNode) :void

  /**
   * Save the viewport and then adjust position and zoom around the provided node or nodes.
   * If zoom is provided, use explicit zoom level instead of automatic.
   * If autorestore=false, restore() will NOT be called when the script ends.
   */
  focusSave(nodes: ReadonlyArray<BaseNode>|BaseNode, zoom? :number, autorestore? :boolean /*=true*/) :SViewportState
}

interface SViewportState {} // opaque

// End of viewport
// ------------------------------------------------------------------------------------

/**
 * Add node to current page.
 * Equivalent to `(figma.currentPage.appendChild(n),n)`
 */
function addToPage<N extends SceneNode>(n :N) :N

/**
 * Store data on the user's local machine. Similar to localStorage.
 * Data may disappear if user clears their web browser cache.
 */
var clientStorage: ClientStorageAPI

type NodeProps<N> = Partial<Omit<N,"type">>

// Node constructors
// Essentially figma.createNodeType + optional assignment of props
//
/** Creates a new Page */
function Page(props? :NodeProps<PageNode>|null, ...children :SceneNode[]): PageNode;
/** Creates a new Rectangle */
function Rectangle(props? :NodeProps<RectangleNode>) :RectangleNode;
/** Creates a new Line */
function Line(props? :NodeProps<LineNode>|null): LineNode;
/** Creates a new Ellipse */
function Ellipse(props? :NodeProps<EllipseNode>|null): EllipseNode;
/** Creates a new Polygon */
function Polygon(props? :NodeProps<PolygonNode>|null): PolygonNode;
/** Creates a new Star */
function Star(props? :NodeProps<StarNode>|null): StarNode;
/** Creates a new Vector */
function Vector(props? :NodeProps<VectorNode>|null): VectorNode;
/** Creates a new Text */
function Text(props? :NodeProps<TextNode>|null): TextNode;
/** Creates a new BooleanOperation */
function BooleanOperation(props? :NodeProps<BooleanOperationNode>|null): BooleanOperationNode;
/** Creates a new Frame */
function Frame(props? :NodeProps<FrameNode>|null, ...children :SceneNode[]): FrameNode;
/** Creates a new Group. If parent is not provided, the first child's parent is used for the group. */
function Group(props :NodeProps<GroupNode & {index :number}>|null, ...children :SceneNode[]): GroupNode;
function Group(...children :SceneNode[]): GroupNode;
/** Creates a new Component */
function Component(props? :NodeProps<ComponentNode>|null, ...children :SceneNode[]): ComponentNode;
/** Creates a new Slice */
function Slice(props? :NodeProps<SliceNode>|null): SliceNode;
/** Creates a new PaintStyle */
function PaintStyle(props? :NodeProps<PaintStyle>|null): PaintStyle;
/** Creates a new TextStyle */
function TextStyle(props? :NodeProps<TextStyle>|null): TextStyle;
/** Creates a new EffectStyle */
function EffectStyle(props? :NodeProps<EffectStyle>|null): EffectStyle;
/** Creates a new GridStyle */
function GridStyle(props? :NodeProps<GridStyle>|null): GridStyle;



// Type guards, nodes
//
/** Checks if node is of type Document */
function isDocument(n :BaseNode|null|undefined) :n is DocumentNode;
/** Checks if node is of type Page */
function isPage(n :BaseNode|null|undefined) :n is PageNode;
/** Checks if node is of type Rectangle */
function isRectangle(n :BaseNode|null|undefined) :n is RectangleNode;
/** Checks if node is of type Rectangle */
function isRect(n :BaseNode|null|undefined) :n is RectangleNode;
/** Checks if node is of type Line */
function isLine(n :BaseNode|null|undefined): n is LineNode;
/** Checks if node is of type Ellipse */
function isEllipse(n :BaseNode|null|undefined): n is EllipseNode;
/** Checks if node is of type Polygon */
function isPolygon(n :BaseNode|null|undefined): n is PolygonNode;
/** Checks if node is of type Star */
function isStar(n :BaseNode|null|undefined): n is StarNode;
/** Checks if node is of type Vector */
function isVector(n :BaseNode|null|undefined): n is VectorNode;
/** Checks if node is of type Text */
function isText(n :BaseNode|null|undefined): n is TextNode;
/** Checks if node is of type BooleanOperation */
function isBooleanOperation(n :BaseNode|null|undefined): n is BooleanOperationNode;
/** Checks if node is of type Frame */
function isFrame(n :BaseNode|null|undefined): n is FrameNode;
/** Checks if node is of type Group */
function isGroup(n :BaseNode|null|undefined): n is GroupNode;
/** Checks if node is of type Component */
function isComponent(n :BaseNode|null|undefined): n is ComponentNode;
/** Checks if node is of type Component */
function isInstance(n :BaseNode|null|undefined): n is InstanceNode;
/** Checks if node is of type Slice */
function isSlice(n :BaseNode|null|undefined): n is SliceNode;
/** Checks if node is a type of SceneNode */
function isSceneNode(n :BaseNode|null|undefined): n is SceneNode;
/** Checks if node is a type with children */
function isContainerNode(n :BaseNode|null|undefined): n is ContainerNode;
/** Checks if node is a Shape */
function isShape(n :BaseNode|null|undefined): n is Shape;

/**
 * Returns true if n is a shape with at least one visible image.
 * If a layer has an "image" icon in Figma, this returns true.
 */
function isImage<N extends Shape>(n :N) :n is N & { fills :ReadonlyArray<Paint> }; // fills not mixed
function isImage(n :BaseNode) :n is Shape & { fills :ReadonlyArray<Paint> }; // fills not mixed

// Type guards, paints
//
/** Checks if paint is an image */
function isImage(p :Paint|null|undefined) :p is ImagePaint;
/** Checks if paint is a gradient */
function isGradient(p :Paint|null|undefined) :p is GradientPaint;
/** Checks if paint is a solid color */
function isSolidPaint(p :Paint|null|undefined) :p is SolidPaint;

// Type guards, styles
//
/** Checks if style is a paint style */
function isPaintStyle(s :BaseStyle|null|undefined) :s is PaintStyle;
/** Checks if style is a text style */
function isTextStyle(s :BaseStyle|null|undefined) :s is TextStyle;
/** Checks if style is a effect style */
function isEffectStyle(s :BaseStyle|null|undefined) :s is EffectStyle;
/** Checks if style is a grid style */
function isGridStyle(s :BaseStyle|null|undefined) :s is GridStyle;

interface Color extends RGB { // compatible with RGB interface
  readonly r: number
  readonly g: number
  readonly b: number
  withAlpha(a :number) :ColorWithAlpha
  readonly paint :SolidPaint
}
interface ColorWithAlpha extends Color, RGBA { // compatible with RGBA interface
  readonly a: number
  withoutAlpha() :Color
}

/** Create a color with alpha channel. Values should be in range [0-1]. */
function Color(r :number, g: number, b :number, a :number) :ColorWithAlpha;

/** Create a color. Values should be in range [0-1]. */
function Color(r :number, g: number, b :number) :Color;

/**
 * Create a color from hexadecimal string.
 * hexstr should be in the format "RRGGBB", "RGB" or "HH" for greyscale.
 * Examples: C800A1, C0A, CC
 */
function Color(hexstr :string) :Color;

/** Create a color. Values should be in range [0-1]. */
function RGB(r :number, g: number, b :number) :Color;

/** Create a color with alpha channel. Values should be in range [0-1]. */
function RGBA(r :number, g: number, b :number, a? :number) :ColorWithAlpha;

// common colors
/** #000000 Color(0   , 0   , 0)   */ const BLACK   :Color;
/** #FFFFFF Color(1   , 1   , 1)   */ const WHITE   :Color;
/** #808080 Color(0.5 , 0.5 , 0.5) */ const GREY    :Color;
/** #808080 Color(0.5 , 0.5 , 0.5) */ const GRAY    :Color;
/** #FF0000 Color(1   , 0   , 0)   */ const RED     :Color;
/** #00FF00 Color(0   , 1   , 0)   */ const GREEN   :Color;
/** #0000FF Color(0   , 0   , 1)   */ const BLUE    :Color;
/** #00FFFF Color(0   , 1   , 1)   */ const CYAN    :Color;
/** #FF00FF Color(1   , 0   , 1)   */ const MAGENTA :Color;
/** #FFFF00 Color(1   , 1   , 0)   */ const YELLOW  :Color;
/** #FF8000 Color(1   , 0.5 , 0)   */ const ORANGE  :Color;


// ------------------------------------------------------------------------------------
// find & visit


/** Returns the first node encountered in scope which the predicate returns */
function findOne<R extends SceneNode>(scope :BaseNode, p :(n :PageNode|SceneNode) => R|false) :R|null
/** Returns the first node encountered in scope for which predicate returns a truthy value for */
function findOne(scope :DocumentNode, p :(n :PageNode|SceneNode) => boolean|undefined) :PageNode|SceneNode|null
/** Returns the first node encountered in scope for which predicate returns a truthy value for */
function findOne(scope :PageNode|SceneNode, p :(n :SceneNode) => boolean|undefined) :SceneNode|null

/** Returns the first node on the current page which the predicate returns */
function findOne<R extends SceneNode>(p :(n :SceneNode) => R|false) :R|null
/** Returns the first node on the current page for which predicate returns a truthy value for */
function findOne(p :(n :SceneNode) => boolean|undefined) :SceneNode|null


/**
 * find traverses the tree represented by node and
 * returns a list of all nodes for which predicate returns true.
 *
 * The predicate is not called for `node` when its a single node,
 * but when `node` is an array, predicate is called for each item in `node`.
 */
function find<R extends BaseNode>(
  node :ContainerNode|ReadonlyArray<BaseNode>,
  predicate :(n :BaseNode) => R|false,
  options? :FindOptions,
) :Promise<R[]>

function find(
  node :ContainerNode|ReadonlyArray<BaseNode>,
  predicate :(n :BaseNode) => boolean|undefined,
  options? :FindOptions,
) :Promise<BaseNode[]>

/**
 * find traverses the current page and
 * returns a list of all nodes for which predicate returns true.
 *
 * The predicate is not called for `node` when its a single node,
 * but when `node` is an array, predicate is called for each item in `node`.
 */
function find<R extends BaseNode>(
  predicate :(n :BaseNode) => R|false,
  options? :FindOptions,
) :Promise<R[]>

function find(
  predicate :(n :BaseNode) => boolean|undefined,
  options? :FindOptions,
) :Promise<BaseNode[]>


/**
 * visit traverses the tree represented by node, calling visitor for each node.
 *
 * If the visitor returns false for a node with children, that
 * node's children will not be visited. This allows efficient searching
 * where you know that you can skip certain branches.
 *
 * Note: visitor is not called for the initial `node` argument.
 */
function visit(
  node :ContainerNode|ReadonlyArray<ContainerNode>,
  visitor :(n :BaseNode) => any,
) :Promise<void>;


/** Options to find() */
interface FindOptions {
  includeHidden? :boolean  // include hidden layers
}

/**
 * Returns a sequence of numbers in the range [start–end),
 * incrementing in steps or 1 if steps is not provided.
 *
 * Note that the last value may be smaller than end, depending on the value of step.
 */
function range(start :number, end :number, step? :number) :LazySeq<number,number,number>

/** Returns a sequence of numbers in the range [0–end) */
function range(end :number) :LazySeq<number,number,number>

/** Sequence which values are computed lazily; as requested */
interface LazySeq<T, OffsT = T|undefined, LenT = number|undefined> extends Iterable<T> {
  readonly length :LenT  // Infinity if unbounded
  map<R>(f :(value :T, index :number)=>R) :R[]
  array() :T[]
  at(index :number) :OffsT
  join(glue :string) :string
}


// ------------------------------------------------------------------------------------
namespace scripter {

  /** Visualize print() results inline in editor. Defaults to true */
  var visualizePrint :bool

  /** Close scripter, optionally showing a message (e.g. reason, status, etc) */
  function close(message? :string) :void

  /** Register a function to be called when the script ends */
  function addEndCallback(f :Function) :void

  /** Unregister a function to be called when the script ends */
  function removeEndCallback(f :Function) :void

  /** A function to be called when the script ends */
  var onend :()=>void
}


// ------------------------------------------------------------------------------------
namespace libui {

  /** Presents a short ambient message to the user, at the bottom of the screen */
  function notify(message: string, options?: NotificationOptions): NotificationHandler

  /**
   * Shows a range slider inline with the code.
   *
   * Yields values as the user interacts with the slider. Iteration ends when the user
   * either closes the UI control or stops the script.
   */
  function rangeInput(init? :UIRangeInit) :UIInputIterator<number>

  /** Initial options for rangeInput */
  interface UIRangeInit {
    value? :number
    min?   :number
    max?   :number
    step?  :number
  }
}


interface UIInputIterator<T> extends AsyncIterable<T> {
  [Symbol.asyncIterator](): AsyncIterator<T,T>;
}


// ------------------------------------------------------------------------------------
namespace libgeometry {
  class Rect {
    x      :number
    y      :number
    width  :number
    height :number

    constructor(x :number, y :number, width :number, height :number)

    position() :Vec
    containsPoint(v :Vec) :boolean
    translate(v :Vec) :Rect
  }

  class Vec implements Vector {
    x :number
    y :number

    constructor(x :number, y :number)
    constructor(v :Vector)

    isInside(r :Rect) :bool
    distanceTo(v :Vec) :number
    sub(v :Vec|number) :Vec
    add(v :Vec|number) :Vec
    mul(v :Vec|number) :Vec
    div(v :Vec|number) :Vec
  }

}


// ------------------------------------------------------------------------------------
namespace libvars {
  interface Var<T> {
    value :T
    showSlider(init? :libui.UIRangeInit) :Promise<number>
  }

  class VarBindings {
    /** coalesceDuration: group changes happening within milliseconds into one update */
    constructor(coalesceDuration? :number)

    /** Add a variable */
    addVar<T>(value :T) :Var<T>

    /** Add multiple variables */
    addVars<T>(count :number, value :T) :Var<T>[]

    /** Remove a variable */
    removeVar(v :Var<any>) :void

    /** Remove all variables */
    removeAllVars() :void

    /** Read updates. Ends when all vars are removed. */
    updates() :AsyncIterableIterator<void>
  }
}


// ------------------------------------------------------------------------------------
namespace Base64 {
  /** Encode data as base-64 */
  function encode(data :Uint8Array|ArrayBuffer|string) :string

  /** Decode base-64 encoded data */
  function decode(encoded :string) :Uint8Array
}


// ------------------------------------------------------------------------------------
// Patch TS env since Monaco doesn't seem to work with "libs" in TS compiler settigs.

// lib.es2018 async iterator
interface SymbolConstructor {
  readonly asyncIterator: symbol;
}
interface AsyncIterator<T, TReturn = any, TNext = undefined> {
  next(...args: [] | [TNext | PromiseLike<TNext>]): Promise<IteratorResult<T, TReturn>>;
  return?(value?: TReturn | PromiseLike<TReturn>): Promise<IteratorResult<T, TReturn>>;
  throw?(e?: any): Promise<IteratorResult<T, TReturn>>;
}
interface AsyncIterable<T> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
}
interface AsyncIterableIterator<T> extends AsyncIterator<T> {
  [Symbol.asyncIterator](): AsyncIterableIterator<T>;
}






}
