import * as M from "../common/messages"

function sourcePosFromStackFrame(frame :string) :M.SourcePos {
  // Note: fig-js stack traces does not include source column information, so we
  // optionally parse the column if present.
  let m = frame.match(/:(\d+)(:?:(\d+)|)\)$/)
  if (!m) {
    return { line: 0, column: 0 }
  }
  let line = parseInt(m[1])
  let column = parseInt(m[2])
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


// // getSourcePos finds SourcePos for call on current stack, relative to the leaf caller.
// // stackOffset can be provided to pick a frame further up the call stack.
// //
// export function getSourcePos(stackOffset :number = 0) :M.SourcePos {
//   let e; try { throw new Error() } catch(err) { e = err }  // workaround for fig-js bug
//   let frames = e.stack.split("\n")
//   return sourcePosFromStackFrame(frames[2 + stackOffset] || "")
// }


// getFirstSourcePos is a speecial version of getSourcePos which returns the first
// location that is known, starting at the outermost (callee of this function) frame.
//
export function getFirstSourcePos(stackOffset :number = 0) :M.SourcePos {
  let e; try { throw new Error() } catch(err) { e = err }  // workaround for fig-js bug
  let frames = e.stack.split("\n")
  let pos :M.SourcePos = {line:0, column:0}
  let mainFrameIdx = indexOfScriptMainStackFrame(frames)
  let frameidx = 2 + stackOffset
  while (pos.line == 0 && frameidx <= mainFrameIdx) {
    pos = sourcePosFromStackFrame(frames[frameidx] || "")
    frameidx++
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
