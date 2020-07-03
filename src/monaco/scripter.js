// copied to ./monaco-editor/esm/vs/editor/scripter.js by misc/update-monaco.sh
import { StaticServices } from './standalone/browser/standaloneServices'
import {
  SimpleEditorModelResolverService,
  SimpleUriLabelService,
} from './standalone/browser/simpleServices'


function patchEditorService(openCodeEditor) {
  const codeEditorService = StaticServices.codeEditorService.get();
  codeEditorService.openCodeEditor = openCodeEditor
}


function patchEditorModelResolverService(findModel) {
  // https://github.com/Microsoft/monaco-editor/issues/779#issuecomment-374258435
  SimpleEditorModelResolverService.prototype.findModel = findModel
}


let _basenameOrAuthority = null
function patchBasenameOrAuthority(basenameOrAuthority) {
  _basenameOrAuthority = basenameOrAuthority
}
export function basenameOrAuthority(resource) {
  if (_basenameOrAuthority) {
    return _basenameOrAuthority(resource)
  }
}
export function getBaseLabel(resource) {
  return basenameOrAuthority(resource)
}


function patchUriLabelService(getUriLabel) {
  // returns a label for a resource.
  // Shows up as a tool tip and small text next to the filename
  SimpleUriLabelService.prototype.getUriLabel = getUriLabel
}


window.__scripterMonaco = {
  patchEditorService,
  patchEditorModelResolverService,
  patchUriLabelService,
  patchBasenameOrAuthority,
}
