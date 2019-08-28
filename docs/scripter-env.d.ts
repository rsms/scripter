/** Outputs a message to the console */
declare function print(...args :any[]) :void

/** Throws an error if condition is not thruthy */
declare function assert(condition :any, ...message :any[]) :void

/** Current selection in Figma */
declare let selection: ReadonlyArray<SceneNode>
