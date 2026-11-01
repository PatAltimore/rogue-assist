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

  window.Module = {
    print: function () {},
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
    showOverlay('The game is over. Your save (if any) and the score list are kept in this browser.', true);
  }

  function showOverlay(text, withButton) {
    $('overlayText').textContent = text;
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
        var cls = (v & 0x100) ? 'so' : (retro ? '' : glyphClass(ch, rowMap));
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
    followCursor();
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
    // On a phone the whole 80 columns are too small to read, so keep a minimum
    // size and let the view scroll sideways to follow the cursor.
    var floor = window.innerWidth < 860 ? 10 : 6;
    var fs = Math.max(floor, Math.min(40, Math.round(fit * zoom)));
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

  var DIR_KEYS = { h: 1, j: 1, k: 1, l: 1, y: 1, u: 1, b: 1, n: 1 };

  function sendChar(ch) {
    if (runNext && DIR_KEYS[ch]) {
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
    if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    var arrow = { ArrowLeft: 'h', ArrowDown: 'j', ArrowUp: 'k', ArrowRight: 'l', Home: 'y', PageUp: 'u', End: 'b', PageDown: 'n' }[e.key];
    var handled = true;
    if (arrow) sendKey((e.shiftKey ? arrow.toUpperCase() : arrow).charCodeAt(0));
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
    if (!k) return;
    if (k === 'y_') sendKey(121);
    else if (k.length === 1) sendChar(k);
    else sendNamed(k);
    e.preventDefault();
  });

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
    if (pct <= 0.3) tip('warn', 'Health is low (' + s.hp + '/' + s.maxHp + '). Step back from the fight, quaff a known healing potion, or retreat to the stairs. Resting with s or . heals slowly.');
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
      cell('XP level', s.xpLevel) + cell('Hunger', hungerText) +
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

  var CHEATS = [
    [1, 'Heal', 'Full hit points'],
    [2, 'Feed', 'Not hungry any more'],
    [3, 'Restore strength', 'Back to your maximum'],
    [4, 'Raise level', 'One experience level'],
    [5, 'Descend', 'Jump to the next level'],
    [6, 'Ascend', 'Go up a level'],
    [7, 'Reveal map', 'Map the whole level'],
    [8, 'Identify all', 'Every potion, scroll, ring, wand'],
    [9, 'Add 500 gold', 'Straight to your purse']
  ];

  function setupCheats() {
    $('cheatGrid').innerHTML = CHEATS.map(function (c) {
      return '<button data-cheat="' + c[0] + '">' + c[1] + '<small>' + c[2] + '</small></button>';
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

  function setupCode() {
    $('codeList').innerHTML = SOURCE.map(function (s) {
      return '<li><a href="https://github.com/Davidslv/rogue/blob/main/' + s[0] + '" target="_blank" rel="noopener">' + s[0] + '</a> ' + escapeHtml(s[1]) + '</li>';
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
  function refreshSidebar() {
    if (!gameRunning) return;
    lastState = readState();
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
    refreshSidebar();
    var now = Date.now();
    if (now - lastSync > 15000) { lastSync = now; syncSaves(); }
  }

  // --------------------------------------------------------------- chrome

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    $('btnTheme').textContent = t === 'retro' ? 'Modern' : 'Retro';
    store.set('rogue-theme', t);
    rowCache.fill(null);
    renderScreen();
    refreshSidebar();
  }

  function zoom(delta) {
    var z = Math.max(0.6, Math.min(2, (parseFloat(store.get('rogue-zoom', '1')) || 1) + delta));
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
  $('btnSmaller').addEventListener('click', function () { zoom(-0.1); });
  $('btnBigger').addEventListener('click', function () { zoom(0.1); });
  $('btnNew').addEventListener('click', newGame);
  $('btnOverlayNew').addEventListener('click', function () {
    try { if (Module.FS.analyzePath('/data/rogue.save').exists) Module.FS.unlink('/data/rogue.save'); } catch (e) { /* none */ }
    Module.FS.syncfs(false, function () { location.reload(); });
  });
  $('btnSave').addEventListener('click', function () { sendKey(83); $('screen').focus(); });
  $('btnMenu').addEventListener('click', function () {
    var open = $('topActions').classList.toggle('open');
    this.setAttribute('aria-expanded', open);
  });
  $('refSearch').addEventListener('input', renderRef);
  $('screenWrap').addEventListener('click', function () { $('screen').focus(); });
  window.addEventListener('resize', function () { fitScreen(); refreshSidebar(); });
  window.addEventListener('beforeunload', syncSaves);

  setupHints();
  setupCheats();
  setupCode();
  renderRef();
  setTheme(store.get('rogue-theme', 'modern'));
  fitScreen();
  showOverlay('Loading the dungeon…', false);
})();
