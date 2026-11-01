# Source from the repo root (Git Bash on Windows): puts emcc on PATH.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export EM_CONFIG="$ROOT/tools/emsdk/.emscripten"
export PATH="$ROOT/tools/emsdk/upstream/emscripten:$ROOT/tools/emsdk/upstream/bin:$PATH"
