import * as monaco from "../monaco/monaco"

// see:
// microsoft.github.io/monaco-editor/playground.html#customizing-the-appearence-exposed-colors

monaco.editor.defineTheme('scripter-light', {
  base: 'vs',
  inherit: true,
  // rules: [],
  rules: [
    { token: "comment", foreground: "#999999" }, // fontStyle: "italic"
    { token: "keyword", foreground: "#010101" }, // weight defined in css
    { token: "identifier", foreground: "#111111" },
    { token: "type.identifier", foreground: "#DB2386" }, // #003388 #323EAB #6f42c1
    { token: "number", foreground: "#005cc5" }, // #660099 #003388
    { token: "string", foreground: "#032f62" }, // #032f62 #116622
    { token: "delimiter", foreground: "#555555" }, // #554433
    // { token: "delimiter.bracket", foreground: "#333333" },
  ],
  colors: {
    'editor.foreground': '#222222',
    'editor.background': '#ffffff',  // #fefefa
    'editorCursor.foreground': '#000000', // #004499
    'editorLineNumber.foreground': '#d9d9d9',
    // 'editor.lineHighlightBackground': '#0000FF20',
    // 'editorLineNumber.foreground': '#008800',
    // 'editor.inactiveSelectionBackground': '#88000015'

    'editorIndentGuide.background': "#f8f8f8",

    // 'widget.shadow': '#00000011', // Shadow color of widgets such as find/replace inside the editor.
    // 'editorWidget.background': "#fffadd", // Background color of editor widgets, such as find/replace.
    // 'editorWidget.border': "#fffadd", // Border color of editor widgets. The color is only used if the widget chooses to have a border and if the color is not overridden by a widget.

    'editorBracketMatch.background': "#ccffdf", // #fffd66 Background color behind matching brackets
    'editorBracketMatch.border': "#00000000", // Color for matching brackets boxes

    'editorError.foreground': "#ff4499", // Foreground color of error squigglies in the editor.
    // 'editorError.border': "#000000", // Border color of error squigglies in the editor.
    // 'editorWarning.foreground': "#ff0000", // Foreground color of warning squigglies in the editor.
    // 'editorWarning.border' // Border color of warning squigglies in the editor.

    // 'editor.selectionBackground' // Color of the editor selection.
    // 'editor.selectionForeground' // Color of the selected text for high contrast.
    // 'editor.inactiveSelectionBackground' // Color of the selection in an inactive editor.
    // 'editor.selectionHighlightBackground' // Color for regions with the same content as the selection.
    // 'editor.findMatchBackground' // Color of the current search match.
    // 'editor.findMatchHighlightBackground' // Color of the other search matches.
    // 'editor.findRangeHighlightBackground' // Color the range limiting the search.
    // 'editor.hoverHighlightBackground' // Highlight below the word for which a hover is shown.

    // 'editor.selectionBackground': "#ff9999", // Color of the editor selection.
    // 'editor.selectionForeground': "#000000", // Color of the selected text for high contrast.
    // 'editor.selectionHighlightBackground': "#ffffee", // Color for regions with the same content as the selection.

    // 'editor.findMatchBackground' // Color of the current search match.
    // 'editor.findMatchHighlightBackground' // Color of the other search matches.
    // 'editor.findRangeHighlightBackground' // Color the range limiting the search.
    'editor.hoverHighlightBackground': "#fffddd", // Highlight below the word for which a hover is shown.
    'editorHoverWidget.background': "#fffadd",
    'editorHoverWidget.border': "#F0E5A7",
  }
})

// monaco.editor.setTheme('scripterLight')
