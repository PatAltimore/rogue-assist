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
    var key = color + '|' + (o.e || 0) + '|' + (o.a === undefined ? 1 : o.a);
    if (!matCache[key]) {
      matCache[key] = new T.MeshLambertMaterial({
        color: tone(color), emissive: tone(o.e || 0), flatShading: true,
        transparent: o.a !== undefined && o.a < 1, opacity: o.a === undefined ? 1 : o.a,
        side: o.dbl ? T.DoubleSide : T.FrontSide
      });
      if (!o.e) matCache[key].emissive.set(0x000000);
    }
    return matCache[key];
  }

  function geo(kind, a, b, c) {
    var key = kind + [a, b, c].join(',');
    if (!geoCache[key]) {
      switch (kind) {
        case 's': geoCache[key] = new T.SphereGeometry(a, 10, 8); break;
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

  // A flat triangular wing, root at the origin, reaching out along +x.
  function wingGeometry(span, chord) {
    var g = new T.BufferGeometry();
    var v = new Float32Array([0, 0, chord / 2, 0, 0, -chord / 2, span, 0, -chord / 2 + chord * 0.1]);
    g.setAttribute('position', new T.BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }

  // add(group, geometry, colour, {p: position, r: rotation, s: scale, e: emissive, a: opacity, n: name})
  function add(g, geometry, color, o) {
    o = o || {};
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
    g.add(m);
  }

  function eyes(g, y, z, spread, size, color) {
    [-1, 1].forEach(function (s) {
      add(g, geo('s', size), color || 0xffffff, { p: [s * spread, y, z], e: color || 0xffffff });
    });
  }

  // ---------------------------------------------------------------- monsters

  function humanoid(c, o) {
    var g = new T.Group(), w = o.w || 1, skin = o.skin || c;
    var h = o.h || 1;
    if (o.ghost) {
      add(g, geo('k', 0.3, 0.9), c, { p: [0, 0.45, 0], a: 0.7, e: o.glow || 0 });
      add(g, geo('s', 0.17), c, { p: [0, 0.98, 0], a: 0.75, e: o.glow || 0 });
      eyes(g, 1.0, 0.14, 0.06, 0.035, 0x111111);
      [-1, 1].forEach(function (s) { add(g, geo('k', 0.07, 0.4), c, { p: [s * 0.28, 0.55, 0.05], r: [0, 0, s * 0.9], a: 0.6 }); });
    } else if (o.robe) {
      add(g, geo('k', 0.3 * w, 0.75), c, { p: [0, 0.38, 0] });
      add(g, geo('c', 0.13, 0.17, 0.3), c, { p: [0, 0.82, 0] });
    } else {
      [-1, 1].forEach(function (s) { add(g, geo('c', 0.09 * w, 0.1 * w, 0.36), o.legs || c, { p: [s * 0.11 * w, 0.18, 0] }); });
      add(g, geo('b', 0.36 * w, 0.42, 0.22 * w), c, { p: [0, 0.57, o.hunch ? 0.04 : 0], r: [o.hunch ? 0.35 : 0, 0, 0] });
    }
    var hy = o.robe || o.ghost ? 1.0 : 0.95;
    if (!o.ghost) {
      add(g, geo('s', 0.15 * w), skin, { p: [0, hy, o.hunch ? 0.1 : 0.02] });
      eyes(g, hy + 0.02, (o.hunch ? 0.1 : 0.02) + 0.12 * w, 0.06, 0.03, o.eye || 0xffe27a);
    }
    if (!o.ghost && !o.robe) {
      [-1, 1].forEach(function (s) {
        add(g, geo('b', 0.08 * w, 0.36, 0.08 * w), skin, o.armsFwd
          ? { p: [s * 0.25 * w, 0.62, 0.2], r: [-1.4, 0, 0] }
          : { p: [s * 0.25 * w, 0.55, 0.02], r: [0, 0, s * 0.12] });
      });
    }
    if (o.robe) [-1, 1].forEach(function (s) { add(g, geo('b', 0.07, 0.3, 0.07), skin, { p: [s * 0.2, 0.68, 0.06], r: [-0.5, 0, s * 0.3] }); });
    if (o.horns) [-1, 1].forEach(function (s) { add(g, geo('k', 0.04, 0.18), 0xeeeeee, { p: [s * 0.1, hy + 0.17, 0.02], r: [0, 0, -s * 0.4] }); });
    if (o.club) {
      add(g, geo('c', 0.05, 0.08, 0.5), 0x7a5230, { p: [0.3 * w, 0.62, 0.25], r: [-0.7, 0, 0.2] });
    }
    if (o.cape) add(g, geo('b', 0.46, 0.6, 0.04), o.cape, { p: [0, 0.55, -0.15], r: [0.15, 0, 0] });
    if (o.hat) {
      add(g, geo('k', 0.13, 0.28), o.hat, { p: [0, hy + 0.27, 0.02] });
      add(g, geo('c', 0.2, 0.2, 0.03), o.hat, { p: [0, hy + 0.12, 0.02] });
    }
    if (o.hair) [-0.12, 0, 0.12].forEach(function (x) { add(g, geo('c', 0.03, 0.05, 0.45), o.hair, { p: [x, hy - 0.2, -0.12] }); });
    if (o.snakes) for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2;
      add(g, geo('s', 0.045), 0x2c7a2c, { p: [Math.cos(a) * 0.16, hy + 0.14 + (i % 2) * 0.06, Math.sin(a) * 0.14 + 0.02], e: 0x103010 });
    }
    if (o.bag) add(g, geo('s', 0.1), 0xf4d03f, { p: [0.2, 0.3, 0.1], e: 0x5a4a10 });
    if (o.fang) [-1, 1].forEach(function (s) { add(g, geo('k', 0.012, 0.05), 0xffffff, { p: [s * 0.04, hy - 0.1, 0.15] }); });
    if (o.fur) [[-0.15, 0.7], [0.15, 0.7], [0, 0.4], [0.2, 0.5], [-0.2, 0.5]].forEach(function (f) { add(g, geo('o', 0.08), c, { p: [f[0], f[1], 0.12] }); });
    g.scale.set(h, h, h);
    g.userData.h = (o.ghost ? 1.15 : 1.1) * h + 0.25;
    shadow(g, 0.4 * h);
    return g;
  }

  function quadruped(c, o) {
    var g = new T.Group(), L = o.long || 0.5;
    var bodyY = o.bird ? 0.62 : 0.5, legH = o.bird ? 0.6 : 0.4;
    add(g, geo('s', 0.3), c, { p: [0, bodyY, 0], s: [0.9, o.bird ? 0.8 : 0.8, L / 0.3 * 0.9] });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      if (o.bird && q[1] === 1) return;
      add(g, geo('c', 0.05, 0.06, legH), o.legs || c, { p: [q[0] * 0.14, legH / 2, q[1] * L * 0.55] });
    });
    if (o.bird) [-1, 1].forEach(function (s) { add(g, geo('c', 0.04, 0.05, legH), 0x8a7048, { p: [s * 0.1, legH / 2, 0.02] }); });
    var neckH = o.bird ? 0.5 : 0.25;
    var nz = L * 0.55;
    add(g, geo('c', 0.07, 0.1, neckH), c, { p: [0, bodyY + neckH / 2, nz], r: [0.5, 0, 0] });
    var hz = nz + 0.12, hy = bodyY + neckH + 0.02;
    add(g, geo('b', 0.15, 0.15, 0.28), o.head || c, { p: [0, hy, hz] });
    eyes(g, hy + 0.04, hz + 0.1, 0.06, 0.025, 0x111111);
    if (o.beak) add(g, geo('k', 0.05, 0.2), 0xf2b134, { p: [0, hy - 0.02, hz + 0.2], r: [Math.PI / 2, 0, 0] });
    if (o.horn) add(g, geo('k', 0.035, 0.3), o.horn, { p: [0, hy + 0.2, hz + 0.08], r: [0.5, 0, 0], e: o.horn === 0xffffff ? 0x555555 : 0 });
    if (o.torso) { // centaur: human upper body
      add(g, geo('b', 0.3, 0.38, 0.2), 0xe0b48a, { p: [0, bodyY + 0.42, L * 0.45] });
      add(g, geo('s', 0.13), 0xe0b48a, { p: [0, bodyY + 0.76, L * 0.45] });
      add(g, geo('c', 0.02, 0.02, 0.5), 0x7a5230, { p: [0.22, bodyY + 0.5, L * 0.55], r: [0.2, 0, 0.4] });
    }
    if (o.stripes) for (var i = -2; i <= 2; i++) add(g, geo('b', 0.5, 0.5, 0.05), 0x222222, { p: [0, bodyY, i * 0.2], s: [0.98, 0.8, 1] });
    if (o.mane) add(g, geo('b', 0.06, 0.3, 0.28), o.mane, { p: [0, bodyY + 0.3, nz - 0.05], r: [0.5, 0, 0] });
    add(g, geo('k', 0.06, 0.4), o.tail || c, { p: [0, bodyY + 0.05, -L * 0.6], r: [-2, 0, 0] });
    if (o.wings) addWings(g, o.wings, 0.55, 0.45, bodyY + 0.22, 0);
    g.scale.set(o.sc || 1, o.sc || 1, o.sc || 1);
    g.userData.h = (hy + 0.35) * (o.sc || 1);
    shadow(g, 0.45 * (o.sc || 1));
    return g;
  }

  function addWings(g, color, span, chord, y, z) {
    [-1, 1].forEach(function (s) {
      var p = pivot(g, s < 0 ? 'wingL' : 'wingR', s * 0.1, y, z);
      var w = add(p, geo('w', span, chord), color, { dbl: true });
      w.scale.x = s;
    });
  }

  function serpent(c, o) {
    var g = new T.Group();
    for (var i = 0; i < 7; i++) {
      var r = i === 0 ? 0.13 : 0.12 - i * 0.012;
      add(g, geo('s', r), c, { p: [Math.sin(i * 1.0) * 0.2, 0.12 + (i === 0 ? 0.07 : 0), 0.38 - i * 0.16] });
    }
    eyes(g, 0.24, 0.5, 0.06, 0.028, 0xffe27a);
    add(g, geo('b', 0.015, 0.015, 0.12), 0xd22c2c, { p: [0, 0.17, 0.58], e: 0x701010 });
    if (o.rattle) [0, 1, 2].forEach(function (i) { add(g, geo('k', 0.05 - i * 0.01, 0.1), 0xe7d38a, { p: [Math.sin(6) * 0.2, 0.12, 0.38 - 6 * 0.16 - 0.08 - i * 0.07], r: [-Math.PI / 2, 0, 0] }); });
    if (o.stripe) [1, 3, 5].forEach(function (i) { add(g, geo('s', 0.11 - i * 0.012), 0x3a2a10, { p: [Math.sin(i * 1.0) * 0.2, 0.135, 0.38 - i * 0.16], s: [1, 0.6, 0.5] }); });
    g.userData.h = 0.5;
    shadow(g, 0.45);
    return g;
  }

  function flyer(c, o) {
    var g = new T.Group(), by = 0.75;
    add(g, geo('s', 0.15), c, { p: [0, by, 0], s: [0.9, 0.9, 1.3] });
    add(g, geo('s', 0.1), o.head || c, { p: [0, by + 0.06, 0.2] });
    eyes(g, by + 0.09, 0.28, 0.045, 0.022, 0xff4040);
    if (o.beak) add(g, geo('k', 0.03, 0.1), 0xf2b134, { p: [0, by + 0.04, 0.32], r: [Math.PI / 2, 0, 0] });
    else [-1, 1].forEach(function (s) { add(g, geo('k', 0.03, 0.1), c, { p: [s * 0.05, by + 0.16, 0.2] }); });
    add(g, geo('b', 0.1, 0.02, 0.2), c, { p: [0, by, -0.25] });
    addWings(g, o.wing || c, o.span || 0.55, 0.3, by + 0.04, 0);
    g.userData.h = by + 0.4;
    g.userData.flies = 1;
    shadow(g, 0.3);
    return g;
  }

  function dragon(c, o) {
    var g = new T.Group();
    add(g, geo('s', 0.3), c, { p: [0, 0.5, 0], s: [1, 0.85, 1.6] });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { add(g, geo('c', 0.07, 0.09, 0.3), c, { p: [q[0] * 0.2, 0.15, q[1] * 0.28] }); });
    add(g, geo('c', 0.09, 0.14, 0.4), c, { p: [0, 0.72, 0.4], r: [0.7, 0, 0] });
    add(g, geo('b', 0.2, 0.17, 0.3), c, { p: [0, 0.95, 0.58] });
    eyes(g, 1.0, 0.66, 0.07, 0.03, o.eye || 0xffd23c);
    [-1, 1].forEach(function (s) { add(g, geo('k', 0.035, 0.2), 0xefe6cf, { p: [s * 0.08, 1.12, 0.52], r: [-0.5, 0, s * 0.2] }); });
    for (var i = 0; i < 4; i++) add(g, geo('k', 0.1 - i * 0.02, 0.35), c, { p: [0, 0.4 - i * 0.04, -0.4 - i * 0.2], r: [-Math.PI / 2, 0, 0] });
    for (var j = 0; j < 4; j++) add(g, geo('k', 0.04, 0.12), o.spike || 0xefe6cf, { p: [0, 0.82 - j * 0.04, 0.15 - j * 0.18] });
    if (o.wing) addWings(g, o.wing, 0.9, 0.6, 0.7, 0);
    if (o.fire) add(g, geo('k', 0.08, 0.3), 0xff8a2a, { p: [0, 0.93, 0.85], r: [Math.PI / 2, 0, 0], e: 0xff6a00, a: 0.8 });
    g.scale.set(o.sc || 1.25, o.sc || 1.25, o.sc || 1.25);
    g.userData.h = 1.6 * (o.sc || 1.25);
    shadow(g, 0.65);
    return g;
  }

  function aquator(c) {
    var g = new T.Group();
    add(g, geo('h', 0.38), c, { p: [0, 0.12, 0], s: [1, 0.95, 1.1] });
    add(g, geo('t', 0.34, 0.04), 0xc77a3a, { p: [0, 0.14, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.1, 1] });
    add(g, geo('s', 0.14), 0x7fe0d8, { p: [0, 0.2, 0.42] });
    eyes(g, 0.26, 0.5, 0.07, 0.03, 0x111111);
    [[-1, 0.28], [1, 0.28], [-1, -0.25], [1, -0.25]].forEach(function (f) { add(g, geo('b', 0.18, 0.05, 0.14), 0x7fe0d8, { p: [f[0] * 0.38, 0.06, f[1]], r: [0, f[0] * 0.4, 0] }); });
    g.userData.h = 0.7;
    shadow(g, 0.5);
    return g;
  }

  function iceMonster(c) {
    var g = new T.Group();
    [[0, 0.6, 0, 0.3, 1.4], [-0.22, 0.4, 0.1, 0.18, 1.2], [0.24, 0.35, -0.05, 0.2, 1.1], [0.05, 0.3, 0.25, 0.15, 1.0], [-0.1, 0.32, -0.22, 0.17, 1.0]].forEach(function (k) {
      add(g, geo('o', k[3]), c, { p: [k[0], k[1], k[2]], s: [1, k[4], 1], a: 0.85, e: 0x2a5a80 });
    });
    eyes(g, 0.62, 0.2, 0.08, 0.035, 0x103050);
    g.userData.h = 1.1;
    shadow(g, 0.4);
    return g;
  }

  function flytrap(c) {
    var g = new T.Group();
    add(g, geo('c', 0.05, 0.07, 0.5), 0x2c8a3c, { p: [0, 0.25, 0] });
    [[-0.1, 0.2], [0.1, 0.2]].forEach(function (l) { add(g, geo('b', 0.3, 0.03, 0.12), 0x2c8a3c, { p: [l[0] * 2, 0.15, 0], r: [0, 0, l[0] * 4] }); });
    add(g, geo('h', 0.26), 0xd94a7a, { p: [0, 0.55, 0.04], r: [-0.9, 0, 0], e: 0x401020 });
    add(g, geo('h', 0.26), c, { p: [0, 0.55, 0.04], r: [0.9 + Math.PI, 0, 0] });
    for (var i = -2; i <= 2; i++) add(g, geo('k', 0.025, 0.1), 0xffffff, { p: [i * 0.08, 0.62, 0.26], r: [Math.PI, 0, 0] });
    g.userData.h = 0.95;
    shadow(g, 0.4);
    return g;
  }

  function xeroc(c) {
    var g = humanoid(c, { w: 1.3, h: 1.05, armsFwd: false, eye: 0xff5050 });
    add(g, geo('b', 0.22, 0.22, 0.22), 0xb89cf0, { p: [0, 1.12, 0.02], e: 0x301860 });
    return g;
  }

  var MONSTERS = {
    A: [aquator, 0x2aa9a1],
    B: [flyer, 0x6b4a8a, { span: 0.6 }],
    C: [quadruped, 0xb97a3c, { torso: true, long: 0.6, mane: 0x4a2f18, tail: 0x4a2f18 }],
    D: [dragon, 0xd2392b, { wing: 0x8c1d14, fire: true }],
    E: [quadruped, 0xa08a62, { bird: true, long: 0.3, beak: true, sc: 0.95 }],
    F: [flytrap, 0x3fa34d],
    G: [quadruped, 0xd9a441, { wings: 0xe9d9a0, beak: true, head: 0xf2efe6, long: 0.55, sc: 1.15 }],
    H: [humanoid, 0xb5642e, { w: 1.2, h: 0.9, club: true, hunch: true }],
    I: [iceMonster, 0x9fd8ff],
    J: [dragon, 0x7a3fa0, { sc: 1.35, spike: 0xd9c3f2, eye: 0xff5050 }],
    K: [flyer, 0x9c6b3a, { head: 0xc9ad80, beak: true, span: 0.5 }],
    L: [humanoid, 0x39b54a, { h: 0.65, hat: 0x1f8a30, bag: true, skin: 0xe0b48a }],
    M: [humanoid, 0x5fb05f, { snakes: true, skin: 0x7fcf7f, eye: 0xff4040 }],
    N: [humanoid, 0xe8a6c8, { robe: true, hair: 0x6a3a1a, skin: 0xe0b48a }],
    O: [humanoid, 0x6c8f4a, { w: 1.15, club: true, fang: true }],
    P: [humanoid, 0xe6f0ff, { ghost: true, glow: 0x304060 }],
    Q: [quadruped, 0x8c7a5c, { stripes: true, long: 0.55 }],
    R: [serpent, 0x9a7b3d, { rattle: true, stripe: true }],
    S: [serpent, 0x4fa04f, {}],
    T: [humanoid, 0x5a7a3a, { w: 1.5, h: 1.25, hunch: true, armsFwd: false, fang: true, club: true, eye: 0xff5050 }],
    U: [quadruped, 0x2b2b3a, { horn: 0xffffff, mane: 0x7a7aa0, tail: 0x7a7aa0, long: 0.5 }],
    V: [humanoid, 0xb8b0c0, { cape: 0x7a1020, fang: true, eye: 0xff3030, skin: 0xe8e4f0 }],
    W: [humanoid, 0x555a70, { ghost: true, glow: 0x101830 }],
    X: [xeroc, 0x8b5cc6],
    Y: [humanoid, 0xf2f5fa, { w: 1.4, h: 1.15, fur: true, hunch: true }],
    Z: [humanoid, 0x7e8f6a, { armsFwd: true, hunch: true, eye: 0xff6040 }]
  };

  function monster(letter) {
    var key = 'm' + letter;
    if (!protoCache[key]) {
      var d = MONSTERS[letter];
      var g;
      if (d) g = d[0](d[1], d[2] || {});
      else {
        g = new T.Group();
        add(g, geo('k', 0.3, 0.9), 0xff5d5d, { p: [0, 0.45, 0] });
        g.userData.h = 1;
        shadow(g, 0.4);
      }
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
      add(g, geo('b', 0.8, 1.0, 0.16), 0x9a6a36, { p: [0, 0.5, 0], e: 0x1a1008 });
      [-1, 1].forEach(function (s) { add(g, geo('b', 0.12, 1.3, 0.24), 0x5a3a1a, { p: [s * 0.46, 0.65, 0] }); });
      add(g, geo('b', 1.04, 0.16, 0.24), 0x5a3a1a, { p: [0, 1.22, 0] });
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

  function stairs() {
    if (!protoCache.stairs) {
      var g = new T.Group();
      add(g, geo('b', 0.9, 0.06, 0.9), 0x15171f, { p: [0, 0.03, 0] });
      for (var i = 0; i < 4; i++) add(g, geo('b', 0.8 - i * 0.14, 0.08, 0.8 - i * 0.14), 0xe6c35a, { p: [0, 0.1 + i * 0.07, 0], e: 0x3a3010 });
      add(g, geo('k', 0.1, 0.22), 0xffe680, { p: [0, 0.5, 0], r: [Math.PI, 0, 0], e: 0x806a20 });
      protoCache.stairs = g;
    }
    return protoCache.stairs.clone();
  }

  function trap() {
    if (!protoCache.trap) {
      var g = new T.Group();
      add(g, geo('c', 0.36, 0.38, 0.05), 0x30333c, { p: [0, 0.025, 0] });
      [[0, 0], [0.15, 0.1], [-0.14, 0.08], [0.05, -0.17], [-0.1, -0.12]].forEach(function (s, i) {
        add(g, geo('k', 0.045, 0.28 - (i % 2) * 0.06), 0xd8dde6, { p: [s[0], 0.17, s[1]], e: 0x303438 });
      });
      add(g, geo('t', 0.34, 0.02), 0xff6b4a, { p: [0, 0.06, 0], r: [Math.PI / 2, 0, 0], e: 0xc03a20 });
      protoCache.trap = g;
    }
    return protoCache.trap.clone();
  }

  // The player: a small adventurer with a helmet, cape and sword.
  function hero() {
    var g = humanoid(0x4f7fd1, { w: 1.05, skin: 0xe0b48a, legs: 0x3a3f55, cape: 0xb02a2a, eye: 0x111111 });
    add(g, geo('h', 0.17), 0xc9d1de, { p: [0, 0.97, 0.02] });
    add(g, geo('b', 0.04, 0.12, 0.04), 0xc9d1de, { p: [0, 0.95, 0.15] });
    add(g, geo('b', 0.05, 0.5, 0.012), 0xdfe6f0, { p: [0.3, 0.72, 0.18], r: [-0.4, 0, 0], e: 0x30343a });
    add(g, geo('b', 0.14, 0.03, 0.04), 0xc9a45a, { p: [0.3, 0.5, 0.1], r: [-0.4, 0, 0] });
    g.userData.h = 1.3;
    return g;
  }

  return { init: init, hero: hero, setTheme: setTheme, monster: monster, item: item, door: door, stairs: stairs, trap: trap };
})();
