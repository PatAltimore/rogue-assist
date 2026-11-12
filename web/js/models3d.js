/* Low-poly models for the 3D view, built from three.js primitives so there are
 * no model files to host. Each model is built once, then cloned (clones share
 * geometry and materials). Units: one map cell = 1; models face +z. */
window.Models3D = (function () {
  'use strict';

  var T, retro = false;
  var geoCache = {}, matCache = {}, protoCache = {};

  function init(THREE) { T = THREE; }

  function setTheme(theme) {
    retro = theme === 'retro';
    matCache = {};
    protoCache = {};
  }

  // Retro draws everything in shades of green, keeping each colour's brightness.
  function tone(hex) {
    if (!retro) return hex;
    var c = new T.Color(hex);
    var l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    return new T.Color(0.06 + 0.2 * l, 0.25 + 0.75 * l, 0.1 + 0.25 * l).getHex();
  }

  function mat(color, o) {
    var key = color + '|' + (o.e || 0) + '|' + (o.a === undefined ? 1 : o.a) + '|' + (o.t || '');
    if (!matCache[key]) {
      matCache[key] = new T.MeshLambertMaterial({
        color: tone(color), emissive: tone(o.e || 0), flatShading: !(o.t && MONTEX[o.t]),
        transparent: o.a !== undefined && o.a < 1, opacity: o.a === undefined ? 1 : o.a,
        side: o.dbl ? T.DoubleSide : T.FrontSide, map: o.t ? texture(o.t) : null
      });
      if (!o.e) matCache[key].emissive.set(0x000000);
    }
    return matCache[key];
  }


  // ---------------------------------------------------------------- textures
  // Grayscale, drawn on a canvas, so the palette colours (and the Retro green) tint them.
  var texCache = {};

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function grey(v) { v = Math.max(0, Math.min(255, Math.round(v))); return 'rgb(' + v + ',' + v + ',' + v + ')'; }

  // Fine grain over everything already drawn.
  function grain(ctx, size, amount, rand) {
    var img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (rand() - 0.5) * amount;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }


  // ------------------------------------------------------- creature textures
  // Bigger (256px) grayscale skins: scales, fur, hide, cloth, ice, feathers, leaves, mist.
  var MONTEX = { scale: 1, fur: 1, hide: 1, cloth: 1, ice: 1, feather: 1, leaf: 1, ghost: 1 };

  // Calls fn at (x, y) and at the wrapped copies so a texture tiles without a seam.
  function wrapAt(S, x, y, ext, fn) {
    for (var dx = -S; dx <= S; dx += S) for (var dy = -S; dy <= S; dy += S) {
      var px = x + dx, py = y + dy;
      if (px > -ext && px < S + ext && py > -ext && py < S + ext) fn(px, py);
    }
  }

  function drawCreatureTexture(kind) {
    var S = 256, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d'), r = rng(kind.length * 131 + kind.charCodeAt(0) * 7), i, x, y;
    if (kind === 'scale') { // overlapping rows of scales
      g.fillStyle = grey(110); g.fillRect(0, 0, S, S);
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
        var sx = x * 16 + (y % 2) * 8, sy = y * 16, v = 175 + r() * 70;
        wrapAt(S, sx, sy, 14, function (px, py) {
          g.fillStyle = grey(v); g.beginPath(); g.arc(px, py, 11, 0, 6.3); g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.arc(px, py, 10.5, 0.1, 3.05); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.4; g.beginPath(); g.arc(px, py, 8, 3.4, 5.9); g.stroke();
        });
      }
      grain(g, S, 26, r);
    } else if (kind === 'fur') { // dense strokes, hanging down
      g.fillStyle = grey(170); g.fillRect(0, 0, S, S);
      for (i = 0; i < 3200; i++) {
        var fx = r() * S, fy = r() * S, a = (r() - 0.5) * 0.7, len = 9 + r() * 12, fv = 85 + r() * 170;
        g.strokeStyle = 'rgba(' + [fv, fv, fv].map(Math.round).join(',') + ',0.6)'; g.lineWidth = 1 + r() * 1.3;
        wrapAt(S, fx, fy, 24, function (px, py) { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(a) * len, py + Math.cos(a) * len); g.stroke(); });
      }
      grain(g, S, 20, r);
    } else if (kind === 'hide') { // leathery skin with wrinkles and pores
      g.fillStyle = grey(205); g.fillRect(0, 0, S, S);
      for (i = 0; i < 60; i++) {
        var bx = r() * S, by = r() * S, br = 20 + r() * 40, dark = r() < 0.55;
        wrapAt(S, bx, by, br, function (px, py) { g.fillStyle = dark ? 'rgba(40,30,25,' + (0.06 + r() * 0.1) + ')' : 'rgba(255,255,255,0.1)'; g.beginPath(); g.ellipse(px, py, br, br * (0.5 + r() * 0.5), r() * 3, 0, 6.3); g.fill(); });
      }
      for (i = 0; i < 90; i++) {
        var wx = r() * S, wy = r() * S, dx = (r() - 0.5) * 40, dy = (r() - 0.5) * 24;
        wrapAt(S, wx, wy, 40, function (px, py) { g.strokeStyle = 'rgba(40,25,20,' + (0.18 + r() * 0.2) + ')'; g.lineWidth = 1 + r(); g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + dx * 0.5, py - 6, px + dx, py + dy); g.stroke(); });
      }
      for (i = 0; i < 380; i++) { g.fillStyle = 'rgba(40,25,20,0.28)'; g.fillRect(r() * S, r() * S, 1.5, 1.5); }
      grain(g, S, 34, r);
    } else if (kind === 'cloth') { // woven cloth with soft folds
      for (x = 0; x < S; x++) {
        var cv = 205 + 26 * Math.sin(x / S * 6.2832 * 5) + 12 * Math.sin(x / S * 6.2832 * 13 + 1);
        g.fillStyle = grey(cv); g.fillRect(x, 0, 1, S);
      }
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (y = 0; y < S; y += 3) g.fillRect(0, y, S, 1);
      for (x = 0; x < S; x += 3) g.fillRect(x, 0, 1, S);
      for (i = 0; i < 24; i++) { g.strokeStyle = 'rgba(0,0,0,0.1)'; g.lineWidth = 1; var tx = r() * S; g.beginPath(); g.moveTo(tx, 0); g.lineTo(tx + 30, S); g.stroke(); }
      grain(g, S, 22, r);
    } else if (kind === 'ice') { // cracked crystal facets
      g.fillStyle = grey(225); g.fillRect(0, 0, S, S);
      for (i = 0; i < 34; i++) {
        var ix = r() * S, iy = r() * S, p1 = [r() * 70 - 35, r() * 70 - 35], p2 = [r() * 70 - 35, r() * 70 - 35], light = r() < 0.5;
        wrapAt(S, ix, iy, 40, function (px, py) { g.fillStyle = light ? 'rgba(255,255,255,0.3)' : 'rgba(80,120,160,0.22)'; g.beginPath(); g.moveTo(px, py); g.lineTo(px + p1[0], py + p1[1]); g.lineTo(px + p2[0], py + p2[1]); g.fill(); });
      }
      for (i = 0; i < 16; i++) {
        var kx = r() * S, ky = r() * S, path = [];
        for (var q = 0; q < 4; q++) path.push([(r() - 0.5) * 40, (r() - 0.5) * 40]);
        wrapAt(S, kx, ky, 90, function (px, py) {
          g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(px, py);
          var ax = px, ay = py; path.forEach(function (d) { ax += d[0]; ay += d[1]; g.lineTo(ax, ay); }); g.stroke();
          g.strokeStyle = 'rgba(40,70,100,0.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(px + 1, py + 1);
          ax = px + 1; ay = py + 1; path.forEach(function (d) { ax += d[0]; ay += d[1]; g.lineTo(ax, ay); }); g.stroke();
        });
      }
      grain(g, S, 12, r);
    } else if (kind === 'feather') { // rows of feathers
      g.fillStyle = grey(120); g.fillRect(0, 0, S, S);
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
        var ex = x * 16 + (y % 2) * 8, ey = y * 16, ev = 160 + r() * 90;
        wrapAt(S, ex, ey, 14, function (px, py) {
          g.fillStyle = grey(ev); g.beginPath(); g.ellipse(px, py + 6, 9, 13, 0, 0, 6.3); g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.beginPath(); g.ellipse(px, py + 6, 9, 13, 0, 0.3, 2.8); g.stroke();
          g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(px, py - 5); g.lineTo(px, py + 17); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath();
          for (var b = 0; b < 4; b++) { g.moveTo(px, py + b * 4); g.lineTo(px - 6, py + b * 4 + 5); g.moveTo(px, py + b * 4); g.lineTo(px + 6, py + b * 4 + 5); }
          g.stroke();
        });
      }
      grain(g, S, 20, r);
    } else if (kind === 'leaf') { // veined, mottled leaf
      g.fillStyle = grey(195); g.fillRect(0, 0, S, S);
      for (i = 0; i < 50; i++) { var lx = r() * S, ly = r() * S, lr = 12 + r() * 28; wrapAt(S, lx, ly, lr, function (px, py) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (0.05 + r() * 0.1) + ')'; g.beginPath(); g.arc(px, py, lr, 0, 6.3); g.fill(); }); }
      for (x = 0; x < 4; x++) {
        var mx = x * 64 + 32;
        g.strokeStyle = 'rgba(30,50,20,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, S); g.stroke();
        g.lineWidth = 1.3;
        for (y = 0; y < S; y += 16) { g.beginPath(); g.moveTo(mx, y); g.lineTo(mx - 26, y + 18); g.moveTo(mx, y); g.lineTo(mx + 26, y + 18); g.stroke(); }
      }
      grain(g, S, 16, r);
    } else { // 'ghost': drifting mist
      g.fillStyle = grey(240); g.fillRect(0, 0, S, S);
      for (i = 0; i < 70; i++) { var gx = r() * S, gy = r() * S, gr = 20 + r() * 50; wrapAt(S, gx, gy, gr, function (px, py) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '120,130,150' : '255,255,255') + ',' + (0.06 + r() * 0.1) + ')'; g.beginPath(); g.ellipse(px, py, gr, gr * 0.5, r() * 3, 0, 6.3); g.fill(); }); }
      for (i = 0; i < 12; i++) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; var wy2 = r() * S; g.beginPath(); for (x = 0; x <= S; x += 8) g.lineTo(x, wy2 + Math.sin(x / S * 6.2832 * 2 + i) * 10); g.stroke(); }
      grain(g, S, 8, r);
    }
    return c;
  }

  function drawTexture(kind) {
    if (MONTEX[kind]) return drawCreatureTexture(kind);
    var S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d'), r = rng(kind.length * 97 + kind.charCodeAt(0)), i, x, y;
    if (kind === 'stone') { // brick courses
      g.fillStyle = grey(95); g.fillRect(0, 0, S, S);
      for (y = 0; y < 4; y++) {
        for (x = -(y % 2) * 32; x < S; x += 64) {
          var v = 175 + r() * 60;
          g.fillStyle = grey(v); g.fillRect(x + 2, y * 32 + 2, 60, 28);
          g.fillStyle = grey(v + 28); g.fillRect(x + 2, y * 32 + 2, 60, 2);
          g.fillStyle = grey(v - 34); g.fillRect(x + 2, y * 32 + 28, 60, 2);
          for (i = 0; i < 5; i++) { g.fillStyle = grey(v - 20 + r() * 40); g.fillRect(x + 4 + r() * 52, y * 32 + 5 + r() * 20, 2 + r() * 6, 2 + r() * 4); }
        }
      }
      grain(g, S, 30, r);
    } else if (kind === 'flag') { // flagstones with cracks
      g.fillStyle = grey(90); g.fillRect(0, 0, S, S);
      var cuts = [[0, 0, 70, 58], [70, 0, 58, 70], [0, 58, 52, 70], [52, 70, 76, 58], [52, 58, 18, 12]];
      cuts.forEach(function (s) {
        var v2 = 190 + r() * 45;
        g.fillStyle = grey(v2); g.fillRect(s[0] + 2, s[1] + 2, s[2] - 4, s[3] - 4);
        g.fillStyle = grey(v2 + 22); g.fillRect(s[0] + 2, s[1] + 2, s[2] - 4, 2);
        for (i = 0; i < 4; i++) { g.fillStyle = grey(v2 - 25 + r() * 20); g.fillRect(s[0] + 6 + r() * (s[2] - 16), s[1] + 6 + r() * (s[3] - 16), 3 + r() * 8, 1 + r() * 2); }
      });
      g.strokeStyle = 'rgba(40,40,40,0.55)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(18, 14); g.lineTo(32, 30); g.lineTo(30, 46); g.moveTo(96, 90); g.lineTo(106, 104); g.lineTo(118, 108); g.stroke();
      grain(g, S, 26, r);
    } else if (kind === 'dirt') { // packed earth and pebbles
      g.fillStyle = grey(175); g.fillRect(0, 0, S, S);
      for (i = 0; i < 90; i++) { g.fillStyle = grey(120 + r() * 110); g.beginPath(); g.ellipse(r() * S, r() * S, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, 6.3); g.fill(); }
      for (i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,50,40,0.25)'; g.fillRect(r() * S, r() * S, 6 + r() * 14, 1 + r() * 2); }
      grain(g, S, 44, r);
    } else if (kind === 'wood') { // vertical planks with grain and nails
      for (x = 0; x < 4; x++) {
        var w = 150 + r() * 60;
        g.fillStyle = grey(w); g.fillRect(x * 32, 0, 32, S);
        for (i = 0; i < 9; i++) {
          g.strokeStyle = 'rgba(40,25,10,' + (0.12 + r() * 0.22) + ')'; g.lineWidth = 1 + r();
          var gx = x * 32 + 3 + r() * 26;
          g.beginPath(); g.moveTo(gx, 0);
          for (y = 16; y <= S; y += 16) g.lineTo(gx + (r() - 0.5) * 5, y);
          g.stroke();
        }
        g.fillStyle = 'rgba(30,18,8,0.55)'; g.fillRect(x * 32, 0, 2, S);
        g.fillStyle = grey(70); g.beginPath(); g.arc(x * 32 + 16, 9, 2.2, 0, 6.3); g.arc(x * 32 + 16, S - 9, 2.2, 0, 6.3); g.fill();
      }
      g.fillStyle = 'rgba(25,15,8,0.5)'; g.fillRect(0, 30, S, 5); g.fillRect(0, 92, S, 5); // cross braces
      grain(g, S, 22, r);
    } else if (kind === 'rock') { // rough cave wall
      g.fillStyle = grey(150); g.fillRect(0, 0, S, S);
      for (i = 0; i < 160; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '0,0,0') + ',' + (0.06 + r() * 0.16) + ')'; g.beginPath(); g.ellipse(r() * S, r() * S, 4 + r() * 16, 3 + r() * 12, r() * 3, 0, 6.3); g.fill(); }
      grain(g, S, 52, r);
    } else { // 'ceil': dark slabs
      g.fillStyle = grey(110); g.fillRect(0, 0, S, S);
      for (y = 0; y < 2; y++) for (x = 0; x < 2; x++) { g.fillStyle = grey(150 + r() * 70); g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
      grain(g, S, 34, r);
    }
    return c;
  }

  // A shared canvas texture; with repeat counts you get a copy that tiles that often.
  function texture(kind, rx, ry) {
    if (!texCache[kind]) {
      var t = new T.CanvasTexture(drawTexture(kind));
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.anisotropy = 4;
      texCache[kind] = t;
    }
    if (!rx) return texCache[kind];
    var copy = texCache[kind].clone();
    copy.needsUpdate = true;
    copy.repeat.set(rx, ry || rx);
    return copy;
  }

  function geo(kind, a, b, c) {
    var key = kind + [a, b, c].join(',');
    if (!geoCache[key]) {
      switch (kind) {
        case 's': geoCache[key] = new T.SphereGeometry(a, 14, 10); break;
        case 'h': geoCache[key] = new T.SphereGeometry(a, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); break; // dome
        case 'b': geoCache[key] = new T.BoxGeometry(a, b, c); break;
        case 'c': geoCache[key] = new T.CylinderGeometry(a, b, c, 9); break; // top radius, bottom radius, height
        case 'k': geoCache[key] = new T.ConeGeometry(a, b, 8); break;
        case 'o': geoCache[key] = new T.OctahedronGeometry(a); break;
        case 't': geoCache[key] = new T.TorusGeometry(a, b, 7, 14); break;
        case 'w': geoCache[key] = wingGeometry(a, b); break;
      }
    }
    return geoCache[key];
  }

  // A scalloped membrane wing, root at the origin, reaching out along +x.
  function wingGeometry(span, chord) {
    var g = new T.BufferGeometry(), c = chord;
    var A = [0, 0, c / 2], B = [0, 0, -c / 2];
    var P = [[span * 0.5, 0.04, c * 0.45], [span, 0.06, 0], [span * 0.82, 0.03, -c * 0.45], [span * 0.5, 0.01, -c * 0.55]];
    var ring = [A].concat(P, [B]), v = [], uv = [];
    function tri(p, q, r) { [p, q, r].forEach(function (k) { v.push(k[0], k[1], k[2]); uv.push(k[0] / span, k[2] / c + 0.5); }); }
    for (var i = 1; i < ring.length - 1; i++) tri(ring[0], ring[i], ring[i + 1]);
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(v), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    g.computeVertexNormals();
    return g;
  }

  // add(group, geometry, colour, {p: position, r: rotation, s: scale, e: emissive, a: opacity, n: name})
  function add(g, geometry, color, o) {
    o = o || {};
    if (curTex && o.t === undefined && o.e !== color && color !== BONE && color !== DARK && color !== 0x2a0508) { o = Object.assign({}, o); o.t = curTex; }
    var m = new T.Mesh(geometry, mat(color, o));
    if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
    if (o.n) m.name = o.n;
    g.add(m);
    return m;
  }

  function pivot(g, name, x, y, z) {
    var p = new T.Group();
    p.name = name;
    p.position.set(x, y, z);
    g.add(p);
    return p;
  }

  function shadow(g, r) {
    if (!geoCache.shadow) geoCache.shadow = new T.CircleGeometry(1, 18);
    var m = new T.Mesh(geoCache.shadow, mat(0x000000, { a: 0.35 }));
    m.material.depthWrite = false;
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.scale.set(r, r, r);
    m.name = 'shadow';
    g.add(m);
  }

  var BONE = 0xfff3d6, DARK = 0x160808;

  // Glowing eyes under slanted, angry brows.
  function eyes(g, y, z, spread, size, color, noBrow) {
    var c = color || 0xff3b2f;
    [-1, 1].forEach(function (s) {
      add(g, geo('s', size), c, { p: [s * spread, y, z], e: c });
      if (!noBrow) add(g, geo('b', size * 2.8, size * 0.8, size * 1.4), DARK, { p: [s * spread, y + size * 1.2, z + size * 0.3], r: [0.3, 0, s * 0.6] });
    });
  }

  // A dark open mouth with pointed teeth, facing +z.
  function maw(g, y, z, w, n) {
    add(g, geo('b', w, w * 0.45, 0.03), 0x2a0508, { p: [0, y, z], e: 0x200004 });
    n = n || 4;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1) - 0.5) * w * 0.8;
      add(g, geo('k', w * 0.08, w * 0.22), BONE, { p: [x, y + w * 0.11, z + 0.02], r: [Math.PI, 0, 0] });
      if (i < n - 1) add(g, geo('k', w * 0.07, w * 0.18), BONE, { p: [x + w * 0.13, y - w * 0.12, z + 0.02] });
    }
  }

  // Two long fangs hanging from the upper lip.
  function fangs(g, y, z, spread, len) {
    [-1, 1].forEach(function (s) { add(g, geo('k', len * 0.22, len), BONE, { p: [s * spread, y, z], r: [Math.PI, 0, 0] }); });
  }

  // Three claws pointing forward (+z) from a foot or paw.
  function claws(g, x, y, z, size) {
    [-1, 0, 1].forEach(function (k) {
      add(g, geo('k', size * 0.3, size), BONE, { p: [x + k * size * 0.5, y, z], r: [Math.PI / 2, 0, 0] });
    });
  }

  // ---------------------------------------------------------------- monsters

  var curTex = null; // while building a creature, every body part gets this skin

  function mixHex(a, b, k) {
    var x = new T.Color(a);
    return x.lerp(new T.Color(b), k).getHex();
  }

  // A cylinder laid between two points (for wing bones and similar).
  function strut(g, a, b, r, color) {
    var va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]);
    var d = vb.clone().sub(va), len = d.length();
    var m = add(g, geo('c', r * 0.7, r, len), color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] });
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return m;
  }

  // An arm on a shoulder pivot: shoulder, upper arm, elbow, forearm, fist and claws.
  // The 'elbow' pivot bends the forearm; the whole arm still swings from the shoulder.
  function arm(g, name, s, x, y, len, thick, color, rx, plain, bend) {
    var p = pivot(g, name, s * x, y, 0.02);
    var u = len * 0.5, f = len * 0.5;
    add(p, geo('s', thick * 0.78), color, { p: [0, 0, 0] });
    add(p, geo('c', thick * 0.55, thick * 0.45, u), color, { p: [0, -u / 2, 0] });
    add(p, geo('s', thick * 0.5), color, { p: [0, -u, 0] });
    var el = pivot(p, 'elbow', 0, -u, 0);
    el.rotation.x = bend || 0;
    add(el, geo('c', thick * 0.47, thick * 0.36, f), color, { p: [0, -f / 2, 0] });
    add(el, geo('s', thick * 0.55), color, { p: [0, -f - 0.01, 0.01], s: [1, 0.9, 1.1] });
    if (!plain) [-1, 0, 1].forEach(function (k) {
      add(el, geo('k', thick * 0.2, 0.12), BONE, { p: [k * thick * 0.32, -f - 0.1, 0.02], r: [Math.PI - 0.2, 0, 0] });
    });
    p.rotation.set(rx, 0, s * 0.2);
    return p;
  }

  // ---------------------------------------------------------------- humanoids

  function humanoid(c, o) {
    var g = new T.Group(), w = o.w || 1, skin = o.skin || c;
    var h = o.h || 1, eyeC = o.eye || 0xff3b2f;
    var hy = o.robe || o.ghost ? 1.0 : 0.95, hz = o.hunch ? 0.12 : 0.02;
    var armR, T1 = o.tex || null, T2 = o.skinTex || T1, hk = o.hunch ? 1 : 0;
    curTex = o.ghost ? 'ghost' : T1;
    if (o.ghost) {
      add(g, geo('k', 0.32, 0.95), c, { p: [0, 0.47, 0], a: 0.72, e: o.glow || 0 });
      [0, 1, 2, 3, 4].forEach(function (i) { // ragged hem
        var a = i / 5 * Math.PI * 2;
        add(g, geo('k', 0.07, 0.3), c, { p: [Math.cos(a) * 0.27, 0.08, Math.sin(a) * 0.27], r: [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15], a: 0.6, e: o.glow || 0 });
      });
      add(g, geo('s', 0.18), c, { p: [0, 0.98, 0.02], a: 0.8, e: o.glow || 0 });
      if (o.hood) add(g, geo('k', 0.25, 0.42), o.hood, { p: [0, 1.08, -0.04], r: [-0.25, 0, 0] });
      eyes(g, 1.0, 0.17, 0.065, 0.04, eyeC);
      add(g, geo('s', 0.06), 0x050208, { p: [0, 0.89, 0.16], s: [1, 1.5, 0.6] }); // a howling mouth
      [-1, 1].forEach(function (s) {
        var p = pivot(g, s < 0 ? 'armL' : 'armR', s * 0.2, 0.78, 0.02);
        add(p, geo('k', 0.07, 0.5), c, { p: [0, -0.22, 0], r: [Math.PI, 0, 0], a: 0.7, e: o.glow || 0 });
        [-1, 0, 1, 2].forEach(function (k) { add(p, geo('k', 0.012, 0.15), BONE, { p: [k * 0.025 - 0.0125, -0.5, 0], r: [Math.PI, 0, 0] }); });
        p.rotation.set(-1.25, 0, s * 0.35);
      });
      g.userData.style = 'float';
    } else {
      if (o.robe) {
        add(g, geo('k', 0.3 * w, 0.75), c, { p: [0, 0.38, 0] });
        add(g, geo('t', 0.27 * w, 0.025), shadeHex(c, 0.7), { p: [0, 0.06, 0], r: [Math.PI / 2, 0, 0] }); // hem
        add(g, geo('c', 0.15, 0.2, 0.3), c, { p: [0, 0.8, 0] });
        add(g, geo('t', 0.16, 0.02), 0xd9b84e, { p: [0, 0.62, 0], r: [Math.PI / 2, 0, 0] });                // sash
      } else {
        [-1, 1].forEach(function (s) {
          var lx = s * 0.13 * w, lc = o.legs || c;
          // The hero's legs hang from hip pivots so they can swing when walking.
          var par = o.friendly ? pivot(g, s < 0 ? 'legL' : 'legR', lx, 0.4, 0) : g, ox = o.friendly ? 0 : lx, oy = o.friendly ? 0.4 : 0;
          add(par, geo('c', 0.085 * w, 0.07 * w, 0.22), lc, { p: [ox, 0.3 - oy, 0.0] });                              // thigh
          add(par, geo('s', 0.07 * w), lc, { p: [ox, 0.2 - oy, 0.015] });                                             // knee
          add(par, geo('c', 0.065 * w, 0.05 * w, 0.2), lc, { p: [ox, 0.1 - oy, -0.01], r: [-0.12, 0, 0] });           // shin
          add(par, geo('b', 0.1 * w, 0.05, 0.17 * w), lc, { p: [ox, 0.03 - oy, 0.06] });                              // foot
          if (!o.friendly) claws(g, lx, 0.03, 0.15, 0.07 * w);
        });
        add(g, geo('s', 0.17 * w), c, { p: [0, 0.47, 0.01], s: [1.1, 0.8, 0.85] });                            // hips
        add(g, geo('c', 0.19 * w, 0.15 * w, 0.3), c, { p: [0, 0.63, 0.04 * hk], r: [0.1 + 0.2 * hk, 0, 0] }); // torso
        add(g, geo('s', 0.2 * w), c, { p: [0, 0.75, 0.01 + 0.07 * hk], s: [1.15, 0.8, 0.8] });                 // chest
        add(g, geo('t', 0.15 * w, 0.022), 0x3a2410, { p: [0, 0.52, 0.01], r: [Math.PI / 2, 0, 0], s: [1.05, 0.85, 1] }); // belt
        if (!o.friendly) add(g, geo('b', 0.14 * w, 0.17, 0.02), shadeHex(c, 0.65), { p: [0, 0.4, 0.15 * w] }); // loincloth
      }
      curTex = T2;
      [-1, 1].forEach(function (s) { add(g, geo('s', 0.085 * w), o.robe ? c : skin, { p: [s * 0.25 * w, 0.8, 0.03 + 0.05 * hk] }); });
      add(g, geo('c', 0.06, 0.075, 0.12), skin, { p: [0, 0.88, hz - 0.03] });                                    // neck
      add(g, geo('s', 0.16 * w), skin, { p: [0, hy, hz], s: [1, 1.05, 1.02] });                                  // skull
      eyes(g, hy + 0.03, hz + 0.13 * w, 0.065 * w, 0.032 * w, eyeC, o.friendly);
      if (!o.friendly) {
        add(g, geo('b', 0.21 * w, 0.045 * w, 0.1 * w), shadeHex(skin, 0.8), { p: [0, hy + 0.08 * w, hz + 0.115 * w], r: [0.2, 0, 0] }); // brow ridge
        add(g, geo('k', 0.028 * w, 0.075 * w), skin, { p: [0, hy - 0.01 * w, hz + 0.165 * w], r: [Math.PI / 2 + 0.2, 0, 0] });         // nose
        add(g, geo('b', 0.17 * w, 0.06 * w, 0.1 * w), skin, { p: [0, hy - 0.125 * w, hz + 0.07 * w] });                                // jaw
        [-1, 1].forEach(function (s) { add(g, geo('k', 0.04 * w, 0.13 * w), skin, { p: [s * 0.16 * w, hy + 0.02, hz - 0.01], r: [0, 0, -s * 1.15] }); }); // pointed ears
        maw(g, hy - 0.07 * w, hz + 0.14 * w, 0.17 * w, o.teeth || 4);
      }
      var guard = o.friendly ? 0 : (o.armsFwd ? -1.5 : (o.robe ? -0.9 : -1.05));
      arm(g, 'armL', -1, 0.26 * w, 0.78, 0.4, 0.09 * w, skin, guard, o.friendly, o.friendly ? 0 : -0.8);
      armR = arm(g, 'armR', 1, 0.26 * w, 0.78, 0.4, 0.09 * w, skin, guard + (o.club ? -0.5 : 0), o.friendly, o.friendly || o.club ? 0 : -0.8);
    }
    curTex = T1;
    if (o.horns) [-1, 1].forEach(function (s) {
      add(g, geo('k', 0.05, 0.26), BONE, { p: [s * 0.11 * w, hy + 0.2 * w, hz], r: [0.2, 0, -s * 0.5] });
      add(g, geo('k', 0.035, 0.16), BONE, { p: [s * 0.15 * w, hy + 0.12 * w, hz - 0.04], r: [0.1, 0, -s * 0.9] });
    });
    if (o.spikes) [-1, 1].forEach(function (s) {
      [0, 1].forEach(function (k) { add(g, geo('k', 0.04, 0.2), BONE, { p: [s * (0.2 + k * 0.08) * w, 0.9 - k * 0.04, -0.02], r: [0, 0, -s * (0.4 + k * 0.5)] }); });
    });
    if (o.club && armR) {
      add(armR, geo('c', 0.035, 0.03, 0.5), 0x5a3a1c, { p: [0, -0.36, 0.2], r: [Math.PI / 2, 0, 0], t: 'wood' });
      add(armR, geo('s', 0.1), 0x3a2a1a, { p: [0, -0.36, 0.46], t: 'wood' });
      [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1]].forEach(function (d) {
        add(armR, geo('k', 0.03, 0.12), BONE, { p: [d[0] * 0.11, -0.36 + d[1] * 0.11, 0.46 + d[2] * 0.11], r: [d[2] ? Math.PI / 2 : (d[1] < 0 ? Math.PI : 0), 0, d[0] ? -d[0] * Math.PI / 2 : 0] });
      });
    }
    if (o.cape) {
      add(g, geo('b', 0.5, 0.62, 0.04), o.cape, { p: [0, 0.55, -0.16], r: [0.15, 0, 0] });
      if (!o.friendly) [-1, 1].forEach(function (s) { add(g, geo('k', 0.1, 0.3), o.cape, { p: [s * 0.2, 1.02, -0.1], r: [0, 0, -s * 0.5] }); }); // a high collar
    }
    if (o.hat) {
      add(g, geo('k', 0.13, 0.28), o.hat, { p: [0, hy + 0.27, 0.02], r: [0, 0, 0.25] });
      add(g, geo('c', 0.2, 0.2, 0.03), o.hat, { p: [0, hy + 0.12, 0.02] });
    }
    if (o.hair) [-0.12, 0, 0.12].forEach(function (x) { add(g, geo('c', 0.03, 0.05, 0.45), o.hair, { p: [x, hy - 0.2, -0.12] }); });
    if (o.snakes) for (var i = 0; i < 7; i++) {
      var a = i / 7 * Math.PI * 2;
      add(g, geo('c', 0.02, 0.035, 0.22), 0x2c7a2c, { p: [Math.cos(a) * 0.15, hy + 0.2, Math.sin(a) * 0.13 + 0.02], r: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6] });
      add(g, geo('s', 0.04), 0x2c7a2c, { p: [Math.cos(a) * 0.22, hy + 0.31, Math.sin(a) * 0.19 + 0.02], e: 0x103010 });
      add(g, geo('s', 0.014), 0xff3b2f, { p: [Math.cos(a) * 0.24, hy + 0.32, Math.sin(a) * 0.21 + 0.04], e: 0xff3b2f });
    }
    if (o.bag) add(g, geo('s', 0.1), 0xf4d03f, { p: [0.2, 0.3, 0.1], e: 0x5a4a10 });
    if (o.fang) fangs(g, hy - 0.1 * w, hz + 0.16 * w, 0.045 * w, 0.11 * w);
    if (o.fur) [[-0.15, 0.7], [0.15, 0.7], [0, 0.4], [0.2, 0.5], [-0.2, 0.5], [0, 0.78], [-0.24, 0.85], [0.24, 0.85], [0, 1.1]].forEach(function (f) { add(g, geo('o', 0.1), c, { p: [f[0], f[1], 0.12 + (f[1] > 1 ? 0.04 : 0)], s: [1, 1.3, 1] }); });
    if (o.cube) add(g, geo('b', 0.24, 0.24, 0.24), o.cube, { p: [0, hy + 0.22, hz], r: [0.4, 0.6, 0], e: 0x301860 });
    curTex = null;
    g.scale.set(h, h, h);
    g.userData.h = (o.ghost ? 1.15 : 1.1) * h + 0.25;
    shadow(g, 0.4);
    return g;
  }

  // ---------------------------------------------------------------- four-legged

  function quadruped(c, o) {
    var g = new T.Group(), L = o.long || 0.5, lc = o.legs || c;
    curTex = o.tex || null;
    var bodyY = o.bird ? 0.62 : 0.5, legH = o.bird ? 0.6 : 0.4;
    add(g, geo('s', 0.3), c, { p: [0, bodyY, 0], s: [0.9, 0.8, L / 0.3 * 0.9] });                      // barrel
    add(g, geo('s', 0.24), c, { p: [0, bodyY + 0.04, L * 0.35], s: [1, 1.05, 1] });                    // chest
    add(g, geo('s', 0.23), c, { p: [0, bodyY + 0.02, -L * 0.4] });                                      // haunches
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      if (o.bird && q[1] === 1) return;
      var lx = q[0] * 0.15, lz = q[1] * L * 0.55;
      add(g, geo('s', 0.1), lc, { p: [lx, legH * 0.85, lz], s: [0.9, 1.3, 1.2] });                    // shoulder / thigh
      add(g, geo('c', 0.06, 0.045, legH * 0.55), lc, { p: [lx, legH * 0.45, lz + (q[1] < 0 ? 0.025 : -0.015)], r: [q[1] < 0 ? -0.25 : 0.1, 0, 0] });
      add(g, geo('s', 0.05), lc, { p: [lx, legH * 0.2, lz] });
      add(g, geo('s', 0.06), lc, { p: [lx, 0.04, lz + 0.04], s: [1, 0.55, 1.5] });                      // paw
      claws(g, lx, 0.03, lz + 0.1, 0.07);
    });
    if (o.bird) [-1, 1].forEach(function (s) {
      add(g, geo('c', 0.04, 0.05, legH), 0x8a7048, { p: [s * 0.1, legH / 2, 0.02] });
      add(g, geo('s', 0.045), 0x8a7048, { p: [s * 0.1, legH * 0.55, 0.03] });
      claws(g, s * 0.1, 0.03, 0.1, 0.09);
    });
    var neckH = o.bird ? 0.5 : 0.25;
    var nz = L * 0.55;
    add(g, geo('c', 0.07, 0.1, neckH), c, { p: [0, bodyY + neckH / 2, nz], r: [0.5, 0, 0] });
    var hz = nz + 0.12, hy = bodyY + neckH + 0.02, hc = o.head || c;
    add(g, geo('s', 0.11), hc, { p: [0, hy, hz - 0.03], s: [1, 1, 1.2] });                              // skull
    add(g, geo('b', 0.1, 0.085, 0.16), hc, { p: [0, hy - 0.03, hz + 0.1] });                            // snout
    [-1, 1].forEach(function (s) {
      add(g, geo('k', 0.035, 0.11), hc, { p: [s * 0.07, hy + 0.12, hz - 0.07], r: [-0.2, 0, -s * 0.25] }); // ears
      add(g, geo('s', 0.014), DARK, { p: [s * 0.03, hy - 0.01, hz + 0.18] });                              // nostrils
    });
    eyes(g, hy + 0.05, hz + 0.07, 0.065, 0.028, o.eye || 0xff3b2f);
    if (o.beak) {
      add(g, geo('k', 0.06, 0.24), 0xf2b134, { p: [0, hy - 0.02, hz + 0.22], r: [Math.PI / 2, 0, 0] });
      add(g, geo('k', 0.03, 0.1), 0xc98a14, { p: [0, hy - 0.07, hz + 0.32], r: [Math.PI, 0, 0] }); // hooked tip
    } else {
      maw(g, hy - 0.05, hz + 0.185, 0.12, 4);
    }
    if (o.horn) add(g, geo('k', 0.04, 0.42), o.horn, { p: [0, hy + 0.24, hz + 0.1], r: [0.6, 0, 0], e: o.horn === 0xffffff ? 0x555555 : 0 });
    if (o.torso) { // centaur: human upper body with a spear
      var tz = L * 0.45;
      add(g, geo('c', 0.17, 0.13, 0.36), 0xc99a70, { p: [0, bodyY + 0.42, tz] });
      add(g, geo('s', 0.18), 0xc99a70, { p: [0, bodyY + 0.58, tz], s: [1.1, 0.8, 0.8] });
      add(g, geo('s', 0.13), 0xc99a70, { p: [0, bodyY + 0.76, tz] });
      eyes(g, bodyY + 0.79, tz + 0.11, 0.05, 0.025, 0xff3b2f);
      maw(g, bodyY + 0.7, tz + 0.12, 0.12, 3);
      arm(g, 'armL', -1, 0.2, bodyY + 0.62, 0.34, 0.07, 0xc99a70, -1.0, false, -0.7).position.z = tz;
      var ar = arm(g, 'armR', 1, 0.2, bodyY + 0.62, 0.34, 0.07, 0xc99a70, -1.3, false, 0);
      ar.position.z = tz;
      add(ar, geo('c', 0.018, 0.018, 0.9), 0x5a3a1c, { p: [0, -0.3, 0.15], r: [Math.PI / 2, 0, 0], t: 'wood' });
      add(ar, geo('k', 0.05, 0.18), 0xd8dde6, { p: [0, -0.3, 0.68], r: [Math.PI / 2, 0, 0] });
    }
    if (o.stripes) for (var i = -2; i <= 2; i++) add(g, geo('b', 0.5, 0.5, 0.05), 0x161616, { p: [0, bodyY, i * 0.2], s: [0.98, 0.8, 1] });
    if (o.mane) for (var m = 0; m < 6; m++) add(g, geo('k', 0.06, 0.22), o.mane, { p: [0, bodyY + 0.34 - m * 0.04, nz - m * 0.1], r: [-0.4, 0, 0] });
    var tail = pivot(g, 'tail', 0, bodyY + 0.05, -L * 0.6);
    [0, 1, 2].forEach(function (k) { add(tail, geo('s', 0.07 - k * 0.018), o.tail || c, { p: [0, 0.04 + k * 0.05, -0.1 - k * 0.12] }); });
    add(tail, geo('k', 0.05, 0.2), o.tail || c, { p: [0, 0.14, -0.42], r: [-2, 0, 0] });
    if (o.wings) addWings(g, o.wings, 0.6, 0.5, bodyY + 0.22, 0);
    curTex = null;
    g.scale.set(o.sc || 1, o.sc || 1, o.sc || 1);
    g.userData.h = (hy + 0.35) * (o.sc || 1);
    shadow(g, 0.45);
    return g;
  }

  // A membrane wing: leading arm, three finger bones, and the skin stretched between.
  function addWings(g, color, span, chord, y, z) {
    [-1, 1].forEach(function (s) {
      var p = pivot(g, s < 0 ? 'wingL' : 'wingR', s * 0.1, y, z);
      var w = add(p, geo('w', span, chord), color, { dbl: true });
      w.scale.x = s;
      var bone = shadeHex(color, 0.55);
      strut(p, [0, 0.01, chord * 0.45], [s * span * 0.5, 0.04, chord * 0.45], 0.022, bone);
      [[1, 0.06, 0], [0.82, 0.03, -0.45], [0.5, 0.01, -0.55]].forEach(function (t) {
        strut(p, [s * span * 0.5, 0.04, chord * 0.45], [s * span * t[0], t[1], chord * t[2]], 0.013, bone);
      });
      add(p, geo('k', 0.025, 0.12), BONE, { p: [s * span * 0.5, 0.05, chord * 0.48], r: [Math.PI / 2, 0, 0] }); // thumb claw
    });
  }

  // A snake reared up to strike.
  function serpent(c, o) {
    var g = new T.Group();
    curTex = 'scale';
    var ctl = [[0, 0.56, 0.3], [0, 0.42, 0.2], [0, 0.27, 0.14], [0.08, 0.13, 0.05], [0.2, 0.1, -0.12], [0.08, 0.09, -0.3], [-0.14, 0.08, -0.42], [-0.2, 0.07, -0.6]];
    var pts = [], i;
    for (i = 0; i < ctl.length - 1; i++) {
      pts.push(ctl[i]);
      pts.push([(ctl[i][0] + ctl[i + 1][0]) / 2, (ctl[i][1] + ctl[i + 1][1]) / 2, (ctl[i][2] + ctl[i + 1][2]) / 2]);
    }
    pts.push(ctl[ctl.length - 1]);
    var belly = mixHex(c, 0xf0e0b0, 0.55);
    pts.forEach(function (p, k) {
      var t = k / (pts.length - 1), rad = k === 0 ? 0.12 : 0.115 - t * 0.085;
      add(g, geo('s', rad), c, { p: p, s: k === 0 ? [1, 0.8, 1.3] : [1, 1, 1] });
      if (k > 0) add(g, geo('s', rad * 0.8), belly, { p: [p[0], p[1] - rad * 0.4, p[2]], s: [0.8, 0.45, 1] });
      if (o.stripe && k % 3 === 1) add(g, geo('s', rad * 1.02), 0x2a1c08, { p: [p[0], p[1] + rad * 0.3, p[2]], s: [0.95, 0.5, 0.7] });
    });
    if (o.hood) {
      add(g, geo('s', 0.14), c, { p: [0, 0.46, 0.17], s: [1.7, 1.5, 0.22] });
      add(g, geo('s', 0.05), 0x1a1208, { p: [0, 0.48, 0.2], s: [1.8, 1.1, 0.3] }); // the spectacle mark
    }
    add(g, geo('s', 0.09), c, { p: [0, 0.57, 0.42], s: [1.1, 0.7, 1.5] });   // snout
    eyes(g, 0.61, 0.4, 0.065, 0.03, 0xffd23c);
    add(g, geo('b', 0.16, 0.05, 0.03), 0x2a0508, { p: [0, 0.52, 0.45] });
    fangs(g, 0.5, 0.45, 0.05, 0.12);
    [-1, 1].forEach(function (s) { add(g, geo('b', 0.012, 0.012, 0.1), 0xd22c2c, { p: [s * 0.02, 0.5, 0.58], r: [0, s * 0.4, 0], e: 0x701010 }); }); // forked tongue
    add(g, geo('b', 0.012, 0.012, 0.1), 0xd22c2c, { p: [0, 0.5, 0.5], e: 0x701010 });
    if (o.rattle) {
      var tail = pivot(g, 'tail', -0.2, 0.07, -0.6);
      [0, 1, 2, 3].forEach(function (k) { add(tail, geo('s', 0.055 - k * 0.008), 0xe7d38a, { p: [0, 0.08 + k * 0.06, -0.02], s: [1, 0.7, 1] }); });
    }
    curTex = null;
    g.userData.h = 0.8;
    g.userData.style = 'slither';
    shadow(g, 0.45);
    return g;
  }

  function flyer(c, o) {
    var g = new T.Group(), by = 0.75;
    curTex = o.tex || null;
    add(g, geo('s', 0.16), c, { p: [0, by, 0], s: [0.9, 0.9, 1.3] });
    add(g, geo('s', 0.13), mixHex(c, 0xffffff, 0.25), { p: [0, by - 0.03, 0.08], s: [0.9, 0.8, 1] });  // chest
    add(g, geo('s', 0.11), o.head || c, { p: [0, by + 0.06, 0.2] });
    eyes(g, by + 0.1, 0.29, 0.05, 0.026, 0xff2a1f);
    if (o.beak) {
      add(g, geo('k', 0.035, 0.13), 0xf2b134, { p: [0, by + 0.04, 0.33], r: [Math.PI / 2, 0, 0] });
      add(g, geo('k', 0.02, 0.06), 0xc98a14, { p: [0, by + 0.01, 0.38], r: [Math.PI, 0, 0] });
      [-1, 1].forEach(function (s) { add(g, geo('k', 0.03, 0.12), c, { p: [s * 0.05, by + 0.16, 0.14], r: [-0.4, 0, -s * 0.2] }); }); // crest
    } else {
      [-1, 1].forEach(function (s) { add(g, geo('k', 0.045, 0.2), c, { p: [s * 0.07, by + 0.22, 0.17], r: [-0.1, 0, -s * 0.25] }); }); // ears
      add(g, geo('b', 0.1, 0.04, 0.02), 0x2a0508, { p: [0, by + 0.01, 0.3] });
      fangs(g, by - 0.02, 0.3, 0.03, 0.08);
      add(g, geo('k', 0.025, 0.05), 0x2a0508, { p: [0, by + 0.07, 0.3], r: [Math.PI / 2, 0, 0] });    // snub nose
    }
    [-1, 1].forEach(function (s) {
      add(g, geo('c', 0.025, 0.03, 0.12), 0x4a3a2a, { p: [s * 0.06, by - 0.12, 0.02] });
      claws(g, s * 0.06, by - 0.19, 0.04, 0.07);
    });
    add(g, geo('k', 0.07, 0.22), c, { p: [0, by - 0.02, -0.3], r: [-Math.PI / 2, 0, 0] });              // tail
    addWings(g, o.wing || c, o.span || 0.55, 0.32, by + 0.04, 0);
    curTex = null;
    g.userData.h = by + 0.4;
    g.userData.flies = 1;
    g.userData.style = 'fly';
    shadow(g, 0.3);
    return g;
  }

  function dragon(c, o) {
    var g = new T.Group();
    curTex = 'scale';
    var cream = mixHex(c, 0xf0d9a0, 0.6), sp = o.spike || BONE;
    add(g, geo('s', 0.3), c, { p: [0, 0.5, 0], s: [1, 0.85, 1.6] });
    add(g, geo('s', 0.26), cream, { p: [0, 0.4, 0.05], s: [0.78, 0.65, 1.5] });                          // belly plates
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      var lx = q[0] * 0.22, lz = q[1] * 0.28;
      add(g, geo('s', 0.13), c, { p: [lx, 0.36, lz], s: [0.9, 1.2, 1.3] });                              // thigh
      add(g, geo('c', 0.07, 0.05, 0.26), c, { p: [lx, 0.16, lz + (q[1] > 0 ? 0.02 : -0.03)], r: [q[1] > 0 ? 0.15 : -0.3, 0, 0] });
      add(g, geo('s', 0.07), c, { p: [lx, 0.05, lz + 0.05], s: [1, 0.55, 1.5] });
      claws(g, lx, 0.03, lz + 0.14, 0.1);
    });
    [[0, 0.64, 0.34, 0.15], [0, 0.78, 0.44, 0.125], [0, 0.92, 0.54, 0.11]].forEach(function (n) {
      add(g, geo('s', n[3]), c, { p: [n[0], n[1], n[2]] });
      add(g, geo('s', n[3] * 0.8), cream, { p: [n[0], n[1] - n[3] * 0.45, n[2] + 0.04], s: [0.7, 0.5, 1] });
    });
    add(g, geo('b', 0.22, 0.14, 0.34), c, { p: [0, 0.98, 0.6] });                                          // skull and upper jaw
    add(g, geo('s', 0.11), c, { p: [0, 0.98, 0.5], s: [1.1, 0.9, 1] });
    [-1, 1].forEach(function (s) {
      add(g, geo('b', 0.1, 0.04, 0.12), shadeHex(c, 0.6), { p: [s * 0.075, 1.09, 0.68], r: [0.2, 0, -s * 0.25] }); // brow ridge
      add(g, geo('s', 0.02), DARK, { p: [s * 0.04, 1.0, 0.78] });                                         // nostril
    });
    eyes(g, 1.04, 0.7, 0.085, 0.034, o.eye || 0xffd23c, true);
    for (var t = 0; t < 4; t++) [-1, 1].forEach(function (s) { add(g, geo('k', 0.018, 0.08), BONE, { p: [s * 0.085, 0.89, 0.5 + t * 0.07], r: [Math.PI, 0, 0] }); });
    var jaw = pivot(g, 'jaw', 0, 0.9, 0.45);
    add(jaw, geo('b', 0.18, 0.05, 0.3), shadeHex(c, 0.75), { p: [0, -0.03, 0.15] });
    add(jaw, geo('b', 0.14, 0.02, 0.26), 0x7a1018, { p: [0, 0.0, 0.15], e: 0x300408 });                   // tongue
    for (var u = 0; u < 3; u++) [-1, 1].forEach(function (s) { add(jaw, geo('k', 0.016, 0.07), BONE, { p: [s * 0.07, 0.03, 0.08 + u * 0.08] }); });
    jaw.rotation.x = 0.25;
    [-1, 1].forEach(function (s) {
      add(g, geo('k', 0.04, 0.32), BONE, { p: [s * 0.09, 1.16, 0.5], r: [-0.7, 0, s * 0.25] });
      add(g, geo('k', 0.025, 0.16), BONE, { p: [s * 0.13, 1.1, 0.58], r: [-0.3, 0, s * 0.8] });
    });
    var tail = pivot(g, 'tail', 0, 0.42, -0.36);
    for (var i = 0; i < 4; i++) add(tail, geo('s', 0.12 - i * 0.025), c, { p: [0, -i * 0.04, -0.1 - i * 0.2], s: [1, 0.9, 1.5] });
    add(tail, geo('k', 0.07, 0.16), sp, { p: [0, -0.1, -0.9], r: [-Math.PI / 2, 0, 0] });
    for (var j = 0; j < 7; j++) add(g, geo('k', 0.045, 0.16), sp, { p: [0, 0.9 - j * 0.04, 0.3 - j * 0.14] });
    if (o.wing) addWings(g, o.wing, 0.95, 0.65, 0.7, 0);
    if (o.fire) add(jaw, geo('k', 0.07, 0.28), 0xff8a2a, { p: [0, 0.05, 0.42], r: [Math.PI / 2, 0, 0], e: 0xff6a00, a: 0.8 });
    curTex = null;
    g.scale.set(o.sc || 1.25, o.sc || 1.25, o.sc || 1.25);
    g.userData.h = 1.6 * (o.sc || 1.25);
    shadow(g, 0.6);
    return g;
  }

  function shadeHex(hex, k) {
    var c = new T.Color(hex);
    c.multiplyScalar(k);
    return c.getHex();
  }

  function aquator(c) {
    var g = new T.Group();
    curTex = 'scale';
    add(g, geo('h', 0.4), c, { p: [0, 0.12, 0], s: [1, 0.95, 1.1] });
    add(g, geo('t', 0.36, 0.04), 0x8a4a1a, { p: [0, 0.14, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.1, 1] });
    [[0, 0.5, 0], [0.18, 0.4, 0.1], [-0.18, 0.4, 0.1], [0.12, 0.4, -0.2], [-0.12, 0.4, -0.2]].forEach(function (s) {
      add(g, geo('k', 0.05, 0.2), 0xc77a3a, { p: [s[0], s[1], s[2]], r: [s[2] * 1.5, 0, -s[0] * 2] });
    });
    add(g, geo('s', 0.16), 0x4fb8ae, { p: [0, 0.24, 0.44] });
    eyes(g, 0.31, 0.55, 0.075, 0.034, 0xffd23c);
    maw(g, 0.2, 0.585, 0.18, 4);
    [[-1, 0.28], [1, 0.28], [-1, -0.25], [1, -0.25]].forEach(function (f) {
      add(g, geo('b', 0.18, 0.05, 0.14), 0x4fb8ae, { p: [f[0] * 0.4, 0.06, f[1]], r: [0, f[0] * 0.4, 0] });
      claws(g, f[0] * 0.44, 0.05, f[1] + 0.1, 0.08);
    });
    curTex = null;
    g.userData.h = 0.85;
    shadow(g, 0.5);
    return g;
  }

  function iceMonster(c) {
    var g = new T.Group();
    curTex = 'ice';
    [[0, 0.6, 0, 0.3, 1.4], [-0.22, 0.4, 0.1, 0.18, 1.2], [0.24, 0.35, -0.05, 0.2, 1.1], [0.05, 0.3, 0.25, 0.15, 1.0], [-0.1, 0.32, -0.22, 0.17, 1.0]].forEach(function (k) {
      add(g, geo('o', k[3]), c, { p: [k[0], k[1], k[2]], s: [1, k[4], 1], a: 0.88, e: 0x2a5a80 });
    });
    [[-0.2, 0.95, 0, 0.5], [0.2, 0.9, 0, -0.5], [0, 1.05, -0.05, 0]].forEach(function (s) {
      add(g, geo('k', 0.06, 0.3), 0xe6f6ff, { p: [s[0], s[1], s[2]], r: [0, 0, s[3]], a: 0.9, e: 0x3a6a90 });
    });
    eyes(g, 0.68, 0.22, 0.09, 0.04, 0xbff4ff);
    maw(g, 0.52, 0.27, 0.2, 5);
    [-1, 1].forEach(function (s) {
      var p = pivot(g, s < 0 ? 'armL' : 'armR', s * 0.3, 0.6, 0.05);
      add(p, geo('o', 0.1), c, { p: [0, -0.15, 0], s: [1, 2, 1], a: 0.88, e: 0x2a5a80 });
      add(p, geo('k', 0.05, 0.22), 0xe6f6ff, { p: [0, -0.42, 0], r: [Math.PI, 0, 0], e: 0x3a6a90 });
      p.rotation.set(-1.0, 0, s * 0.3);
    });
    curTex = null;
    g.userData.h = 1.3;
    shadow(g, 0.4);
    return g;
  }

  function flytrap(c) {
    var g = new T.Group();
    curTex = 'leaf';
    add(g, geo('c', 0.05, 0.08, 0.5), 0x1f6a2c, { p: [0, 0.25, 0] });
    [-1, 1].forEach(function (s) {
      var v = pivot(g, s < 0 ? 'armL' : 'armR', s * 0.06, 0.2, 0);
      add(v, geo('c', 0.02, 0.035, 0.5), 0x1f6a2c, { p: [0, -0.22, 0] });
      add(v, geo('k', 0.035, 0.14), 0x7a1a3a, { p: [0, -0.52, 0], r: [Math.PI, 0, 0] });
      v.rotation.set(-1.9, 0, s * 0.7);
    });
    // lower jaw (fixed) and upper jaw (hinged, so it can snap)
    add(g, geo('h', 0.28), c, { p: [0, 0.55, 0.06], r: [Math.PI - 0.25, 0, 0] });
    add(g, geo('s', 0.2), 0xb0224f, { p: [0, 0.53, 0.06], s: [1, 0.35, 1], e: 0x50081c });
    for (var i = -2; i <= 2; i++) add(g, geo('k', 0.028, 0.13), BONE, { p: [i * 0.09, 0.6, 0.3 - Math.abs(i) * 0.03] });
    var jaw = pivot(g, 'jaw', 0, 0.58, -0.18);
    add(jaw, geo('h', 0.28), c, { p: [0, 0, 0.24] });
    add(jaw, geo('s', 0.2), 0xb0224f, { p: [0, 0.01, 0.24], s: [1, 0.3, 1], e: 0x50081c });
    for (var j = -2; j <= 2; j++) add(jaw, geo('k', 0.028, 0.13), BONE, { p: [j * 0.09 + 0.045, -0.04, 0.48 - Math.abs(j) * 0.03], r: [Math.PI, 0, 0] });
    jaw.rotation.x = -0.75;
    curTex = null;
    g.userData.h = 1.1;
    g.userData.style = 'plant';
    shadow(g, 0.4);
    return g;
  }

  var MONSTERS = {
    A: [aquator, 0x1f8f88],
    B: [flyer, 0x4a2f6a, { span: 0.65, tex: 'fur' }],
    C: [quadruped, 0x9a5e28, { torso: true, long: 0.6, mane: 0x2a1a0c, tail: 0x2a1a0c, tex: 'fur' }],
    D: [dragon, 0xc22a1c, { wing: 0x7a140c, fire: true }],
    E: [quadruped, 0x8a744e, { bird: true, long: 0.3, beak: true, sc: 0.95, tex: 'feather' }],
    F: [flytrap, 0x2f8f3d],
    G: [quadruped, 0xc9922f, { wings: 0xd9c98a, beak: true, head: 0xe6e0d0, long: 0.55, sc: 1.15, tex: 'feather' }],
    H: [humanoid, 0xa5521e, { w: 1.2, h: 0.9, club: true, hunch: true, horns: true, tex: 'hide', skinTex: 'hide' }],
    I: [iceMonster, 0x9fd8ff],
    J: [dragon, 0x6a2f90, { sc: 1.35, spike: 0xd9c3f2, eye: 0xff3030 }],
    K: [flyer, 0x8a5a2a, { head: 0xb99a6a, beak: true, span: 0.5, tex: 'feather' }],
    L: [humanoid, 0x2a9a3a, { h: 0.65, hat: 0x146a22, bag: true, skin: 0xc99a70, teeth: 5, tex: 'cloth', skinTex: 'hide' }],
    M: [humanoid, 0x4f9a4f, { snakes: true, skin: 0x6fbf6f, eye: 0xff2a2a, fang: true, tex: 'scale', skinTex: 'scale' }],
    N: [humanoid, 0xd88ab4, { robe: true, hair: 0x4a2a12, skin: 0xd0a480, eye: 0xff5ad0, tex: 'cloth', skinTex: 'hide' }],
    O: [humanoid, 0x5c7f3a, { w: 1.15, club: true, fang: true, spikes: true, tex: 'hide', skinTex: 'hide' }],
    P: [humanoid, 0xe6f0ff, { ghost: true, glow: 0x304060, eye: 0x7fe8ff }],
    Q: [quadruped, 0x7c6a4c, { stripes: true, long: 0.55, tex: 'fur' }],
    R: [serpent, 0x8a6b2d, { rattle: true, stripe: true }],
    S: [serpent, 0x3f904f, { hood: true }],
    T: [humanoid, 0x4a6a2a, { w: 1.5, h: 1.25, hunch: true, fang: true, club: true, spikes: true, horns: true, teeth: 5, tex: 'hide', skinTex: 'hide' }],
    U: [quadruped, 0x1c1c28, { horn: 0xffffff, mane: 0x6a6a90, tail: 0x6a6a90, long: 0.5, tex: 'fur' }],
    V: [humanoid, 0x2a2430, { cape: 0x7a1020, fang: true, eye: 0xff2020, skin: 0xe8e4f0, tex: 'cloth', skinTex: 'hide' }],
    W: [humanoid, 0x3a3f55, { ghost: true, glow: 0x101830, hood: 0x14161f, eye: 0xff2a1f }],
    X: [humanoid, 0x7b4cb6, { w: 1.3, h: 1.05, cube: 0xa88ce0, spikes: true, tex: 'hide', skinTex: 'hide' }],
    Y: [humanoid, 0xe6ecf5, { w: 1.4, h: 1.15, fur: true, hunch: true, fang: true, teeth: 5, tex: 'fur', skinTex: 'fur' }],
    Z: [humanoid, 0x6e7f5a, { armsFwd: true, hunch: true, eye: 0xff5030, skin: 0x8a9a6a, tex: 'hide', skinTex: 'hide' }]
  };

  // Builds a monster as { shadow, rig }: the rig holds the whole body so the
  // view can bounce, lean and squash it without moving the shadow.
  function monster(letter) {
    var key = 'm' + letter;
    if (!protoCache[key]) {
      var d = MONSTERS[letter];
      var g;
      if (d) g = d[0](d[1], d[2] || {});
      else {
        g = new T.Group();
        add(g, geo('k', 0.3, 0.9), 0xff5d5d, { p: [0, 0.45, 0] });
        eyes(g, 0.6, 0.2, 0.08, 0.04);
        g.userData.h = 1;
        shadow(g, 0.4);
      }
      var rig = new T.Group();
      rig.name = 'rig';
      g.children.slice().forEach(function (ch) { if (ch.name !== 'shadow') rig.add(ch); });
      g.add(rig);
      protoCache[key] = g;
    }
    return protoCache[key].clone();
  }

  // ------------------------------------------------------------------- items

  var POTION = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xdfe6ee];

  function item(ch, h) {
    var key = 'i' + ch + (ch === '!' ? Math.floor(h * POTION.length) : '');
    if (!protoCache[key]) {
      var g = new T.Group();
      switch (ch) {
        case '*':
          [[0, 0, 0.0], [0.13, 0.05, 0.08], [-0.1, 0.1, 0.1]].forEach(function (c, i) {
            add(g, geo('c', 0.14, 0.14, 0.05), 0xf4d03f, { p: [c[0], 0.03 + i * 0.05, c[1] * 0 + c[2]], e: 0x6a5410 });
          });
          add(g, geo('t', 0.13, 0.025), 0xffe680, { p: [0.05, 0.31, 0], r: [Math.PI / 2, 0, 0], e: 0x806a20 });
          break;
        case '!':
          add(g, geo('s', 0.2), 0xcfe8ff, { p: [0, 0.2, 0], a: 0.55, e: 0x203040 });
          add(g, geo('s', 0.15), POTION[Math.floor(h * POTION.length)], { p: [0, 0.17, 0], e: POTION[Math.floor(h * POTION.length)] & 0x3f3f3f });
          add(g, geo('c', 0.06, 0.07, 0.18), 0xcfe8ff, { p: [0, 0.44, 0], a: 0.55 });
          add(g, geo('c', 0.06, 0.05, 0.07), 0x8a5a2a, { p: [0, 0.57, 0] });
          break;
        case '?':
          add(g, geo('c', 0.07, 0.07, 0.42), 0xf3e9c6, { p: [0, 0.1, 0], r: [0, 0, Math.PI / 2] });
          [-1, 1].forEach(function (s) { add(g, geo('c', 0.085, 0.085, 0.03), 0xc9a45a, { p: [s * 0.21, 0.1, 0], r: [0, 0, Math.PI / 2] }); });
          add(g, geo('c', 0.075, 0.075, 0.05), 0xc0392b, { p: [0, 0.1, 0], r: [0, 0, Math.PI / 2], e: 0x401008 });
          break;
        case ':':
          add(g, geo('b', 0.34, 0.16, 0.24), 0xb87a3a, { p: [0, 0.1, 0] });
          add(g, geo('h', 0.17), 0xd9a45a, { p: [0, 0.17, 0], s: [1, 0.5, 0.7] });
          add(g, geo('b', 0.04, 0.17, 0.26), 0x7a4a20, { p: [0, 0.1, 0] });
          break;
        case ')':
          add(g, geo('b', 0.06, 0.55, 0.015), 0xdfe6f0, { p: [0, 0.4, 0], e: 0x30343a });
          add(g, geo('k', 0.03, 0.1), 0xdfe6f0, { p: [0, 0.72, 0] });
          add(g, geo('b', 0.22, 0.04, 0.05), 0xc9a45a, { p: [0, 0.12, 0] });
          add(g, geo('c', 0.025, 0.025, 0.13), 0x6a3a1a, { p: [0, 0.03, 0] });
          add(g, geo('s', 0.035), 0xc9a45a, { p: [0, -0.04, 0] });
          g.rotation.z = 0.5;
          break;
        case ']':
          add(g, geo('b', 0.34, 0.36, 0.18), 0x7f9cc4, { p: [0, 0.3, 0], e: 0x14202e });
          [-1, 1].forEach(function (s) { add(g, geo('s', 0.1), 0x9ab5d8, { p: [s * 0.2, 0.46, 0] }); });
          add(g, geo('b', 0.08, 0.3, 0.2), 0xc9a45a, { p: [0, 0.3, 0] });
          break;
        case '=':
          add(g, geo('t', 0.16, 0.045), 0xf0c84a, { p: [0, 0.2, 0], r: [Math.PI / 2.4, 0, 0], e: 0x5a4410 });
          add(g, geo('o', 0.07), 0xb690ff, { p: [0, 0.36, 0.04], e: 0x7a50d0 });
          break;
        case '/':
          add(g, geo('c', 0.025, 0.03, 0.7), 0x8a5a2a, { p: [0, 0.4, 0] });
          add(g, geo('s', 0.07), 0xb690ff, { p: [0, 0.78, 0], e: 0x9a70ff });
          add(g, geo('t', 0.07, 0.015), 0xf0c84a, { p: [0, 0.7, 0], r: [Math.PI / 2, 0, 0] });
          g.rotation.z = 0.35;
          break;
        case ',':
          add(g, geo('t', 0.2, 0.015), 0xf0c84a, { p: [0, 0.38, 0], r: [0, 0, 0] });
          add(g, geo('o', 0.14), 0xff3a4a, { p: [0, 0.3, 0.02], s: [1, 1.4, 0.6], e: 0xc01020 });
          add(g, geo('t', 0.15, 0.025), 0xf0c84a, { p: [0, 0.3, 0.02] });
          break;
        default: return null;
      }
      shadow(g, 0.28);
      protoCache[key] = g;
    }
    return protoCache[key].clone();
  }

  function door(horizontal) {
    var key = 'door' + (horizontal ? 'h' : 'v');
    if (!protoCache[key]) {
      var g = new T.Group();
      add(g, geo('b', 0.8, 1.0, 0.16), 0xd0a064, { p: [0, 0.5, 0], e: 0x1a1008, t: 'wood' });
      [-1, 1].forEach(function (s) { add(g, geo('b', 0.12, 1.3, 0.24), 0x8a5a2a, { p: [s * 0.46, 0.65, 0], t: 'wood' }); });
      add(g, geo('b', 1.04, 0.16, 0.24), 0x8a5a2a, { p: [0, 1.22, 0], t: 'wood' });
      add(g, geo('s', 0.045), 0xf0c84a, { p: [0.26, 0.5, 0.1], e: 0x6a5410 });
      add(g, geo('b', 0.8, 0.04, 0.18), 0x3a2a14, { p: [0, 0.32, 0] });
      add(g, geo('b', 0.8, 0.04, 0.18), 0x3a2a14, { p: [0, 0.72, 0] });
      if (!horizontal) g.rotation.y = Math.PI / 2;
      var wrap = new T.Group();
      wrap.add(g);
      protoCache[key] = wrap;
    }
    return protoCache[key].clone();
  }

  // A straight flight of steps with side rails, and a bouncing arrow showing the way down.
  function stairs() {
    if (!protoCache.stairs) {
      var g = new T.Group(), n = 5;
      add(g, geo('b', 0.92, 0.04, 0.92), 0x15171f, { p: [0, 0.02, 0] });
      for (var i = 0; i < n; i++) {
        var top = 0.1 + i * 0.1;
        add(g, geo('b', 0.66, top, 0.15), i % 2 ? 0xd9b84e : 0xe6c35a, { p: [0, top / 2, 0.32 - i * 0.16], e: 0x3a3010 });
        add(g, geo('b', 0.66, 0.02, 0.03), 0xfff0b0, { p: [0, top + 0.005, 0.32 - i * 0.16 + 0.065] }); // the lit edge of each step
      }
      [-1, 1].forEach(function (s) {
        add(g, geo('b', 0.07, 0.62, 0.82), 0x8a7a50, { p: [s * 0.38, 0.28, -0.02] });
        add(g, geo('b', 0.07, 0.07, 0.82), 0xb8a468, { p: [s * 0.38, 0.62, -0.02] });
      });
      add(g, geo('k', 0.1, 0.22), 0xffe680, { p: [0, 0.95, 0.1], r: [Math.PI, 0, 0], e: 0x806a20, n: 'arrow' });
      protoCache.stairs = g;
    }
    return protoCache.stairs.clone();
  }

  function trap() {
    if (!protoCache.trap) {
      var g = new T.Group();
      add(g, geo('c', 0.36, 0.38, 0.05), 0x30333c, { p: [0, 0.025, 0] });
      var spikes = pivot(g, 'spikes', 0, 0, 0);
      [[0, 0], [0.15, 0.1], [-0.14, 0.08], [0.05, -0.17], [-0.1, -0.12]].forEach(function (s, i) {
        add(spikes, geo('k', 0.045, 0.28 - (i % 2) * 0.06), 0xd8dde6, { p: [s[0], 0.17, s[1]], e: 0x303438 });
      });
      add(g, geo('t', 0.34, 0.02), 0xff6b4a, { p: [0, 0.06, 0], r: [Math.PI / 2, 0, 0], e: 0xc03a20 });
      protoCache.trap = g;
    }
    return protoCache.trap.clone();
  }

  // The player: a small adventurer with a helmet, cape and sword.
  function hero() {
    var g = humanoid(0x4f7fd1, { w: 1.05, skin: 0xe0b48a, legs: 0x3a3f55, cape: 0xb02a2a, eye: 0x111111, friendly: true, tex: 'cloth', skinTex: 'hide' });
    add(g, geo('h', 0.17), 0xc9d1de, { p: [0, 0.97, 0.02] });
    add(g, geo('b', 0.04, 0.12, 0.04), 0xc9d1de, { p: [0, 0.95, 0.15] });
    add(g, geo('b', 0.05, 0.5, 0.012), 0xdfe6f0, { p: [0.3, 0.72, 0.18], r: [-0.4, 0, 0], e: 0x30343a });
    add(g, geo('b', 0.14, 0.03, 0.04), 0xc9a45a, { p: [0.3, 0.5, 0.1], r: [-0.4, 0, 0] });
    g.userData.h = 1.3;
    return g;
  }

  return { init: init, texture: texture, hero: hero, setTheme: setTheme, monster: monster, item: item, door: door, stairs: stairs, trap: trap };
})();
