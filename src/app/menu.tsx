import React, { useState, useRef, useEffect } from "react"
import ReactDOM from "react-dom"
import { Script } from "./script"
import { db } from "./data"
import { scriptsData } from "./script-data"
import { editor } from "./editor"
import { EventEmitter } from "./event"
import { config } from "./config"

const print = console.log.bind(console)


interface MenuEvents {
  "visibility": boolean
}

class Menu extends EventEmitter<MenuEvents> {
  readonly isVisible = false

  _uiel = document.getElementById('menu')

  toggle() {
    ;(this as any).isVisible = this._uiel.classList.toggle("visible", !this.isVisible)
    document.body.classList.toggle("menuVisible", this.isVisible)
    if (this.isVisible) {
      ReactDOM.render(<MenuUI />, this._uiel)
    } else if (editor.editor) {
      editor.editor.focus()
    }
    this.triggerEvent("visibility", this.isVisible)
    if (editor.editor) {
      editor.editor.layout()
    }
    config.menuVisible = this.isVisible
  }

  init() {
    if (config.menuVisible) {
      this.toggle()
    }
  }

  // readonly ui :MenuUI|null = null
  // _setUI(ui :MenuUI|null) {
  //   (this as any).ui = ui
  // }
}


export const menu = new Menu()


interface MenuProps {}
interface MenuState {
  scripts :Script[]
  exampleScripts :Script[]
  currentScriptId :number
}

export class MenuUI extends React.Component<MenuProps,MenuState> {

  constructor(props :MenuProps) {
    super(props)
    this.state = {
      scripts: scriptsData.scripts,
      exampleScripts: scriptsData.exampleScripts,
      currentScriptId: editor.currentScriptId,
    }
  }

  onNewScript = () => {
    editor.newScript({ name: scriptsData.nextNewScriptName() })
  }

  scriptsDataChangeCallback = () => {
    this.setState({
      scripts: scriptsData.scripts,
      currentScriptId: editor.currentScriptId,
    })
  }

  onEditorModelChange = () => {
    this.setState({ currentScriptId: editor.currentScriptId })
  }

  componentDidMount() {
    // menu._setUI(this)
    scriptsData.on("change", this.scriptsDataChangeCallback)
    editor.on("modelchange", this.onEditorModelChange)
  }

  componentWillUnmount() {
    scriptsData.removeListener("change", this.scriptsDataChangeCallback)
    editor.removeListener("modelchange", this.onEditorModelChange)
    // menu._setUI(null)
  }

  render() {
    let currentScriptId = this.state.currentScriptId
    return (
    <div>
      <div className="section">
        <div className="button new" title="New script" onClick={this.onNewScript}></div>
      </div>
      <ul className="script-list">
      {this.state.scripts.map(s =>
        <MenuItem key={s.id} script={s} isActive={currentScriptId == s.id} /> )}
      </ul>
      <h3>Examples</h3>
      <ul className="script-list">
      {this.state.exampleScripts.map(s =>
        <MenuItem key={s.id} script={s} isActive={currentScriptId == s.id} /> )}
      </ul>
    </div>
    )
  }
}


interface MenuItemProps {
  script :Script
  isActive :boolean
}

function MenuItem(props :MenuItemProps) :JSX.Element {
  let s = props.script

  const [isEditing, setIsEditing] = useState(false)

  let attrs :{[k:string]:any} = {
    className: (
      (props.isActive ? "active" : "") +
      (s.id == 0 ? " unsaved" : "")
    ),
  }

  if (!isEditing) {
    function onClick() {
      editor.openScript(s.id)
    }
    function onDoubleClick() {
      setIsEditing(true)
    }
    attrs.onClick = onClick
    attrs.onDoubleClick = onDoubleClick
    attrs.title = `Last modified ${s.modifiedAt.toLocaleString()}`
  }

  function commitEditing(newName :string) :void {
    newName = newName.trim()
    if (newName.length == 0) {
      if (s.id > 0 && confirm(`Delete script "${s.name}"?`)) {
        let otherScriptToOpen = scriptsData.scriptAfterOrBefore(s.id)
        if (!otherScriptToOpen) {
          // deleted last script -- we must always have one script, so make a new one
          editor.newScript()
        } else {
          editor.openScript(otherScriptToOpen.id)
        }
        s.delete()
      }
    } else {
      // Note: Scripts which are unsaved are only created when the body is non-empty.
      // This means that if we create a new script, which starts out empty, and then
      // rename it, the name is saved only in memory and the script is not persisted
      // until some edit is done to the body.
      s.name = newName
    }
    setIsEditing(false)
  }
  function cancelEditing() :void {
    setIsEditing(false)
  }

  let valueProps :MenuItemValueProps = {
    name: s.name,
    isEditing,
    commitEditing,
    cancelEditing,
  }

  let buttons :JSX.Element[] = []

  if (!isEditing) {
    async function onClickPlayButton(ev :React.MouseEvent<HTMLDivElement>) {
      ev.preventDefault()
      ev.stopPropagation()
      await editor.openScript(s.id)
      editor.runCurrentScript()
    }
    buttons = [
      // U+2009 THIN SPACE offsets U+25B6 BLACK RIGHT-POINTING TRIANGLE
      <MenuItemButton key="play"
                      title={"\u2009▶"}
                      tooltip={props.isActive ? "Run script" : "Open & Run script"}
                      onClick={onClickPlayButton} />
    ]
  }

  return (
    <li {...attrs}>
      <MenuItemValue {...valueProps} />
      {buttons}
    </li>
  )
}


interface MenuItemButtonProps {
  title    :string
  tooltip? :string
  onClick  :(e:React.MouseEvent<HTMLDivElement>)=>void
}

function MenuItemButton(props :MenuItemButtonProps) :JSX.Element {
  return <div className="button" onClick={props.onClick} title={props.tooltip}>{props.title}</div>
}



interface MenuItemValueProps {
  name        :string
  isEditing   :boolean
  commitEditing(newName :string) :void
  cancelEditing() :void
}

function MenuItemValue(props :MenuItemValueProps) :JSX.Element {
  const [editName, setEditName] = useState(props.name)
  const [needsSelectAll, setNeedsSelectAll] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!props.isEditing) {
      // reset edit-state values when not editing
      if (editName !== props.name) { setEditName(props.name) }
      if (!needsSelectAll) { setNeedsSelectAll(true) }
      return
    }
    if (needsSelectAll && inputRef.current) {
      inputRef.current.select()
      setNeedsSelectAll(false)
    }
  })

  if (!props.isEditing) {
    return <span className="name">{props.name}</span>
  }

  function onChange(ev) {
    setEditName(ev.target.value)
  }

  function onKeyDown(ev) {
    if (ev.key == "Enter") {
      props.commitEditing(editName)
    } else if (ev.key == "Escape") {
      props.cancelEditing()
    }
  }

  function onBlur() {
    props.commitEditing(editName)
  }

  return <input type="text" autoFocus
    {...{value: editName, ref: inputRef, onChange, onBlur, onKeyDown }} />
}
