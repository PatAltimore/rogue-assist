# Rogue - Assist Mode

The original 1980s dungeon crawler **Rogue 5.4.4**, running in your browser, with an **Assist Mode** sidebar for when you get stuck. Rogue is randomly generated, so there is no fixed walkthrough; the assist tools react to your game instead.

- **The real game.** The C source from [Davidslv/rogue](https://github.com/Davidslv/rogue) is compiled to WebAssembly with Emscripten. A small curses replacement (`engine/shim`) draws to an 80x24 grid that the page renders, so there is no terminal emulator.
- **3D view.** A panel under the text screen shows the level you have explored in 3D (three.js): walls, rooms, corridors, doors, stairs, traps, items, monsters and your character, with pulsing rings on doors that lead somewhere unexplored. It follows you, and you can drag to turn the camera, scroll or pinch to zoom, or use the buttons. It is view-only and can be hidden. A **Text | 3D** switch above the game makes the 3D view the main pane (Text is the default). In 3D mode the game's messages, prompts and a status bar are always drawn over the scene, and a **Text opacity** slider sets how much of the text screen shows through (menus such as the inventory and help always show clearly). A third mode, **First-person**, puts the camera at eye level: Up/Down step forward and back, Left/Right turn in 45 degree steps (turning costs no game turn), Alt+Left/Right sidestep, Shift+Up runs, and dragging looks around (it snaps to the nearest of the 8 directions). Tap or click a square to walk there along the shortest known path, stopping if a monster appears, you are hurt or the game needs a key; tap a monster to walk up to it and again to attack. On a phone the d-pad becomes turn, forward, back and sidestep buttons. Monsters have glowing eyes, teeth and claws and bounce in a fighting stance (arms pumping, jaws snapping, tails lashing); items hop and spin. When you kill a monster it flinches, topples over and shrinks away in a burst of dust and sparks. A **Motion** button turns the animation off for the visit (it always starts on). Your avatar turns to face the way it last moved. The scenery is textured (stone brick walls, flagstone floors, gravel corridors with cave rock, plank doors, a slab ceiling in first person), drawn on a canvas in the browser so there are no image files. It uses the Monster radar and stairs options from the Cheats tab.
- **Status tab.** Live HP, hunger and stats, advice based on what is happening ("Weak from hunger", "an aquator is near: take your armor off"), the monsters in view, and your pack. Unidentified potions, scrolls, rings and wands show the odds of each kind they could be.
- **Hints tab.** Topic hints that open one tier at a time (nudge, stronger hint, answer), plus a key reference.
- **Map tab.** An overview of the level you have explored, with yellow outlines on doors that lead somewhere you have not been.
- **Reference tab.** Searchable monster table (level, armor class, damage, special attacks) and the odds and effects of every potion, scroll, ring and wand.
- **Cheats tab.** Every cheat has an Alt+letter shortcut (Alt+H heals, Alt+M maps, Alt+D descends...). Heal, feed, restore strength, raise level, change level, reveal the map, identify everything, add gold. Using one disables the high-score entry for that game, the same as wizard mode. Optional monster radar and stairs marker on the map.
- **Code tab.** Where each part of the game lives in the original source.
- **Saving.** `S` saves and quits; the next visit resumes automatically. The save and score list live in the browser's IndexedDB.
- **Phones.** On-screen d-pad and command buttons, with a Run toggle.
- **Look.** A Modern (colored glyphs) / Retro (green phosphor) switch and text size controls.

Keys: arrows or `hjkl` move, `yubn` diagonals, hold Shift to run, `>` and `<` for stairs, `i` for the pack. The Hints tab lists them all.

## Building

You need Python, Git and a POSIX shell (Git Bash on Windows). The Emscripten SDK is downloaded into `tools/emsdk` (about 1 GB, not checked in).

```bash
git clone https://github.com/emscripten-core/emsdk.git tools/emsdk
(cd tools/emsdk && python emsdk.py install 6.0.6 && python emsdk.py activate 6.0.6)

# Put emcc on PATH (Git Bash). On Linux/macOS use: source tools/emsdk/emsdk_env.sh
source tools/env.sh

bash build.sh
cd dist && python -m http.server 8091   # then open http://localhost:8091/
```

`build.sh` builds `engine/` and assembles the site into `dist/`. Opening `dist/index.html` straight from disk will not work because browsers block WebAssembly loading from `file://`.

## Layout

- `engine/` Rogue 5.4.4 C source, with a few small patches (marked `__EMSCRIPTEN__` or commented): saves and score file under `/data`, the daemon callbacks called with the exact signature WebAssembly needs, no setuid dropping.
- `engine/shim/` the curses replacement and the keyboard bridge (`getch` suspends via Emscripten ASYNCIFY until the page supplies a key).
- `engine/assist.c` read-only views (plus the flags that tell the page when the game is at its command prompt) of the live game (stats, pack, map, monsters) and the cheats.
- `web/` the page: `shell.html`, `css/app.css`, `js/app.js`, `js/view3d.js` (the 3D panel, loads three.js from cdnjs), `js/models3d.js` (low-poly models for the hero, all 26 monsters and the items, built from three.js shapes), `js/data.js` (monster, item and hint data).
- `.github/workflows/pages.yml` builds and deploys to GitHub Pages (Settings, Pages, Source must be "GitHub Actions").

## Credits and license

Rogue is copyright 1980-1983, 1985, 1999 Michael Toy, Ken Arnold and Glenn Wichman, and is distributed under the license in `engine/LICENSE.TXT`. The source comes from the [Davidslv/rogue](https://github.com/Davidslv/rogue) archive. The code outside `engine/` original to this project is personal and non-commercial.
