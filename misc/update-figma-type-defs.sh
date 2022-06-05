#!/bin/bash -e
cd "$(dirname "$0")/.."

mkdir -p build

URL=https://unpkg.com/@figma/plugin-typings/index.d.ts
echo "fetch $URL"
curl --location -# -o build/tmp-figma-index.d.ts "$URL"

URL=https://unpkg.com/@figma/plugin-typings/plugin-api.d.ts
echo "fetch $URL"
curl --location -# -o build/tmp-figma-plugin-api.d.ts "$URL"

OUT=src/figma-plugin/figma.d.ts
head -n 1 build/tmp-figma-index.d.ts > $OUT
echo "declare global {" >> $OUT
cat build/tmp-figma-plugin-api.d.ts >> $OUT
echo "}" >> $OUT
tail -n +3 build/tmp-figma-index.d.ts >> $OUT

rm build/tmp-figma-*.d.ts

cp $OUT src/app/figma.d.ts

echo "wrote src/figma-plugin/figma.d.ts"
echo "wrote src/app/figma.d.ts"
