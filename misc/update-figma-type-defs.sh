#!/bin/bash -e
cd "$(dirname "$0")/.."

URL=https://unpkg.com/@figma/plugin-typings/index.d.ts
echo "fetch $URL"
curl --location -# -o src/figma-plugin/figma.d.ts "$URL"
cp src/figma-plugin/figma.d.ts src/app/figma.d.ts
echo "wrote src/figma-plugin/figma.d.ts"
echo "wrote src/app/figma.d.ts"
