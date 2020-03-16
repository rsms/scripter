import { ScriptMsg } from "../common/messages"
import { SavedScriptIndex } from "./saved-scripts"
import * as consts from "./constants"

const font = { family: "Inter", style: "Medium" }

let scriptComponent :ComponentNode|null = null


export type ScriptNode = SceneNode & ChildrenMixin


export async function createScriptNode(script :ScriptMsg) :Promise<ScriptNode> {
  // validate script
  if (script.name === undefined) { throw new Error("missing script name") }
  if (script.body === undefined) { throw new Error("missing script body") }

  let fontPromise = figma.loadFontAsync(font)
  let pos = canvasPositionForNewNode()
  await fontPromise

  let f = figma.createFrame()
  f.layoutMode = "HORIZONTAL"
  f.counterAxisSizingMode = "AUTO"
  f.horizontalPadding = 12
  f.verticalPadding = 8
  f.itemSpacing = 8
  f.cornerRadius = 6
  f.cornerSmoothing = 0.4
  f.backgrounds = [{type:"SOLID",color:{r:1,g:1,b:1}}]
  f.name = "Scripter Script"
  f.expanded = false
  f.x = pos.x
  f.y = pos.y
  // Note: We don't set description since that pushes the Figma plugin relaunch sidebar UI too
  // far down most people's screens, rendering the relaunch feature less useful.

  let icon = figma.createNodeFromSvg(iconSvg)
  // icon.appendChild((icon.children[0] as GroupNode).children[0]) // ungroup [icon1]
  icon.name = "Icon"
  // Wrap the icon in a frame in order to simulate negative margin on the left.
  // Alternatively we could wrap the text label and give it an extra 2dp margin on the right,
  // but since we update the text, that would just lead to wasted CPU.
  let iconFrame = figma.createFrame()
  iconFrame.resizeWithoutConstraints(icon.width-2, icon.height)
  iconFrame.appendChild(icon)
  iconFrame.clipsContent = false
  iconFrame.locked = true
  iconFrame.name = "Icon"
  icon.x = -2
  icon.y = 0
  f.appendChild(iconFrame)

  let label = figma.createText()
  label.fontName = font
  label.fontSize = 13
  label.characters = "Script name"
  label.layoutAlign = "MIN"  // MIN = Figma lingo for "start" (alignment in parent)
  label.textAlignVertical = "CENTER"
  label.textAutoResize = "WIDTH_AND_HEIGHT"
  label.locked = true
  label.name = "$name"
  label.letterSpacing = { value: -0.5, unit: "PERCENT" }
  label.lineHeight = { value: 16, unit: "PIXELS" }

  let descr = figma.createText()
  descr.fontName = font
  descr.fontSize = 11
  descr.characters = "Description"
  descr.layoutAlign = "MIN"
  descr.resizeWithoutConstraints(160, 10 /* h is ignored */)
  descr.textAutoResize = "HEIGHT"
  descr.name = "Description"
  descr.opacity = 0.4
  descr.visible = false  // this layer is for the user to enable and use
  descr.letterSpacing = { value: 0.5, unit: "PERCENT" }
  label.lineHeight = { value: 14, unit: "PIXELS" }

  let meta = figma.createFrame()
  meta.name = "Title & optional description"
  meta.layoutMode = "VERTICAL"
  meta.counterAxisSizingMode = "AUTO"
  meta.horizontalPadding = 0
  meta.verticalPadding = 3
  meta.itemSpacing = 4
  meta.layoutAlign = "MIN"
  meta.appendChild(label)
  meta.appendChild(descr)
  f.appendChild(meta)

  // group
  let g = figma.group([f], figma.currentPage, 0)
  g.name = "Scripter Script"
  g.expanded = false

  // set relaunch data and node data. We have to set it twice, once on the group and once on
  // the frame, as figma currently treats groups as a "barrier" for relaunch data.
  g.setRelaunchData({ loadScript: "" })
  f.setRelaunchData({ loadScript: "" })
  f.setSharedPluginData(consts.dataNamespace, consts.dataScriptGUID, script.guid)
  setScriptData(g, script)

  // Workaround for bug in Figma: Containers often do not respect "expanded" when
  // created. We start a timer to set it in the next runloop frame, which seems to be working.
  setTimeout(() => { g.expanded = false }, 0)

  return g
}


function isScriptNode(n :BaseNode) :n is ScriptNode {
  return "children" in n && "visible" in n
}


function canvasPositionForNewNode() :Vector {
  let pos = {
    x: figma.viewport.bounds.x + 20,
    y: figma.viewport.bounds.y + 20,
  }
  // find union bounds of existing script nodes
  let min = { x: Infinity, y:Infinity }
  let max = { x: -Infinity, y:-Infinity }
  for (let guid in SavedScriptIndex.index) {
    let n = figma.getNodeById(SavedScriptIndex.index[guid].nodeId) as SceneNode
    if (n) {
      min.x = Math.min(min.x, n.x)
      min.y = Math.min(min.y, n.y)
      max.x = Math.max(max.x, n.x + n.width)
      max.y = Math.max(max.y, n.y + n.height)
    }
  }
  if (min.x != Infinity) {
    dlog("bounds", { min, max })
    pos.x = min.x
    pos.y = max.y + 24
  }
  return pos
}


