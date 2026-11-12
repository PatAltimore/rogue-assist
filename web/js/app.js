/* Rogue Assist Mode: terminal rendering, keyboard, and the assist sidebar. */
(function () {
  'use strict';

  var ROWS = 24, COLS = 80;
  var CHEAT_BASE = 0x1000;
  var D = window.RogueData;

  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  // ---------------------------------------------------------------- engine

  var queue = [];
  var waiter = null;
  var gameRunning = false;
  var exited = false;
  var lastSync = 0;
  var printed = []; // what the game writes to stdout: the score list


  window.Module = {
    print: function (t) { printed.push(String(t)); if (printed.length > 80) printed.shift(); },
    printErr: function (t) { if (window.console) console.warn(t); },
    preRun: [function () {
      var name = (store.get('rogue-name', 'Rogue') || 'Rogue').replace(/[^\w ]/g, '').slice(0, 20) || 'Rogue';
      Module.ENV.ROGUEOPTS = 'name=' + name + ',jump,passgo';
      Module.FS.mkdir('/data');
      Module.FS.mount(Module.IDBFS || window.IDBFS, {}, '/data');
      Module.addRunDependency('idbfs');
      Module.FS.syncfs(true, function () { Module.removeRunDependency('idbfs'); });
    }],
    postRun: [function () { /* main() is suspended inside getch(); nothing to do */ }],
    onExit: function () { onGameExit(); },
    rogueExited: function () { onGameExit(); },
    rogueWaitKey: function () {
      gameRunning = true;
      onWait();
      return new Promise(function (resolve) {
        if (queue.length) resolve(queue.shift());
        else waiter = resolve;
      });
    },
    rogueFlushKeys: function () { queue.length = 0; }
  };

  function sendKey(code) {
    if (exited) return;
    // The game ignores every key but Space while it shows --More--. In the 3D views the arrow
    // keys and buttons are movement, so answer the --More-- first instead of leaving you stuck.
    if (is3d() && code !== 32 && code !== 27 && code < 0x1000 && screenState.cells && /--More--/.test(row0Text())) {
      queue.length = 0;
      if (waiter) { var w0 = waiter; waiter = null; w0(32); } else queue.push(32);
    }
    if (screenState.returnPrompt) {
      // At the closing "press return" box only Enter, Space or Escape do anything.
      if (code !== 10 && code !== 32 && code !== 27) return;
      code = 10;
    }
    if (waiter) {
      var w = waiter;
      waiter = null;
      w(code);
    } else {
      queue.push(code);
    }
  }

  function syncSaves() {
    try { if (Module.FS) Module.FS.syncfs(false, function () {}); } catch (e) { /* not ready */ }
  }

  function onGameExit() {
    exited = true;
    syncSaves();
    renderScreen();
    syncTextOverlay(true);
    // The tombstone has been dismissed; show the score list the game printed, and a new-game button.
    $('returnBar').hidden = true;
    var board = printed.filter(function (l) { return !/just a moment while I dig/.test(l); }).join('\n').replace(/\[Press return to continue\]/, '').trim();
    showOverlay('Game over', true, board);
  }

  function showOverlay(text, withButton, board) {
    $('overlayText').textContent = text;
    $('overlayBoard').textContent = board || '';
    $('overlayBoard').hidden = !board;
    $('btnOverlayNew').hidden = !withButton;
    $('overlay').hidden = false;
  }

  function call(name) {
    var f = Module['_assist_' + name];
    if (!f) return 0;
    return f.apply(null, Array.prototype.slice.call(arguments, 1));
  }
  function str(ptr) { return Module.UTF8ToString(ptr); }

  // ---------------------------------------------------------------- screen

  var screenEl = $('screen');
  var rowEls = [];
  var rowCache = [];
  for (var r = 0; r < ROWS; r++) {
    var div = document.createElement('div');
    div.className = 'row';
    screenEl.appendChild(div);
    rowEls.push(div);
    rowCache.push(null);
  }

  var GLYPH_CLASS = {
    '@': 'hero', '#': 'pass', '+': 'door', '%': 'stairs', '!': 'item', '?': 'item', ':': 'food',
    ')': 'item', ']': 'item', '=': 'magic', '/': 'magic', '*': 'gold', ',': 'magic', '^': 'trap',
    '|': 'wall', '-': 'wall', '.': 'floor'
  };

  function glyphClass(ch, mapMode) {
    if (!mapMode) return '';
    var c = String.fromCharCode(ch);
    if (c >= 'A' && c <= 'Z') return 'mon';
    return GLYPH_CLASS[c] || '';
  }

  function esc(c) {
    return c === 38 ? '&amp;' : c === 60 ? '&lt;' : c === 62 ? '&gt;' : String.fromCharCode(c);
  }

  var screenState = { cells: null, cy: 0, cx: 0, mapMode: false };

  function readScreen() {
    if (!Module._shim_screen) return false;
    var base = Module._shim_screen() >> 2;
    var heap = Module.HEAPU32;
    var cells = new Array(ROWS * COLS);
    for (var i = 0; i < cells.length; i++) cells[i] = heap[base + i];
    screenState.cells = cells;
    screenState.cy = Module._shim_cursor_y();
    screenState.cx = Module._shim_cursor_x();
    var statusRow = '';
    for (var c = 0; c < 12; c++) statusRow += String.fromCharCode(cells[(ROWS - 1) * COLS + c] & 0xff);
    screenState.mapMode = /^Level:\s*\d/.test(statusRow);
    return true;
  }

  function renderScreen() {
    if (!readScreen()) return;
    var cells = screenState.cells;
    var retro = document.documentElement.dataset.theme === 'retro';
    for (var r = 0; r < ROWS; r++) {
      var html = '';
      var open = null;
      var rowMap = screenState.mapMode && r > 0 && r < ROWS - 1;
      for (var c = 0; c < COLS; c++) {
        var v = cells[r * COLS + c];
        var ch = v & 0xff;
        if (ch < 32 || ch > 126) ch = 32;
        var cls = (v & 0x100) ? 'so' : (retro ? (rowMap && ch === 64 ? 'hero' : '') : glyphClass(ch, rowMap));
        if (r === screenState.cy && c === screenState.cx) cls = (cls ? cls + ' ' : '') + 'cur';
        if (cls !== open) {
          if (open) html += '</span>';
          if (cls) html += '<span class="' + cls + '">';
          open = cls;
        }
        html += esc(ch);
      }
      if (open) html += '</span>';
      if (rowCache[r] !== html) {
        rowEls[r].innerHTML = html;
        rowCache[r] = html;
      }
    }
    // Rogue ends with a "[Press return to continue]" line that wants typed input; spot it so the
    // page can offer a button instead and not echo stray keys into the box.
    var wasReturn = screenState.returnPrompt;
    var rp = false;
    for (r = ROWS - 1; r >= 0 && !rp; r--) {
      var line = '';
      for (c = 0; c < COLS; c++) { var cc = cells[r * COLS + c] & 0xff; line += cc >= 32 && cc < 127 ? String.fromCharCode(cc) : ' '; }
      if (/Press return to continue/i.test(line)) rp = true;
    }
    screenState.returnPrompt = rp && !exited;
    if (screenState.returnPrompt !== wasReturn) {
      $('returnBar').hidden = !screenState.returnPrompt;
      screenEl.classList.toggle('at-return', !!screenState.returnPrompt);
      if (typeof syncTextOverlay === 'function') syncTextOverlay(true);
    }
    placeHeroMark();
    followCursor();
  }

  // Over the 3D view the text layer is faint, so the hero's @ is drawn again on its own, at full
  // brightness, throbbing in size and brightness so it is easy to find.
  function placeHeroMark() {
    var m = $('heroMark'), cells = screenState.cells, at = -1, i;
    if (cells && is3d() && screenState.mapMode && !needsText()) {
      for (i = COLS; i < (ROWS - 1) * COLS; i++) if ((cells[i] & 0xff) === 64) { at = i; break; }
    }
    if (at < 0) { if (!m.hidden) m.hidden = true; return; }
    var hx = at % COLS, hy = (at / COLS) | 0, wrap = $('screenWrap'), wr = wrap.getBoundingClientRect(), rr = rowEls[hy].getBoundingClientRect();
    m.hidden = false;
    m.style.left = (rr.left - wr.left + wrap.scrollLeft + hx * colWidth) + 'px';
    m.style.top = (rr.top - wr.top + wrap.scrollTop) + 'px';
    m.style.width = colWidth + 'px';
    m.style.height = rr.height + 'px';
    m.style.fontSize = getComputedStyle(screenEl).fontSize;
  }

  var colWidth = 8;

  function followCursor() {
    var wrap = $('screenWrap');
    if (wrap.scrollWidth <= wrap.clientWidth) return;
    var target = 8 + (screenState.cx + 0.5) * colWidth - wrap.clientWidth / 2;
    wrap.scrollLeft = Math.max(0, target);
  }

  function fitScreen() {
    var wrap = $('screenWrap');
    if (!wrap.clientWidth) return; // hidden (3D mode without the text overlay)
    var avail = wrap.clientWidth - 18;
    var zoom = parseFloat(store.get('rogue-zoom', '1')) || 1;
    // Measure the glyph width of the monospace font at a known size.
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:100px var(--font-mono)';
    probe.textContent = new Array(81).join('M');
    document.body.appendChild(probe);
    var perCol = probe.getBoundingClientRect().width / 80 / 100; // width per column per 1px of font
    document.body.removeChild(probe);
    var fit = Math.floor(avail / (COLS * perCol));
    if (is3d()) {
      var cs = getComputedStyle(wrap);
      var availH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2;
      fit = Math.min(fit, Math.floor(availH / (ROWS * 1.2)));
    }
    // On a phone the whole 80 columns are too small to read, so keep a minimum
    // size and let the view scroll sideways to follow the cursor.
    var floor = window.innerWidth < 860 ? 10 : 6;
    var fs = Math.max(6, Math.min(48, Math.round(Math.max(floor, fit) * zoom)));
    colWidth = perCol * fs;
    screenEl.style.setProperty('--fs', fs + 'px');
    followCursor();
  }

  // ---------------------------------------------------------------- input

  var runNext = false;

  function setRun(on) {
    runNext = on;
    $('btnRun').classList.toggle('on', on);
  }

  var DIR_LETTERS = { h: 1, j: 1, k: 1, l: 1, y: 1, u: 1, b: 1, n: 1 };

  // In the overhead 3D view the camera can be turned, so "up" on the screen is not always
  // north. Arrows and the d-pad mean what they look like on screen: this turns a screen
  // direction into the game's map direction for the current camera angle.
  var SCREEN_VEC = { h: [-1, 0], l: [1, 0], k: [0, 1], j: [0, -1], y: [-1, 1], u: [1, 1], b: [-1, -1], n: [1, -1] };
  var MAP_BY_ANGLE = ['l', 'n', 'j', 'b', 'h', 'y', 'k', 'u']; // east, then clockwise in 45 degree steps
  function viewDir(letter) {
    if (mode !== '3d' || !window.View3D || !View3D.getYaw || !SCREEN_VEC[letter]) return letter;
    var yaw = View3D.getYaw(), v = SCREEN_VEC[letter];
    var mx = Math.cos(yaw) * v[0] - Math.sin(yaw) * v[1];        // right * sx + up * sy, in map coordinates
    var my = -Math.sin(yaw) * v[0] - Math.cos(yaw) * v[1];
    var idx = Math.round(Math.atan2(my, mx) / (Math.PI / 4));
    return MAP_BY_ANGLE[((idx % 8) + 8) % 8];
  }

  function sendChar(ch) {
    if (DIR_LETTERS[ch]) ch = viewDir(ch);
    if (runNext && DIR_LETTERS[ch]) {
      ch = ch.toUpperCase();
      setRun(false);
    }
    sendKey(ch.charCodeAt(0));
  }

  function sendNamed(name) {
    var map = { Escape: 27, Enter: 10, Backspace: 8 };
    if (map[name]) sendKey(map[name]);
  }

  function isTyping(e) {
    var t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
  }

  document.addEventListener('keydown', function (e) {
    if (isTyping(e) || e.ctrlKey || e.metaKey) return;
    if (exited && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('btnOverlayNew').click(); return; }
    if (walker && e.key !== 'Shift' && e.key !== 'Alt') cancelWalk();
    if (mode === 'walk' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) >= 0) {
      walkArrow(e);
      e.preventDefault();
      return;
    }
    if (e.altKey) {
      // Alt + letter runs a cheat (the letters are shown on the Cheats tab).
      var letter = /^Key([A-Z])$/.exec(e.code || '');
      var cheat = letter && CHEATS.filter(function (c) { return c[3] === letter[1]; })[0];
      if (cheat && !e.shiftKey) {
        e.preventDefault();
        if (gameRunning && !exited) sendKey(CHEAT_BASE + cheat[0]);
      }
      return;
    }
    var ae = document.activeElement;
    if (ae && ae.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) {
      // Buttons elsewhere keep their keyboard activation; in the game pane Space
      // goes to the game (it answers --More--), so drop the focus first.
      if (e.key === 'Enter' || !ae.closest('#gamePane')) return;
      ae.blur();
    }
    var arrow = { ArrowLeft: 'h', ArrowDown: 'j', ArrowUp: 'k', ArrowRight: 'l', Home: 'y', PageUp: 'u', End: 'b', PageDown: 'n' }[e.key];
    var handled = true;
    if (arrow) { arrow = viewDir(arrow); sendKey((e.shiftKey ? arrow.toUpperCase() : arrow).charCodeAt(0)); }
    else if (e.key === 'Escape') sendKey(27);
    else if (e.key === 'Enter') sendKey(10);
    else if (e.key === 'Backspace') sendKey(8);
    else if (e.key === 'Delete') sendKey(127);
    else if (e.key.length === 1) sendKey(e.key.charCodeAt(0));
    else handled = false;
    if (handled) e.preventDefault();
  });

  $('touch').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var k = b.dataset.key;
    if (b.id === 'btnRun') { setRun(!runNext); return; }
    cancelWalk();
    if (mode === 'walk' && b.dataset.walk) { walkAction(b.dataset.walk); e.preventDefault(); return; }
    if (!k) return;
    if (k === 'y_') sendKey(121);
    else if (k.length === 1) sendChar(k);
    else sendNamed(k);
    e.preventDefault();
  });


  // ------------------------------------------------------- walk view controls

  // Facing 0 is north (up the map) and counts clockwise; these are the game's keys for each.
  var DIR_KEYS = ['k', 'u', 'l', 'n', 'j', 'b', 'h', 'y'];
  var DIR_DELTA = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // [dx, dy]
  var walker = null;
  var lastGrid = null;

  var prevPos = null;

  // Forward into a wall does nothing, which feels like being stuck. In a corridor, when the way
  // ahead is blocked, follow the passage if there is only one way on (a bend), otherwise say why.
  function followPassage(dir) {
    if (!lastState || !lastGrid) return dir;
    var hx = lastState.heroX, hy = lastState.heroY, d = DIR_DELTA[dir];
    if (canStep(hx, hy, d[0], d[1])) return dir;
    var opts = [];
    for (var i = 0; i < 8; i++) {
      var dd = DIR_DELTA[i];
      if (!canStep(hx, hy, dd[0], dd[1])) continue;
      if (prevPos && prevPos.x === hx + dd[0] && prevPos.y === hy + dd[1]) continue; // where you came from
      opts.push(i);
    }
    if (opts.length === 1) { View3D.setFacing(opts[0]); return opts[0]; }
    tellHud(opts.length ? 'Blocked ahead: turn to choose a way (' + opts.length + ' open)' : 'Blocked ahead. A dead end? Try searching with s.');
    return -1;
  }

  function stepRel(rel, run) {
    var dir = (View3D.getFacing() + rel) & 7;
    if (rel === 0) { dir = followPassage(dir); if (dir < 0) return; }
    var key = DIR_KEYS[dir];
    if (run || runNext) { key = key.toUpperCase(); setRun(false); }
    sendKey(key.charCodeAt(0));
  }

  function walkAction(name) {
    if (name === 'turnL') View3D.turn(-1);
    else if (name === 'turnR') View3D.turn(1);
    else if (name === 'fwd') stepRel(0);
    else if (name === 'back') stepRel(4);
    else if (name === 'strL') stepRel(6);
    else if (name === 'strR') stepRel(2);
    else if (name === 'rest') sendKey(46);
  }

  function walkArrow(e) {
    if (e.key === 'ArrowUp') stepRel(0, e.shiftKey);
    else if (e.key === 'ArrowDown') stepRel(4, e.shiftKey);
    else if (e.key === 'ArrowLeft') { if (e.altKey) stepRel(6); else View3D.turn(-1); }
    else if (e.key === 'ArrowRight') { if (e.altKey) stepRel(2); else View3D.turn(1); }
  }

  // On a phone the d-pad turns into turn / forward / back / sidestep buttons in the walk view.
  function setWalkControls(on) {
    Array.prototype.forEach.call(document.querySelectorAll('.dpad button[data-walk]'), function (b) {
      if (!b.dataset.label) b.dataset.label = b.textContent;
      if (b.dataset.walk === 'none') { b.classList.toggle('walk-off', on); return; }
      if (b.dataset.walkLabel) b.innerHTML = on ? b.dataset.walkLabel : b.dataset.label;
    });
    var titles = { rotl: ['Turn left', 'Rotate left'], rotr: ['Turn right', 'Rotate right'] };
    Array.prototype.forEach.call(document.querySelectorAll('[data-v3="rotl"], [data-v3="rotr"]'), function (b) {
      var t = titles[b.dataset.v3];
      b.title = on ? t[0] : t[1];
    });
  }

  // --- tap to walk

  function gridChar(x, y) {
    if (!lastGrid || y < 1 || y > ROWS - 2 || x < 0 || x >= COLS) return '';
    var c = lastGrid[y][x];
    return c ? String.fromCharCode(c) : '';
  }

  // Squares we can step onto: remembered, not a wall, trap or monster (the hero's own @ is fine).
  function canStand(x, y) {
    var c = gridChar(x, y);
    return c !== '' && c !== '|' && c !== '-' && c !== '^' && !(c >= 'A' && c <= 'Z');
  }

  // The game's rule for diagonals: both squares beside the move must be open (monsters do not count).
  function openForDiagonal(x, y) {
    var c = gridChar(x, y);
    return c !== '' && c !== '|' && c !== '-';
  }

  function diagonalOk(x, y, dx, dy) {
    return dx === 0 || dy === 0 || (openForDiagonal(x + dx, y) && openForDiagonal(x, y + dy));
  }

  function canStep(x, y, dx, dy) {
    return canStand(x + dx, y + dy) && diagonalOk(x, y, dx, dy);
  }

  // Shortest path from the hero: returns the squares to walk through (not the start), or null.
  function findPath(from, isGoal) {
    var key = function (x, y) { return y * 100 + x; };
    var prev = {}, queue = [[from.x, from.y]], head = 0;
    prev[key(from.x, from.y)] = -1;
    while (head < queue.length) {
      var cur = queue[head++];
      if ((cur[0] !== from.x || cur[1] !== from.y) && isGoal(cur[0], cur[1])) {
        var path = [], k = key(cur[0], cur[1]);
        while (k !== -1 && k !== key(from.x, from.y)) { path.unshift({ x: k % 100, y: Math.floor(k / 100) }); k = prev[k]; }
        return path;
      }
      for (var d = 0; d < 8; d++) {
        var nx = cur[0] + DIR_DELTA[d][0], ny = cur[1] + DIR_DELTA[d][1];
        if (prev[key(nx, ny)] !== undefined || !canStep(cur[0], cur[1], DIR_DELTA[d][0], DIR_DELTA[d][1])) continue;
        prev[key(nx, ny)] = key(cur[0], cur[1]);
        queue.push([nx, ny]);
      }
    }
    return null;
  }

  function dirIndex(dx, dy) {
    for (var d = 0; d < 8; d++) if (DIR_DELTA[d][0] === dx && DIR_DELTA[d][1] === dy) return d;
    return -1;
  }

  function tellHud(text) {
    hudLog.push({ text: text, t: Date.now() });
    if (hudLog.length > 4) hudLog.shift();
    if (lastState) updateHud(lastState);
  }

  function cancelWalk() { walker = null; }

  function handleTap(c) {
    if (mode !== 'walk' || !lastState || !lastGrid || exited || !gameRunning) return;
    cancelWalk();
    if (!call('at_prompt')) return; // the game is waiting for something other than a move
    var hero = { x: lastState.heroX, y: lastState.heroY };
    var monster = null;
    lastState.seen.forEach(function (m) { if (m.x === c.x && m.y === c.y) monster = m; });

    if (c.x === hero.x && c.y === hero.y) {
      // Standing on the stairs: tapping yourself takes them.
      if (call('stairs_known') && call('stairs_x') === hero.x && call('stairs_y') === hero.y) sendKey(62);
      return;
    }
    var dx = c.x - hero.x, dy = c.y - hero.y;
    if (monster && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      // Next to it: attack by moving into it, if the game lets us move that way.
      var d = dirIndex(dx, dy);
      if (d >= 0 && diagonalOk(hero.x, hero.y, dx, dy)) { View3D.setFacing(d); sendKey(DIR_KEYS[d].charCodeAt(0)); }
      return;
    }
    var path = monster
      ? findPath(hero, function (x, y) { return Math.abs(x - c.x) <= 1 && Math.abs(y - c.y) <= 1 && diagonalOk(x, y, c.x - x, c.y - y); })
      : (canStand(c.x, c.y) ? findPath(hero, function (x, y) { return x === c.x && y === c.y; }) : null);
    if (!path || !path.length) {
      tellHud(monster || canStand(c.x, c.y) ? 'No known way there.' : 'You cannot walk there.');
      return;
    }
    walker = { path: path, i: 0, hp: lastState.hp, seen: lastState.seen.length, from: hero, expect: null };
    stepWalker();
  }

  function stepWalker() {
    if (!walker) return;
    var w = walker, next = w.path[w.i], prev = w.i ? w.path[w.i - 1] : w.from;
    var d = dirIndex(next.x - prev.x, next.y - prev.y);
    if (d < 0) { cancelWalk(); return; }
    w.expect = next;
    w.i++;
    View3D.setFacing(d);
    // A short pause lets the camera turn and glide between squares.
    setTimeout(function () { if (walker === w) sendKey(DIR_KEYS[d].charCodeAt(0)); }, 120);
  }

  // Called each time the game is waiting for a key: decide whether the walk goes on.
  function walkTick() {
    if (!walker || !lastState) return;
    var w = walker, s = lastState;
    if (!call('at_prompt')) { cancelWalk(); return; }           // a prompt or --More-- came up
    if (w.expect && (s.heroX !== w.expect.x || s.heroY !== w.expect.y)) { cancelWalk(); return; } // blocked or fought
    if (s.hp < w.hp || s.seen.length > w.seen) { cancelWalk(); return; } // hurt, or something came into view
    w.seen = Math.max(w.seen, s.seen.length);
    if (w.i >= w.path.length) { cancelWalk(); return; }          // arrived
    stepWalker();
  }

  // ---------------------------------------------------------------- state

  function readState() {
    var s = {
      level: call('level'), maxLevel: call('max_level'),
      hp: call('hp'), maxHp: call('max_hp'), str: call('str'), maxStr: call('max_str'),
      ac: call('ac'), xpLevel: call('xp_level'), xp: call('xp'), gold: call('gold'),
      food: call('food'), hunger: call('hunger'), amulet: call('has_amulet'),
      armorWorn: call('armor_worn'), weaponWielded: call('weapon_wielded'),
      heroY: call('hero_y'), heroX: call('hero_x'), cheated: call('cheated'),
      pack: [], seen: []
    };
    var n = call('pack_count');
    for (var i = 0; i < n; i++) {
      s.pack.push({
        letter: String.fromCharCode(call('pack_letter', i)),
        type: String.fromCharCode(call('pack_type', i)),
        which: call('pack_which', i),
        count: call('pack_count_of', i),
        known: call('pack_known', i),
        equipped: call('pack_equipped', i),
        name: str(call('pack_name', i))
      });
    }
    var m = call('monster_count', 1);
    for (var j = 0; j < m; j++) {
      s.seen.push({
        letter: String.fromCharCode(call('monster_type', j, 1)),
        y: call('monster_y', j, 1), x: call('monster_x', j, 1), hp: call('monster_hp', j, 1)
      });
    }
    return s;
  }

  var TYPE_KIND = { '!': 0, '?': 1, '=': 2, '/': 3 };

  function monsterByLetter(letter) {
    for (var i = 0; i < D.MONSTERS.length; i++) if (D.MONSTERS[i][0] === letter) return D.MONSTERS[i];
    return null;
  }

  // Probability that an unidentified item is each still-unknown kind.
  function likelyKinds(kind, limit) {
    var items = D.KINDS[kind].items, pool = [], total = 0;
    for (var i = 0; i < items.length; i++) {
      if (call('item_known', kind, i) === 0) { pool.push([items[i][0], items[i][1]]); total += items[i][1]; }
    }
    pool.sort(function (a, b) { return b[1] - a[1]; });
    return pool.slice(0, limit).map(function (p) { return p[0] + ' ' + Math.round(100 * p[1] / total) + '%'; }).join(', ');
  }

  function advise(s) {
    var tips = [];
    function tip(cls, text) { tips.push({ cls: cls, text: text }); }
    var pct = s.maxHp ? s.hp / s.maxHp : 1;
    if (pct <= 0.3) tip('warn', 'Health is low (' + s.hp + '/' + s.maxHp + '). Step back from the fight, quaff a known healing potion, or take the stairs down (only monsters next to you follow). Resting with s or . heals slowly.');
    if (s.hunger >= 3) tip('warn', 'You are Faint from hunger. Eat now (e).');
    else if (s.hunger === 2) tip('warn', 'You are Weak from hunger. Eat soon (e).');
    else if (s.hunger === 1) tip('', 'You are Hungry. Eat (e) when it is safe.');
    var hasFood = s.pack.some(function (p) { return p.type === ':'; });
    if (!hasFood && s.hunger >= 1) tip('warn', 'You have nothing to eat. Descend quickly and look for food (:).');
    if (!s.armorWorn) tip('', 'You are not wearing armor. Use W to put some on.');
    if (!s.weaponWielded) tip('', 'You have no weapon wielded. Use w to wield one.');
    var unknownPotions = s.pack.filter(function (p) { return p.type === '!' && !p.known && call('item_known', 0, p.which) === 0; });
    if (unknownPotions.length && pct > 0.7 && !s.seen.length) tip('', 'You hold unidentified potions. Drinking one at full health with no monsters around is the standard way to identify them.');
    var unknownScrolls = s.pack.filter(function (p) { return p.type === '?' && call('item_known', 1, p.which) === 0; });
    if (unknownScrolls.length && pct > 0.7 && !s.seen.length) tip('', 'You hold unread scrolls. Reading them when safe identifies them, but beware of sleep and aggravate.');
    if (s.amulet) tip('good', 'You have the Amulet of Yendor! Climb back up with < on every level to win.');
    s.seen.forEach(function (m) {
      var info = monsterByLetter(m.letter);
      if (info && /steals|rust|drains|freez|holds|confus|grows/.test(info[4] + ' ' + info[6])) {
        tip('warn', info[1] + ' (' + m.letter + ') nearby: ' + info[6]);
      }
    });
    if (!tips.length) tip('good', 'Nothing urgent. Explore, pick up items and look for the stairs (%).');
    return tips;
  }

  function renderStatus(s) {
    var hpPct = s.maxHp ? Math.max(0, Math.min(100, Math.round(100 * s.hp / s.maxHp))) : 0;
    var hungerText = ['Fed', 'Hungry', 'Weak', 'Faint'][s.hunger] || 'Fed';
    $('vitals').innerHTML =
      '<div>HP ' + s.hp + ' / ' + s.maxHp + '</div>' +
      '<div class="bar ' + (hpPct <= 30 ? 'low' : hpPct <= 60 ? 'mid' : '') + '"><i style="width:' + hpPct + '%"></i></div>' +
      '<div class="vitals-grid">' +
      cell('Level', s.level + (s.maxLevel > s.level ? ' (max ' + s.maxLevel + ')' : '')) +
      cell('Gold', s.gold) + cell('Armor', s.ac) +
      cell('Str', s.str + (s.maxStr !== s.str ? ' / ' + s.maxStr : '')) +
      cell('XP level', s.xpLevel) + cell('XP points', s.xp) + cell('Hunger', hungerText) +
      '</div>' + (s.cheated ? '<p class="muted">Practice run: you used a cheat, so no high score.</p>' : '');

    $('advice').innerHTML = advise(s).map(function (t) {
      return '<div class="tip ' + t.cls + '">' + escapeHtml(t.text) + '</div>';
    }).join('');

    $('nearby').innerHTML = s.seen.length ? s.seen.map(function (m) {
      var info = monsterByLetter(m.letter);
      return '<div class="mon"><b>' + escapeHtml(m.letter) + '</b><div>' + (info ? escapeHtml(info[1]) : 'unknown') +
        ' (HP ' + m.hp + ')<small>' + (info ? escapeHtml(info[4]) + ' damage, AC ' + info[3] : '') + '</small></div></div>';
    }).join('') : '<div class="muted">No monsters in view.</div>';

    $('pack').innerHTML = s.pack.length ? s.pack.map(function (p) {
      var extra = '';
      var kind = TYPE_KIND[p.type];
      if (kind !== undefined && call('item_known', kind, p.which) === 0) {
        extra = '<small>Could be: ' + escapeHtml(likelyKinds(kind, 4)) + '</small>';
      } else if (kind !== undefined) {
        var note = D.ITEM_NOTES[D.KINDS[kind].singular][D.KINDS[kind].items[p.which][0]];
        if (note) extra = '<small>' + escapeHtml(note) + '</small>';
      }
      var eq = p.equipped === 1 ? '<span class="eq">in use</span>' : p.equipped === 2 ? '<span class="eq">worn</span>' : '';
      return '<li><span class="letter">' + escapeHtml(p.letter) + ')</span>' + escapeHtml(p.name) + eq + extra + '</li>';
    }).join('') : '<li class="muted">Your pack is empty.</li>';
  }

  function cell(label, value) { return '<div><span>' + label + '</span>' + escapeHtml(String(value)) + '</div>'; }
  function escapeHtml(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ------------------------------------------------------------------ map

  var mapOpts = { radar: false, stairs: false };

  function renderMap(s) {
    var canvas = $('mapCanvas');
    // Crop to what has been explored so the cells can be drawn large.
    var minX = s.heroX, maxX = s.heroX, minY = s.heroY, maxY = s.heroY;
    for (var yy = 1; yy < ROWS - 1; yy++) {
      for (var xx = 0; xx < COLS; xx++) {
        if (call('cell', yy, xx)) {
          if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
          if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
        }
      }
    }
    minX = Math.max(0, minX - 2); maxX = Math.min(COLS - 1, maxX + 2);
    minY = Math.max(1, minY - 1); maxY = Math.min(ROWS - 2, maxY + 1);
    var cols = maxX - minX + 1, rows = maxY - minY + 1;
    var cw = Math.max(4, Math.min(18, Math.floor(canvas.clientWidth / cols)));
    var ch = Math.round(cw * 1.8);
    var dpr = window.devicePixelRatio || 1;
    canvas.width = cols * cw * dpr;
    canvas.height = rows * ch * dpr;
    canvas.style.width = cols * cw + 'px';
    canvas.style.height = rows * ch + 'px';
    var g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    var cs = getComputedStyle(document.documentElement);
    var col = function (n) { return cs.getPropertyValue(n).trim(); };
    g.fillStyle = col('--screen-bg');
    g.fillRect(0, 0, cols * cw, rows * ch);
    g.font = Math.floor(ch * 0.8) + 'px ' + col('--font-mono');
    g.textBaseline = 'middle';
    g.textAlign = 'center';

    function put(x, y, c, color) {
      if (x < minX || x > maxX || y < minY || y > maxY) return;
      g.fillStyle = color;
      g.fillText(c, (x - minX) * cw + cw / 2, (y - minY) * ch + ch / 2);
    }
    var palette = {
      '#': col('--c-pass'), '+': col('--c-door'), '%': col('--c-stairs'), '*': col('--c-gold'),
      '^': col('--c-trap'), '.': col('--c-floor'), '|': col('--c-wall'), '-': col('--c-wall'),
      ':': col('--c-food'), '!': col('--c-item'), '?': col('--c-item'), ')': col('--c-item'),
      ']': col('--c-item'), '=': col('--c-magic'), '/': col('--c-magic'), ',': col('--c-magic')
    };
    var frontier = 0, stairsSeen = false;
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var code = call('cell', y, x);
        if (!code) continue;
        var c = String.fromCharCode(code);
        if (c === '%') stairsSeen = true;
        put(x, y, c, palette[c] || col('--screen-fg'));
        if (c === '+') {
          var open = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(function (d) {
            var ny = y + d[0], nx = x + d[1];
            return ny > 0 && ny < ROWS - 1 && nx >= 0 && nx < COLS && !call('cell', ny, nx);
          });
          if (open) {
            frontier++;
            g.strokeStyle = col('--accent');
            g.lineWidth = 2;
            g.strokeRect((x - minX) * cw, (y - minY) * ch, cw, ch);
          }
        }
      }
    }
    if (mapOpts.stairs && call('stairs_y')) put(call('stairs_x'), call('stairs_y'), '%', col('--c-stairs'));
    if (mapOpts.radar) {
      var n = call('monster_count', 0);
      for (var i = 0; i < n; i++) {
        put(call('monster_x', i, 0), call('monster_y', i, 0), String.fromCharCode(call('monster_type', i, 0)), col('--c-mon'));
      }
    }
    put(s.heroX, s.heroY, '@', col('--c-hero'));
    $('mapNote').textContent = 'Level ' + s.level + '. ' + (stairsSeen ? 'The stairs are on the map.' : 'Stairs not found yet.') +
      (frontier ? ' ' + frontier + ' door' + (frontier === 1 ? '' : 's') + ' lead somewhere unexplored.' : '');
  }

  // ------------------------------------------------------------ reference

  function renderRef() {
    var q = $('refSearch').value.trim().toLowerCase();
    var html = '';
    var syms = D.SYMBOLS.filter(function (r) {
      return !q || r[0].toLowerCase() === q || r[0].toLowerCase().split(' ').indexOf(q) >= 0 || r[1].toLowerCase().indexOf(q) >= 0 ||
        r[2].toLowerCase().indexOf(q) >= 0 || (r[0] === 'A-Z' && /^[a-z]$/.test(q));
    });
    if (syms.length) {
      html += '<h2>Map symbols</h2><table class="ref">' + syms.map(function (r) {
        return '<tr><td class="l sym">' + escapeHtml(r[0]) + '</td><td>' + escapeHtml(r[1]) + '<span class="ref-note">' + escapeHtml(r[2]) + '</span></td></tr>';
      }).join('') + '</table>';
    }
    var stat = D.STATUS.filter(function (r) { return !q || r[0].toLowerCase().indexOf(q) >= 0 || r[1].toLowerCase().indexOf(q) >= 0 || 'status line'.indexOf(q) >= 0; });
    if (stat.length) {
      html += '<h2>Status line</h2><table class="ref">' + stat.map(function (r) {
        return '<tr><td class="l">' + escapeHtml(r[0]) + '</td><td>' + escapeHtml(r[1]) + '</td></tr>';
      }).join('') + '</table>';
    }
    var mons = D.MONSTERS.filter(function (m) {
      return !q || m[0].toLowerCase() === q || m[1].indexOf(q) >= 0 || m[6].toLowerCase().indexOf(q) >= 0;
    });
    if (mons.length) {
      html += '<h2>Monsters</h2><table class="ref"><tr><th></th><th>Name</th><th>Lvl</th><th>AC</th><th>Damage</th></tr>';
      mons.forEach(function (m) {
        html += '<tr><td class="l">' + m[0] + '</td><td>' + escapeHtml(m[1]) + '<span class="ref-note">' +
          escapeHtml(m[6]) + ' ' + m[5] + ' XP.</span></td><td>' + m[2] + '</td><td>' + m[3] + '</td><td>' + escapeHtml(m[4]) + '</td></tr>';
      });
      html += '</table><p class="muted">Monsters have level d8 hit points. Lower AC is harder to hit.</p>';
    }
    D.KINDS.forEach(function (k) {
      var rows = k.items.map(function (it, idx) { return { it: it, idx: idx }; }).filter(function (r) {
        var note = D.ITEM_NOTES[k.singular][r.it[0]] || '';
        return !q || r.it[0].indexOf(q) >= 0 || note.toLowerCase().indexOf(q) >= 0 || k.label.toLowerCase().indexOf(q) >= 0;
      });
      if (!rows.length) return;
      var total = k.items.reduce(function (a, b) { return a + b[1]; }, 0);
      html += '<h2>' + k.label + '</h2><table class="ref"><tr><th>Kind</th><th>Odds</th></tr>';
      rows.forEach(function (r) {
        var known = gameRunning && call('item_known', k.id, r.idx) === 1;
        var label = gameRunning ? str2(call('item_label', k.id, r.idx)) : '';
        html += '<tr><td>' + escapeHtml(r.it[0]) + (known ? '<span class="tag good">known</span>' : label ? '<span class="tag">' + escapeHtml(label) + '</span>' : '') +
          '<span class="ref-note">' + escapeHtml(D.ITEM_NOTES[k.singular][r.it[0]] || '') + '</span></td><td>' + Math.round(100 * r.it[1] / total) + '%</td></tr>';
      });
      html += '</table>';
    });
    function listSimple(title, items, col2) {
      var rows = items.filter(function (r) { return !q || r[0].indexOf(q) >= 0 || title.toLowerCase().indexOf(q) >= 0; });
      if (!rows.length) return '';
      return '<h2>' + title + '</h2><table class="ref">' + rows.map(function (r) {
        return '<tr><td>' + escapeHtml(r[0]) + '</td><td>' + escapeHtml(String(r[2])) + '</td></tr>';
      }).join('') + '</table>';
    }
    html += listSimple('Armor (armor class when worn)', D.ARMOR);
    html += listSimple('Weapons', D.WEAPONS);
    $('refBody').innerHTML = html || '<p class="muted">Nothing matches.</p>';
  }
  function str2(p) { return p ? str(p) : ''; }

  // ------------------------------------------------------------ hints/cheats

  function setupHints() {
    var sel = $('hintTopic');
    D.HINTS.forEach(function (h, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = h.title;
      sel.appendChild(o);
    });
    var shown = {};
    function draw() {
      var h = D.HINTS[sel.value];
      var n = shown[sel.value] || 0;
      var labels = ['Nudge', 'Stronger hint', 'The answer'];
      var html = '';
      for (var i = 0; i < n; i++) html += '<div class="tier"><b>' + labels[i] + '</b>' + escapeHtml(h.tiers[i]) + '</div>';
      if (n < h.tiers.length) html += '<button class="reveal" id="btnReveal">' + (n ? 'Reveal ' + labels[n].toLowerCase() : 'Show a nudge') + '</button>';
      $('hintBody').innerHTML = html;
      var b = $('btnReveal');
      if (b) b.addEventListener('click', function () { shown[sel.value] = n + 1; draw(); });
    }
    sel.addEventListener('change', draw);
    draw();

    $('commandList').innerHTML = D.COMMANDS.map(function (c) {
      return '<dt>' + escapeHtml(c[0]) + '</dt><dd>' + escapeHtml(c[1]) + '</dd>';
    }).join('');
  }

  // code, name, what it does, Alt+key
  var CHEATS = [
    [1, 'Heal', 'Full hit points', 'H'],
    [2, 'Feed', 'Not hungry any more', 'F'],
    [3, 'Restore strength', 'Back to your maximum', 'S'],
    [4, 'Raise level', 'One experience level', 'L'],
    [5, 'Descend', 'Jump to the next level', 'D'],
    [6, 'Ascend', 'Go up a level', 'A'],
    [7, 'Reveal map', 'Map the whole level', 'M'],
    [8, 'Identify all', 'Every potion, scroll, ring, wand', 'I'],
    [9, 'Add 500 gold', 'Straight to your purse', 'G'],
    [10, 'Regenerate level', 'New layout, same depth', 'R']
  ];

  function setupCheats() {
    $('cheatGrid').innerHTML = CHEATS.map(function (c) {
      return '<button data-cheat="' + c[0] + '">' + c[1] + ' <kbd>Alt+' + c[3] + '</kbd><small>' + c[2] + '</small></button>';
    }).join('');
    $('cheatGrid').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !gameRunning || exited) return;
      sendKey(CHEAT_BASE + Number(b.dataset.cheat));
      $('screen').focus();
    });
    $('chkRadar').addEventListener('change', function () { mapOpts.radar = this.checked; refreshSidebar(); });
    $('chkStairs').addEventListener('change', function () { mapOpts.stairs = this.checked; refreshSidebar(); });
  }

  var SOURCE = [
    ['main.c', 'Startup, the main game loop (playit), quit and leave'],
    ['command.c', 'Every key you press is dispatched here'],
    ['new_level.c', 'Builds each level and places stairs, traps and monsters'],
    ['rooms.c', 'Room layout and the 3x3 grid of rooms'],
    ['passages.c', 'Corridors between rooms and secret doors'],
    ['fight.c', 'Combat: to-hit rolls, damage and special monster attacks'],
    ['chase.c', 'Monster movement and chasing the player'],
    ['monsters.c', 'Monster creation and waking up'],
    ['potions.c', 'What each potion does'],
    ['scrolls.c', 'What each scroll does, including magic mapping'],
    ['rings.c', 'Ring effects and hunger from rings'],
    ['sticks.c', 'Wands and staves'],
    ['things.c', 'Item naming and the inventory display'],
    ['extern.c', 'Monster stats and item probability tables used in the Reference tab'],
    ['daemons.c', 'Hunger, healing and other timed effects'],
    ['save.c', 'Save and restore'],
    ['rip.c', 'The tombstone and the score list']
  ];

  var CODE_MUSEUM = 'https://pataltimore.github.io/code-museum/#/rogue';

  function setupCode() {
    $('codeList').innerHTML = SOURCE.map(function (s) {
      var slug = s[0].replace(/\./g, '-');
      return '<li><a href="' + CODE_MUSEUM + '/' + slug + '" target="_blank" rel="noopener">' + s[0] + '</a> ' + escapeHtml(s[1]) + '</li>';
    }).join('') +
      '<li><a href="https://github.com/PatAltimore/rogue-assist" target="_blank" rel="noopener">engine/shim</a> The curses replacement and the browser hooks (assist.c) used by this page</li>';
  }

  // ------------------------------------------------------------------ tabs

  var activeTab = 'status';

  function selectTab(name) {
    activeTab = name;
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) {
      p.classList.toggle('active', p.id === 'panel-' + name);
    });
    refreshSidebar();
  }

  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) selectTab(b.dataset.tab);
  });

  var lastState = null;

  // The 3D panel under the text screen. It only does work while it is open.
  var view3dOpen = store.get('rogue-3d', '1') === '1';

  var terr = {}, terrLevel = -1;
  var seenKills = 0;
  function checkKills() {
    var n = call('kill_count');
    if (n < seenKills) seenKills = 0;
    var live = view3dActive() && window.View3D && View3D.isOk();
    for (var i = Math.max(seenKills, n - 8); live && i < n; i++) {
      View3D.death(String.fromCharCode(call('kill_type', i)), call('kill_x', i), call('kill_y', i), call('kill_xp', i));
    }
    seenKills = n;
  }

  function update3d(s) {
    checkKills();
    if (!view3dActive() || !window.View3D || !View3D.isOk()) return;
    var grid = [];
    for (var y = 0; y < ROWS; y++) {
      var row = new Array(COLS);
      for (var x = 0; x < COLS; x++) row[x] = (y > 0 && y < ROWS - 1) ? call('cell', y, x) : 0;
      grid.push(row);
    }
    var monsters = s.seen.map(function (m) { return { ch: m.letter, x: m.x, y: m.y }; });
    if (mapOpts.radar) {
      monsters = [];
      var n = call('monster_count', 0);
      for (var i = 0; i < n; i++) {
        monsters.push({ ch: String.fromCharCode(call('monster_type', i, 0)), x: call('monster_x', i, 0), y: call('monster_y', i, 0), radar: true });
      }
    }
    // The hero, monsters and items cover the square they stand on, so remember which
    // squares are corridor and tell the 3D view (otherwise a corridor loses its walls there).
    if (terrLevel !== s.level) { terr = {}; terrLevel = s.level; }
    var corr = {};
    for (y = 1; y < ROWS - 1; y++) for (x = 0; x < COLS; x++) {
      var code = grid[y][x], k = y * 100 + x;
      if (!code) continue;
      if (code === 35) { terr[k] = 35; continue; }
      if ('.+|-%^'.indexOf(String.fromCharCode(code)) >= 0) { terr[k] = code; continue; }
      if (terr[k] === 35) { corr[k] = 1; continue; }
      if (terr[k] === undefined) {
        var pas = 0, other = 0;
        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {
          var nc = (grid[y + d[0]] || [])[x + d[1]] || 0;
          if (nc === 35) pas++; else if (nc === 46 || nc === 124 || nc === 45) other++;
        });
        if (pas && !other) corr[k] = 1;
      }
    }
    lastGrid = grid;
    View3D.update({
      corr: corr, grid: grid, hero: { x: s.heroX, y: s.heroY }, level: s.level, monsters: monsters,
      stairs: mapOpts.stairs && call('stairs_y') ? { x: call('stairs_x'), y: call('stairs_y') } : null
    });
  }

  function is3d() { return mode === '3d' || mode === 'walk'; }
  function view3dActive() { return is3d() || view3dOpen; }

  function setView3dOpen(open) {
    view3dOpen = open;
    store.set('rogue-3d', open ? '1' : '0');
    $('view3d').classList.toggle('collapsed', !open);
    $('btnView3d').textContent = open ? 'Hide' : 'Show 3D';
    $('btnView3d').setAttribute('aria-expanded', open);
    if (window.View3D) View3D.setVisible(view3dActive());
    if (view3dActive() && lastState) update3d(lastState);
  }

  // ---- main view: text (default) or 3D with the text screen as a pop-up ----

  var mode = store.get('rogue-mode', '2d') === '3d' ? '3d' : '2d';
  var hudLog = [];
  var hudTimer = null;

  // The text layer over the 3D views has its own setting for the overhead and walk views
  // (it is off by default in the first-person view, where it only gets in the way).
  function ovKey() { return mode === 'walk' ? 'rogue-text-opacity-walk' : 'rogue-text-opacity'; }

  function applyOv(save) {
    var ov = $('ovOpacity');
    if (!save) ov.value = store.get(ovKey(), mode === 'walk' ? '0' : '25');
    var v = ov.value / 100;
    $('gamePane').style.setProperty('--ov', String(v));
    $('gamePane').style.setProperty('--ov-menu', String(Math.max(v, 0.9)));
    if (save) store.set(ovKey(), ov.value);
  }

  function setMode(m) {
    if (m !== '2d' && !(window.View3D && View3D.isOk())) m = '2d';
    mode = m;
    cancelWalk();
    store.set('rogue-mode', m);
    var on3d = m !== '2d';
    $('gamePane').classList.toggle('mode-3d', on3d);
    $('gamePane').classList.toggle('mode-walk', m === 'walk');
    $('modeText').setAttribute('aria-pressed', m === '2d');
    $('mode3d').setAttribute('aria-pressed', m === '3d');
    $('modeWalk').setAttribute('aria-pressed', m === 'walk');
    $('ovLabel').hidden = !on3d;
    $('hudMsg').hidden = $('hudStatus').hidden = !on3d;
    if (window.View3D) { View3D.setView(m === 'walk' ? 'walk' : 'orbit'); View3D.setVisible(view3dActive()); }
    setWalkControls(m === 'walk');
    applyOv();
    syncTextOverlay(true);
    fitScreen();
    if (lastState) { update3d(lastState); updateHud(lastState); }
  }

  // In 3D mode the text screen shows only when the game wants more than a
  // command: a menu, the inventory, help, the tombstone, and so on.
  function needsText() {
    if (exited || !gameRunning || screenState.returnPrompt) return true;
    if (call('at_prompt')) return false;
    return !!call('text_overlay') || !screenState.mapMode;
  }

  var textShown = null;
  function syncTextOverlay(force) {
    if (!is3d()) { $('gamePane').classList.remove('needs-text'); textShown = null; return; }
    var show = needsText();
    if (show === textShown && !force) return;
    textShown = show;
    $('gamePane').classList.toggle('needs-text', show);
    fitScreen();
    renderScreen();
  }

  function row0Text() {
    var cells = screenState.cells;
    if (!cells) return '';
    var t = '';
    for (var c = 0; c < COLS; c++) { var ch = cells[c] & 0xff; t += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : ' '; }
    return t.replace(/\s+$/, '');
  }

  var moreTimer = 0;
  function updateHud(s) {
    if (!is3d()) return;
    var text = textShown ? '' : row0Text();
    var now = Date.now();
    if (text && (!hudLog.length || hudLog[hudLog.length - 1].text !== text)) {
      hudLog.push({ text: text, t: now });
      if (hudLog.length > 4) hudLog.shift();
    }
    var more = /--More--/.test(row0Text());
    var shown = hudLog.filter(function (m) { return now - m.t < 12000; });
    var html = shown.map(function (m, i) {
      var last = i === shown.length - 1;
      var t = escapeHtml(m.text.replace(/--More--/, '').trim());
      return t ? '<div class="hud-line' + (last ? '' : ' old') + '">' + t + '</div>' : '';
    }).join('');
    $('hudMsg').innerHTML = html;
    // The message stays in the log above, so --More-- is dismissed automatically after a moment.
    if (more && !moreTimer) {
      moreTimer = setTimeout(function () {
        moreTimer = 0;
        if (is3d() && gameRunning && !exited && /--More--/.test(row0Text())) sendKey(32);
      }, 450);
    }
    clearTimeout(hudTimer);
    if (shown.length) hudTimer = setTimeout(function () { if (lastState) updateHud(lastState); }, 12100);

    var pct = s.maxHp ? s.hp / s.maxHp : 1;
    var hunger = ['', 'Hungry', 'Weak', 'Faint'][s.hunger] || '';
    $('hudStatus').innerHTML = '<div class="hud-status">' +
      '<span class="' + (pct <= 0.3 ? 'low' : '') + '">HP ' + s.hp + '/' + s.maxHp + '</span>' +
      '<span>Lvl ' + s.level + '</span><span>Gold ' + s.gold + '</span><span>Arm ' + s.ac + '</span>' +
      '<span>Str ' + s.str + '</span><span title="Experience level and experience points">XP Lv ' + s.xpLevel + ' &middot; ' + s.xp + ' pts</span>' +
      (hunger ? '<span class="low">' + hunger + '</span>' : '') + '</div>';
  }

  function setupView3d() {
    var ok = window.View3D && View3D.init($('view3dStage'));
    if (!ok) {
      $('modeText').parentNode.hidden = true;
      Array.prototype.forEach.call(document.querySelectorAll('[data-v3]'), function (b) { b.hidden = true; });
      $('view3dHelp').hidden = true;
      $('btnView3d').hidden = true;
      document.querySelector('.viewmode').hidden = true;
      return;
    }
    document.querySelector('.view3d-tools').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v3]');
      if (b) View3D.command(b.dataset.v3);
    });
    $('btnView3d').addEventListener('click', function () { setView3dOpen(!view3dOpen); });
    setView3dOpen(view3dOpen);
    $('modeText').addEventListener('click', function () { setMode('2d'); });
    $('mode3d').addEventListener('click', function () { setMode('3d'); });
    $('modeWalk').addEventListener('click', function () { setMode('walk'); });
    // Animation always starts on; the button turns it off for this visit.
    var motionOn = true;
    function applyMotion() {
      View3D.setMotion(motionOn);
      document.documentElement.dataset.motion = motionOn ? 'on' : 'off';
      $('btnMotion').textContent = 'Motion: ' + (motionOn ? 'on' : 'off');
      $('btnMotion').setAttribute('aria-pressed', motionOn);
    }
    $('btnMotion').addEventListener('click', function () { motionOn = !motionOn; applyMotion(); });
    applyMotion();
    View3D.onTap(handleTap);
    $('ovOpacity').addEventListener('input', function () { applyOv(true); });
    setMode(mode);
  }
  function refreshSidebar() {
    if (!gameRunning) return;
    var before = lastState;
    lastState = readState();
    if (before && (before.heroX !== lastState.heroX || before.heroY !== lastState.heroY)) prevPos = { x: before.heroX, y: before.heroY };
    update3d(lastState);
    updateHud(lastState);
    if (activeTab === 'status') renderStatus(lastState);
    if (activeTab === 'map') renderMap(lastState);
    if (activeTab === 'ref') renderRef();
    var low = lastState.maxHp && lastState.hp / lastState.maxHp <= 0.3;
    var statusBtn = document.querySelector('#tabs button[data-tab="status"]');
    statusBtn.classList.toggle('alert', !!low || lastState.hunger >= 2);
  }

  function onWait() {
    $('overlay').hidden = true;
    renderScreen();
    syncTextOverlay();
    refreshSidebar();
    walkTick();
    var now = Date.now();
    if (now - lastSync > 15000) { lastSync = now; syncSaves(); }
  }

  // --------------------------------------------------------------- chrome

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    if (window.View3D) View3D.setTheme(t);
    $('btnTheme').textContent = t === 'retro' ? 'Modern' : 'Retro';
    store.set('rogue-theme', t);
    rowCache.fill(null);
    renderScreen();
    refreshSidebar();
  }

  function zoom(factor) {
    var z = Math.max(0.6, Math.min(2.5, (parseFloat(store.get("rogue-zoom", "1")) || 1) * factor));
    store.set('rogue-zoom', String(z));
    fitScreen();
  }

  function newGame() {
    if (!window.confirm('Discard any saved game and start a new one?')) return;
    try {
      if (Module.FS.analyzePath('/data/rogue.save').exists) Module.FS.unlink('/data/rogue.save');
      Module.FS.syncfs(false, function () { location.reload(); });
    } catch (e) { location.reload(); }
  }

  $('btnTheme').addEventListener('click', function () {
    setTheme(document.documentElement.dataset.theme === 'retro' ? 'modern' : 'retro');
  });
  $('btnSmaller').addEventListener('click', function () { zoom(1 / 1.15); });
  $('btnBigger').addEventListener('click', function () { zoom(1.15); });
  $('btnNew').addEventListener('click', newGame);
  $('btnReturn').addEventListener('click', function () { if (exited) $('btnOverlayNew').click(); else sendKey(10); });
  $('btnOverlayNew').addEventListener('click', function () {
    try { if (Module.FS.analyzePath('/data/rogue.save').exists) Module.FS.unlink('/data/rogue.save'); } catch (e) { /* none */ }
    Module.FS.syncfs(false, function () { location.reload(); });
  });
  $('btnSave').addEventListener('click', function () { sendKey(83); $('screen').focus(); });
  $('btnMenu').addEventListener('click', function () {
    var open = $('topActions').classList.toggle('open');
    this.setAttribute('aria-expanded', open);
  });
  // Controls in the game pane should not hold on to the keyboard after a click.
  $('gamePane').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) setTimeout(function () { b.blur(); }, 0);
  });
  $('refSearch').addEventListener('input', renderRef);
  $('screenWrap').addEventListener('click', function () { $('screen').focus(); });
  window.addEventListener('resize', function () { fitScreen(); refreshSidebar(); });
  window.addEventListener('beforeunload', syncSaves);

  setupView3d();
  setupHints();
  setupCheats();
  setupCode();
  renderRef();
  setTheme(store.get('rogue-theme', 'modern'));
  fitScreen();
  showOverlay('Loading the dungeon…', false);
})();
