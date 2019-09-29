
export function show(message :string) {
  let messageEl = document.querySelector("#message") as HTMLElement
  ;(messageEl.querySelector(".close-button") as HTMLElement).onclick = hide
  let el = messageEl.querySelector(".message > p") as HTMLElement
  el.innerText = message
  document.body.classList.add("showMessage")
}


export function hide() {
  document.body.classList.remove("showMessage")
}
