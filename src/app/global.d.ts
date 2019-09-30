type bool = boolean

interface SourcePos {
  line   :number
  column :number
}

interface ScriptProgram {
  code      :string
  sourceMap :string
}

// defined globally in webpack config
declare const SOURCE_MAP_VERSION :string
declare const BUILD_VERSION :string
declare const DEBUG :bool
