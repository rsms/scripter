// interface RunQItem {
//   clearWithStatus(state :"ok"|"error")
// }

// export function push() :RunQItem {
//   let runqEl = document.querySelector("#toolbar .runqueue") as HTMLElement
//   let e = document.createElement("div")
//   e.className = "pending"
//   runqEl.appendChild(e)
//   let makeVisible = () => { e.classList.add("visible") }
//   // only show the [clock] icon when the run takes longer than 60ms
//   let visibleTimer = setTimeout(makeVisible, 60)
//   return {
//     clearWithStatus: (state :"ok"|"error") => {
//       clearTimeout(visibleTimer)
//       if (state == "ok") {
//         e.className = "ok"
//       } else {
//         e.className = "err"
//       }
//       makeVisible()
//       setTimeout(() => {
//         e.classList.add("hide")
//         setTimeout(() => { runqEl.removeChild(e) }, 250)
//       }, 500)
//     }
//   }
// }
