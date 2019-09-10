
export function show(message :string) {
  let messageEl = document.querySelector("#message") as HTMLElement
  ;(messageEl.querySelector(".close-button") as HTMLElement).onclick = hide
  let el = messageEl.querySelector(".message > p") as HTMLElement
  el.innerText = message
  document.body.classList.add("showMessage")
  // editor.editor.render(true) // Note: This seems to not be working (overlap at bottom)
}


export function hide() {
  if (document.body.classList.contains("showMessage")) {
    document.body.classList.remove("showMessage")
    // editor.editor.render(true)
  }
}
