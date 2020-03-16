import * as M from "../common/messages"


let _isDeveloperVM :bool|undefined = undefined


function isDeveloperVM() {
  if (_isDeveloperVM === undefined) {
    // detect Developer VM
    try {
      throw new Error("")
      _isDeveloperVM = false
    } catch (e) {
      let s = e.stack || ""
      _isDeveloperVM = s.charCodeAt(0) != 0x20 && !/^\s+at\s\w/.test(s)
    }
    // Dev VM stack:
    // Error\n
    //    at isDeveloperVM (PLUGIN_44_SOURCE:2817:19)\n
    //    at eval (PLUGIN_44_SOURCE:2856:1)\n
    //    at Proxy.eval (PLUGIN_44_SOURCE:4260:3)\n
    //    at Object.eval (eval at createScopedEvaluatorFactory ...
    //    ...

    // fig-js VM stack:
    //    at isDeveloperVM (PLUGIN_65_SOURCE:2819)\n
    //    at <anonymous> (PLUGIN_65_SOURCE:2845)\n
    //    at <anonymous> (PLUGIN_65_SOURCE:4249)\n
    //    at call (native)\n
    //    at <eval> (PLUGIN_65_SOURCE:4255)\n
  }
  return _isDeveloperVM
}


function getStackFrames(stack :string) :string[] {
  let frames = stack.split("\n")
  if (isDeveloperVM()) {
    // dev vm includes message in stack. Drop frames which do not start with "   at "
    let re = /^\s+at\s/
    let i = 0
    for (; i < frames.length && !re.test(frames[i]); i++) {
    }
    frames = frames.slice(i)
  }
  return frames
}


export function getUserStackFrames(stack :string) :string[] {
  let frames = getStackFrames(stack)
  let mainFrameIdx = indexOfScriptMainStackFrame(frames)
  if (mainFrameIdx != -1) {
    frames = frames.slice(0, mainFrameIdx + 1)
  }
  return frames
}


function captureStackTrace() :string[] {
  let e; try { throw new Error() } catch(err) { e = err }  // fig-js workaround
  let frames = getStackFrames(e.stack)
  return frames.slice(1) // drop first frame which is the call to this function
}


function sourcePosFromStackFrame(frame :string) :M.SourcePos {
  // Note: fig-js stack traces does not include source column information, so we
  // optionally parse the column if present.

  // Example of Developer VM stack frame:
  //
  //   at __scripter_script_main (eval at <anonymous> \
  //   (eval at createScopedEvaluatorFactory \
  //   (blob:https://www.figma.com/aed74adc-447b-4242-a05a-b7f8ae094443:1:6906)), \
  //   <anonymous>:5:24)
  //

  let m = frame.match(/\:(\d+)(:?\:(\d+)|)\)$/)
  if (!m || /\s\(PLUGIN_/.test(frame)) {
    // Note: untrackable frames look like this
    //    at new Promise (<anonymous>)
    // And they can also look like this with garbage line & col:
    //    at eval (PLUGIN_57_SOURCE:1124:193)
    return { line: 0, column: 0 }
  }

  let line = parseInt(m[1])
  let column = parseInt(m[3])
  return {
    line: isNaN(line) ? 0 : line,
    column: isNaN(column) ? 0 : column,
  }
}


function indexOfScriptMainStackFrame(frames :string[]) :number {
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].indexOf("__scripter_script_main ") != -1) {
      return i
      break
    }
  }
  // uh, no. fig-js does not contain source information for lambdas.
  // As a last resort, walk backwards and pick first frame that looks like
  // it comes from the plugin.
  for (let i = frames.length; i > 1; ) {
    if (frames[--i].indexOf("<input>:") != -1) {
      return i
    }
  }
  return -1
}


// getFirstSourcePos finds SourcePos for call on current stack, relative to the leaf caller.
// stackOffset can be provided to pick a frame further up the call stack.
//
// This function returns the first location that is known, starting at the outermost
// (callee of this function) frame.
//
export function getFirstSourcePos(stackOffset :number = 0) :M.SourcePos {
  let frames = captureStackTrace()
  let pos :M.SourcePos = {line:0, column:0}
  let mainFrameIdx = indexOfScriptMainStackFrame(frames)
  let frameidx = 1 + stackOffset // offset by 1 to exclude this function
  while (pos.line == 0 && frameidx <= mainFrameIdx) {
    pos = sourcePosFromStackFrame(frames[frameidx] || "")
    frameidx++
  }
  return pos
}


export function getFirstSourcePosInStackFrames(
  frames :string[],
  stackOffset :number = 0,
) :M.SourcePos {
  let pos :M.SourcePos = {line:0, column:0}
  for (let i = stackOffset; i < frames.length && pos.line == 0; i++) {
    pos = sourcePosFromStackFrame(frames[i])
  }
  return pos
}


// getTopLevelSourcePos finds SourcePos for call on current, relative to top-level frame
// of the script. stackOffset can be provided to pick a frame further down the call stack.
//
// Example 1:
//
//   1  function foo() {
//   2    print(getTopLevelSourcePos())
//   3  }
//   4  function bar() {
//   5    foo()
//   6  }
//   7  bar()
//
// Output:
//   { line: 7, column: 1 }  // position of bar()
//
// ----------------------------------
// Example 2:
//
//   1  function foo() {
//   2    print(getTopLevelSourcePos(1))  // offset = 1
//   3  }
//   4  function bar() {
//   5    foo()
//   6  }
//   7  bar()
//
// Output:
//   { line: 5, column: 3 }  // position of foo()
//
export function getTopLevelSourcePos(stackOffset :number = 0) :M.SourcePos {
  let e; try { throw new Error() } catch(err) { e = err }  // workaround for fig-js bug
  let frames = e.stack.split("\n")
  let frameidx = indexOfScriptMainStackFrame(frames)
  frameidx -= stackOffset
  return sourcePosFromStackFrame(frames[frameidx] || "")
}
