//
// The Scripter environment.
//
// What's declared in there is available to scripts in their global namespace.
//

// symbolic type aliases
type int   = number
type float = number
type byte  = number
type bool  = boolean

/** Outputs a message to the console */
declare function print(...args :any[]) :void

/** Throws an error if condition is not thruthy */
declare function assert(condition :any, ...message :any[]) :void

/** Close scripter, optionally showing a message (e.g. reason, status, etc) */
declare function closeScripter(message? :string) :void

// timer functions
declare function clearInterval(id?: number): void;
declare function clearTimeout(id?: number): void;
declare function setInterval(handler: string|Function, timeout?: number, ...arguments: any[]): number;
declare function setTimeout(handler: string|Function, timeout?: number, ...arguments: any[]): number;

interface Timer extends Promise<void> {
  cancel() :void
  catch(onrejected?: ((reason: any) => any|PromiseLike<any>)|undefined|null): Timer;
}
/** Start a timer that expires after `duration` milliseconds */
declare function timer(duration :number, handler? :(canceled?:boolean)=>any) :Timer

// Figma

/** Get and optionally set current selection in Figma */
declare function sel(newsel? :ReadonlyArray<SceneNode>|null): ReadonlyArray<SceneNode>;

/** Version of Figma plugin API that is currently in use */
declare const apiVersion: string

/** Current document in Figma */
declare const root: DocumentNode

/** Viewport */
declare const viewport: ViewportAPI

/** The "MIXED" symbol, signifying mixed properties */
declare const mixed: symbol

declare const clientStorage: ClientStorageAPI
declare const currentPage: PageNode

/** Create a new group from nodes. Parent defaults to current page's canvas. */
declare function group(nodes: ReadonlyArray<BaseNode>, parent?: null|(BaseNode&ChildrenMixin), index?: number): FrameNode;

// Node constructors.
// Essentially figma.createNodeType + optional assignment of props
/** Creates a new Rectangle node */        declare function Rectangle(props? :Partial<RectangleNode>) :RectangleNode;
/** Creates a new Rectangle node */        declare function Rect(props? :Partial<RectangleNode>) :RectangleNode;
/** Creates a new Line node */             declare function Line(props? :Partial<LineNode>): LineNode;
/** Creates a new Ellipse node */          declare function Ellipse(props? :Partial<EllipseNode>): EllipseNode;
/** Creates a new Polygon node */          declare function Polygon(props? :Partial<PolygonNode>): PolygonNode;
/** Creates a new Star node */             declare function Star(props? :Partial<StarNode>): StarNode;
/** Creates a new Vector node */           declare function Vector(props? :Partial<VectorNode>): VectorNode;
/** Creates a new Text node */             declare function Text(props? :Partial<TextNode>): TextNode;
/** Creates a new BooleanOperation node */ declare function BooleanOperation(props? :Partial<BooleanOperationNode>): BooleanOperationNode;
/** Creates a new Frame node */            declare function Frame(props? :Partial<FrameNode>): FrameNode;
/** Creates a new Component node */        declare function Component(props? :Partial<ComponentNode>): ComponentNode;
/** Creates a new Page node */             declare function Page(props? :Partial<PageNode>): PageNode;
/** Creates a new Slice node */            declare function Slice(props? :Partial<SliceNode>): SliceNode;
/** Creates a new PaintStyle */            declare function PaintStyle(props? :Partial<PaintStyle>): PaintStyle;
/** Creates a new TextStyle */             declare function TextStyle(props? :Partial<TextStyle>): TextStyle;
/** Creates a new EffectStyle */           declare function EffectStyle(props? :Partial<EffectStyle>): EffectStyle;
/** Creates a new GridStyle */             declare function GridStyle(props? :Partial<GridStyle>): GridStyle;


/** Create a color. Values should be in range [0-1]. */
declare function RGB(r :number, g: number, b :number) :RGB

// common colors
declare const BLACK   :RGB
declare const GREY    :RGB
declare const GRAY    :RGB
declare const WHITE   :RGB
declare const RED     :RGB
declare const GREEN   :RGB
declare const BLUE    :RGB
declare const CYAN    :RGB
declare const MAGENTA :RGB
declare const YELLOW  :RGB
declare const ORANGE  :RGB

// common paints
declare const Paint : {
  Black   :SolidPaint,
  Grey    :SolidPaint,
  Gray    :SolidPaint,
  White   :SolidPaint,
  Red     :SolidPaint,
  Green   :SolidPaint,
  Blue    :SolidPaint,
  Cyan    :SolidPaint,
  Magenta :SolidPaint,
  Yellow  :SolidPaint,
  Orange  :SolidPaint,
}
