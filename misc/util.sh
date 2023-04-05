export PATH=$PWD/node_modules/.bin:$PATH
export NODE_OPTIONS=--openssl-legacy-provider

has_newer() {
  DIR=$1
  REF_FILE=$2
  for f in $(find "$DIR" -type f -newer "$REF_FILE" -print -quit); do
    return 0
  done
  return 1
}

monaco_build_basedir="monaco-$(node -p 'require("./src/monaco/monaco-editor/package.json").version')"

print_monaco_build_dir() {
  echo "$1/$monaco_build_basedir"
}

spawn_monaco_build() {
  outdir=$1

  # find monaco build dir
  monaco_build_dir=$(print_monaco_build_dir "$outdir")

  # build monaco if needed
  if ! [ -d "$monaco_build_dir" ] || has_newer "src/monaco" "$monaco_build_dir/monaco.js"; then
    bash misc/build-monaco.sh "$outdir" &
    return $!
  fi

  return 0
}
