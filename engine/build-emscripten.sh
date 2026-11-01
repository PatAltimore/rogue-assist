#!/bin/bash
# Standalone Emscripten build for Rogue 5.4.4. Run from engine/ after sourcing
# tools/emsdk/emsdk_env.sh.
set -e
export MSYS2_ARG_CONV_EXCL="*"  # keep Git Bash from rewriting /data/... into a Windows path

SRCS=(
  vers.c extern.c armor.c chase.c command.c daemon.c daemons.c fight.c init.c
  io.c list.c mach_dep.c main.c mdport.c misc.c monsters.c move.c new_level.c
  options.c pack.c passages.c potions.c rings.c rip.c rooms.c save.c scrolls.c
  state.c sticks.c things.c weapons.c wizard.c xcrypt.c assist.c
  shim/curses_shim.c
)

CFLAGS="-O2 -std=gnu99 -Ishim -DALLSCORES -DSCOREFILE=\"/data/rogue54.scr\" -Wno-everything"
LDFLAGS="-sASYNCIFY -sASYNCIFY_IGNORE_INDIRECT=0 -sINITIAL_MEMORY=32MB -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web -sEXIT_RUNTIME=1 -sEXPORTED_FUNCTIONS=_main -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,IDBFS,ENV,UTF8ToString,HEAPU32,addRunDependency,removeRunDependency -lidbfs.js --shell-file ../web/shell.html $EXTRA_LDFLAGS"

mkdir -p build-em
OBJS=()
for src in "${SRCS[@]}"; do
  obj="build-em/$(basename "${src%.*}").o"
  OBJS+=("$obj")
  echo "===> CC $src"
  emcc $CFLAGS -c "$src" -o "$obj"
done

echo "===> LD index.html"
emcc $CFLAGS "${OBJS[@]}" $LDFLAGS -o index.html
echo "Build complete"
