export const print = console.log.bind(console)

export const isMac = navigator.platform.indexOf("Mac") != -1

export const dlog :(...v:any[])=>void = (DEBUG ?
  function dlog(...v:any[]) {
    v.unshift("[dlog]")
    console.log.apply(console, v)
  } :
  function(){}
) as (...v:any[])=>void
