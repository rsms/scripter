#!/bin/bash -e
cd "$(dirname "$0")/.."

URL=https://unpkg.com/@figma/plugin-typings/index.d.ts
echo "fetch $URL"
curl --location -# -o src/figma-plugin/figma.d.ts "$URL"

URL=https://unpkg.com/@figma/plugin-typings/plugin-api.d.ts
echo "fetch $URL"
curl --location -# -o src/figma-plugin/plugin-api.d.ts "$URL"

awk '!/\/\/\/ <reference path=".\/plugin-api.d.ts" \/>/{print}' src/figma-plugin/figma.d.ts | \
awk '/} \/\/ declare global/{
  while (getline line<"src/figma-plugin/plugin-api.d.ts") {
    if (line != "") {
      print "  "line
    } else {
      print line
    }
  }
}
//' >src/figma-plugin/figma2.d.ts
mv src/figma-plugin/figma{2,}.d.ts
rm src/figma-plugin/plugin-api.d.ts

cp src/figma-plugin/figma.d.ts src/app/figma.d.ts

echo "wrote src/figma-plugin/figma.d.ts"
echo "wrote src/app/figma.d.ts"
