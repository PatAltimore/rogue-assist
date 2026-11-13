#!/bin/bash
# Builds the engine (WebAssembly) and assembles the site into dist/.
# Needs Emscripten on PATH: source tools/env.sh (after installing tools/emsdk).
set -e
cd "$(dirname "$0")"
(cd engine && bash build-emscripten.sh)
rm -rf dist
mkdir -p dist
cp engine/index.html engine/index.js engine/index.wasm dist/
cp -r web/css web/js dist/
cp web/favicon.svg web/favicon.png web/apple-touch-icon.png dist/
echo "Site ready in dist/"
