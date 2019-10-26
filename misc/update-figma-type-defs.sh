#!/bin/bash -e
cd "$(dirname "$0")/.."

URL=https://www.figma.com/plugin-docs/figma.d.ts
echo "fetch $URL"
curl '-#' -o src/figma-plugin/figma.d.ts "$URL"
cp src/figma-plugin/figma.d.ts src/app/figma-1.0.0.d.ts