function setScriptData(n :ScriptNode, script :ScriptMsg) {
  let dataNode :SceneNode = n
  if (n.type == "GROUP") {
    dataNode = n.children[0]
  } else if (n.type == "FRAME" && n.parent && n.parent.type == "GROUP") {
    n = n.parent
    n.setRelaunchData({ loadScript: "" })  // just in case it was removed by ungroup-group
  }
  if (script.name !== undefined) {
    let name = script.name.trim() || "Untitled"
    n.name = "\u2B12 " + name

    // unless the user has modified the component, the second child is the label
    let nameNode = n.findOne(n => n.name == "$name" && n.type == "TEXT") as TextNode|null
    if (nameNode) {
      nameNode.characters = name
    } else {
      console.warn("failed to fully update script node data: can not find $name layer")
    }

    dataNode.setSharedPluginData(consts.dataNamespace, consts.dataScriptName, name)
  }
  if (script.body !== undefined) {
    dataNode.setSharedPluginData(consts.dataNamespace, consts.dataScriptBody, script.body)
  }
}


export async function updateScriptNode(n :SceneNode, script :ScriptMsg) {
  await figma.loadFontAsync(font)
  if (!isScriptNode(n)) {
    throw new Error("node is not a container")
  }
  setScriptData(n, script)
}


const iconSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"
xmlns="http://www.w3.org/2000/svg">
<rect width="20" height="20" rx="10" fill="#F83E33"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M13.5053 11.278L10.5222
14.2609C10.446 13.9553 10.2903 13.6645 10.052 13.4265L9.63569 13.0104L6.14231
9.51706C5.96144 9.33569 5.8726 9.10222 5.87225 8.86488C5.8726 8.62731 5.96144
8.39372 6.14231 8.21263C6.32366 8.03153 6.55697 7.94281 6.79475 7.94213C7.03203
7.94281 7.26563 8.03153 7.44694 8.21238C7.62785 8.39353 7.71663 8.62713 7.71728
8.86488C7.71663 9.10222 7.62785 9.33597 7.44694 9.51706L8.06369 10.1338L10.8647
7.33284L13.0892 9.55694L13.5053 9.97331C13.6863 10.1544 13.7751 10.3881 13.7754
10.6255C13.7751 10.863 13.6863 11.0965 13.5053 11.278ZM9.4351 15.3479C9.25394
15.5291 9.02003 15.6175 8.78138 15.6183C8.54488 15.6175 8.31156 15.5288 8.13066
15.3479C7.94956 15.1668 7.86075 14.9331 7.86035 14.6957C7.86075 14.4579 7.94956
14.2247 8.13047 14.0435L8.78288 13.391L9.01894 13.6272L9.43531 14.0433C9.61625
14.2247 9.70497 14.4582 9.70541 14.6957C9.70497 14.9331 9.61625 15.1666 9.4351
15.3479ZM10.2131 4.14163C10.3938 3.96144 10.6273 3.87259 10.8648 3.87219C11.1024
3.87259 11.3358 3.96113 11.5171 4.14234C11.698 4.32366 11.7868 4.55725 11.7874
4.79478C11.7868 5.03216 11.698 5.26563 11.5171 5.44694L11.2592 5.70481L8.53569
8.42841C8.45931 8.12303 8.30144 7.83338 8.06344 7.59575C7.82878 7.36075 7.54316
7.20391 7.24213 7.12656L10.2131 4.14163ZM14.122 9.35656L13.7057 8.94025L11.4815
6.71597L12.1338 6.06359C12.4833 5.71438 12.66 5.25263 12.6594 4.79478C12.66
4.33678 12.4833 3.87509 12.1338 3.52563C11.7844 3.17581 11.3224 2.99963 10.8648
3C10.4069 2.99963 9.9451 3.17606 9.59572 3.52581L5.68681 7.4525C5.63081 7.49656
5.57691 7.54447 5.52544 7.59594C5.17603 7.94513 4.99956 8.40716 5
8.86488C4.99956 9.32256 5.17603 9.78441 5.5256 10.1338L8.16613 12.7743L7.51375
13.4265C7.16397 13.7758 6.98769 14.2377 6.98816 14.6957C6.98769 15.1535 7.16419
15.6152 7.51397 15.9648C7.8625 16.3135 8.32363 16.4906 8.78138
16.4903H8.7831C9.24028 16.4903 9.70216 16.3144 10.0518 15.9647L14.122
11.8946C14.4716 11.5452 14.6482 11.0834 14.6475 10.6255C14.6482 10.1677 14.4716
9.70563 14.122 9.35656Z" fill="white"/>
</svg>
`
