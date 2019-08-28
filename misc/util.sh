export PATH=$PWD/node_modules/.bin:$PATH

has_newer() {
  DIR=$1
  REF_FILE=$2
  for f in $(find "$DIR" -type f -newer "$REF_FILE" -print -quit); do
    return 0
  done
  return 1
}

spawn_monaco_build() {
  outdir=$1

  # find monaco build dir
  monaco_build_dir=$outdir/monaco-$(node -p 'require("monaco-editor/package.json").version')

  # build monaco if needed
  if ! [ -d $monaco_build_dir ] || has_newer "src/monaco" "$monaco_build_dir/monaco.js"; then
    echo "building $monaco_build_dir"
    pushd src/monaco >/dev/null
    ( webpack --display=errors-only --mode=production "--output-path=$outdir" && \
      echo "built $monaco_build_dir ok" \
    ) &
    pid=$!
    popd >/dev/null
    return $pid
  fi

  return 0
}
