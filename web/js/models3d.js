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

  // An arm on a shoulder pivot (so it can pump in the fighting stance), ending in claws.
  function arm(g, name, s, x, y, len, thick, color, rx, plain) {
    var p = pivot(g, name, s * x, y, 0.02);
    add(p, geo('b', thick, len, thick), color, { p: [0, -len / 2 + 0.02, 0] });
    if (!plain) [-1, 0, 1].forEach(function (k) {
      add(p, geo('k', thick * 0.22, 0.12), BONE, { p: [k * thick * 0.33, -len - 0.02, 0], r: [Math.PI, 0, 0] });
    });
    p.rotation.set(rx, 0, s * 0.2);
    return p;
  }

  // ---------------------------------------------------------------- monsters

  function humanoid(c, o) {
    var g = new T.Group(), w = o.w || 1, skin = o.skin || c;
    var h = o.h || 1, eyeC = o.eye || 0xff3b2f;
    var hy = o.robe || o.ghost ? 1.0 : 0.95, hz = o.hunch ? 0.12 : 0.02;
    var armR;
    if (o.ghost) {
      add(g, geo('k', 0.32, 0.95), c, { p: [0, 0.47, 0], a: 0.72, e: o.glow || 0 });
      add(g, geo('s', 0.18), c, { p: [0, 0.98, 0.02], a: 0.8, e: o.glow || 0 });
      if (o.hood) add(g, geo('k', 0.25, 0.42), o.hood, { p: [0, 1.08, -0.04], r: [-0.25, 0, 0] });
      eyes(g, 1.0, 0.17, 0.065, 0.04, eyeC);
      add(g, geo('s', 0.06), 0x050208, { p: [0, 0.89, 0.16], s: [1, 1.5, 0.6] }); // a howling mouth
      [-1, 1].forEach(function (s) {
        var p = pivot(g, s < 0 ? 'armL' : 'armR', s * 0.2, 0.78, 0.02);
        add(p, geo('k', 0.07, 0.5), c, { p: [0, -0.22, 0], r: [Math.PI, 0, 0], a: 0.7, e: o.glow || 0 });
        [-1, 0, 1].forEach(function (k) { add(p, geo('k', 0.014, 0.13), BONE, { p: [k * 0.03, -0.5, 0], r: [Math.PI, 0, 0] }); });
        p.rotation.set(-1.25, 0, s * 0.35);
      });
      g.userData.style = 'float';
    } else {
      if (o.robe) {
        add(g, geo('k', 0.3 * w, 0.75), c, { p: [0, 0.38, 0] });
        add(g, geo('c', 0.13, 0.17, 0.3), c, { p: [0, 0.82, 0] });
      } else {
        [-1, 1].forEach(function (s) {
          add(g, geo('c', 0.09 * w, 0.1 * w, 0.36), o.legs || c, { p: [s * 0.13 * w, 0.18, s * 0.05] });
          if (!o.friendly) claws(g, s * 0.13 * w, 0.03, s * 0.05 + 0.1, 0.07 * w);
        });
        add(g, geo('b', 0.38 * w, 0.42, 0.24 * w), c, { p: [0, 0.57, o.hunch ? 0.05 : 0], r: [o.hunch ? 0.35 : 0.12, 0, 0] });
      }
      add(g, geo('s', 0.16 * w), skin, { p: [0, hy, hz] });
      eyes(g, hy + 0.03, hz + 0.13 * w, 0.065 * w, 0.032 * w, eyeC, o.friendly);
      if (!o.friendly) maw(g, hy - 0.07 * w, hz + 0.14 * w, 0.17 * w, o.teeth || 4);
      var guard = o.friendly ? 0 : (o.armsFwd ? -1.5 : (o.robe ? -0.9 : -1.05));
      arm(g, 'armL', -1, 0.26 * w, 0.76, 0.36, 0.09 * w, skin, guard, o.friendly);
      armR = arm(g, 'armR', 1, 0.26 * w, 0.76, 0.36, 0.09 * w, skin, guard + (o.club ? -0.5 : 0), o.friendly);
    }
    if (o.horns) [-1, 1].forEach(function (s) { add(g, geo('k', 0.045, 0.24), BONE, { p: [s * 0.11 * w, hy + 0.2 * w, hz], r: [0.2, 0, -s * 0.5] }); });
    if (o.spikes) [-1, 1].forEach(function (s) {
      [0, 1].forEach(function (k) { add(g, geo('k', 0.04, 0.2), BONE, { p: [s * (0.2 + k * 0.08) * w, 0.86 - k * 0.04, -0.02], r: [0, 0, -s * (0.4 + k * 0.5)] }); });
    });
    if (o.club && armR) {
      add(armR, geo('c', 0.035, 0.03, 0.5), 0x5a3a1c, { p: [0, -0.36, 0.2], r: [Math.PI / 2, 0, 0] });
      add(armR, geo('s', 0.1), 0x3a2a1a, { p: [0, -0.36, 0.46] });
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
    if (o.fur) [[-0.15, 0.7], [0.15, 0.7], [0, 0.4], [0.2, 0.5], [-0.2, 0.5], [0, 0.78]].forEach(function (f) { add(g, geo('o', 0.09), c, { p: [f[0], f[1], 0.13] }); });
    if (o.cube) add(g, geo('b', 0.24, 0.24, 0.24), o.cube, { p: [0, hy + 0.22, hz], r: [0.4, 0.6, 0], e: 0x301860 });
    g.scale.set(h, h, h);
    g.userData.h = (o.ghost ? 1.15 : 1.1) * h + 0.25;
    shadow(g, 0.4);
    return g;
  }

  function quadruped(c, o) {
    var g = new T.Group(), L = o.long || 0.5;
    var bodyY = o.bird ? 0.62 : 0.5, legH = o.bird ? 0.6 : 0.4;
    add(g, geo('s', 0.3), c, { p: [0, bodyY, 0], s: [0.9, 0.8, L / 0.3 * 0.9] });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      if (o.bird && q[1] === 1) return;
      add(g, geo('c', 0.05, 0.06, legH), o.legs || c, { p: [q[0] * 0.14, legH / 2, q[1] * L * 0.55] });
      claws(g, q[0] * 0.14, 0.03, q[1] * L * 0.55 + 0.08, 0.07);
    });
    if (o.bird) [-1, 1].forEach(function (s) {
      add(g, geo('c', 0.04, 0.05, legH), 0x8a7048, { p: [s * 0.1, legH / 2, 0.02] });
      claws(g, s * 0.1, 0.03, 0.1, 0.09);
    });
    var neckH = o.bird ? 0.5 : 0.25;
    var nz = L * 0.55;
    add(g, geo('c', 0.07, 0.1, neckH), c, { p: [0, bodyY + neckH / 2, nz], r: [0.5, 0, 0] });
    var hz = nz + 0.12, hy = bodyY + neckH + 0.02;
    add(g, geo('b', 0.16, 0.16, 0.28), o.head || c, { p: [0, hy, hz] });
    eyes(g, hy + 0.05, hz + 0.11, 0.07, 0.028, o.eye || 0xff3b2f);
    if (o.beak) {
      add(g, geo('k', 0.06, 0.24), 0xf2b134, { p: [0, hy - 0.02, hz + 0.22], r: [Math.PI / 2, 0, 0] });
      add(g, geo('k', 0.03, 0.1), 0xc98a14, { p: [0, hy - 0.07, hz + 0.32], r: [Math.PI, 0, 0] }); // hooked tip
    } else {
      maw(g, hy - 0.04, hz + 0.145, 0.14, 4);
    }
    if (o.horn) add(g, geo('k', 0.04, 0.42), o.horn, { p: [0, hy + 0.24, hz + 0.1], r: [0.6, 0, 0], e: o.horn === 0xffffff ? 0x555555 : 0 });
    if (o.torso) { // centaur: human upper body with a spear
      var tz = L * 0.45;
      add(g, geo('b', 0.3, 0.38, 0.2), 0xc99a70, { p: [0, bodyY + 0.42, tz] });
      add(g, geo('s', 0.13), 0xc99a70, { p: [0, bodyY + 0.76, tz] });
      eyes(g, bodyY + 0.79, tz + 0.11, 0.05, 0.025, 0xff3b2f);
      maw(g, bodyY + 0.7, tz + 0.12, 0.12, 3);
      arm(g, 'armL', -1, 0.2, bodyY + 0.6, 0.3, 0.07, 0xc99a70, -1.0).position.z = tz;
      var ar = arm(g, 'armR', 1, 0.2, bodyY + 0.6, 0.3, 0.07, 0xc99a70, -1.3);
      ar.position.z = tz;
      add(ar, geo('c', 0.018, 0.018, 0.9), 0x5a3a1c, { p: [0, -0.3, 0.15], r: [Math.PI / 2, 0, 0] });
      add(ar, geo('k', 0.05, 0.18), 0xd8dde6, { p: [0, -0.3, 0.68], r: [Math.PI / 2, 0, 0] });
    }
    if (o.stripes) for (var i = -2; i <= 2; i++) add(g, geo('b', 0.5, 0.5, 0.05), 0x161616, { p: [0, bodyY, i * 0.2], s: [0.98, 0.8, 1] });
    if (o.mane) for (var m = 0; m < 4; m++) add(g, geo('k', 0.05, 0.2), o.mane, { p: [0, bodyY + 0.32 - m * 0.05, nz - m * 0.12], r: [-0.4, 0, 0] });
    var tail = pivot(g, 'tail', 0, bodyY + 0.05, -L * 0.6);
    add(tail, geo('k', 0.06, 0.4), o.tail || c, { p: [0, 0.05, -0.16], r: [-2, 0, 0] });
    if (o.wings) addWings(g, o.wings, 0.6, 0.5, bodyY + 0.22, 0);
    g.scale.set(o.sc || 1, o.sc || 1, o.sc || 1);
    g.userData.h = (hy + 0.35) * (o.sc || 1);
    shadow(g, 0.45);
    return g;
  }

  function addWings(g, color, span, chord, y, z) {
    [-1, 1].forEach(function (s) {
      var p = pivot(g, s < 0 ? 'wingL' : 'wingR', s * 0.1, y, z);
      var w = add(p, geo('w', span, chord), color, { dbl: true });
      w.scale.x = s;
      add(p, geo('k', 0.025, 0.12), BONE, { p: [s * span, 0, -chord * 0.4], r: [0, 0, -s * Math.PI / 2] }); // wing claw
    });
  }

  // A snake reared up to strike.
  function serpent(c, o) {
    var g = new T.Group();
    var pts = [[0, 0.56, 0.3], [0, 0.42, 0.2], [0, 0.27, 0.14], [0.08, 0.13, 0.05], [0.2, 0.1, -0.12], [0.08, 0.09, -0.3], [-0.14, 0.08, -0.42], [-0.2, 0.07, -0.6]];
    pts.forEach(function (p, i) {
      add(g, geo('s', i === 0 ? 0.13 : 0.12 - i * 0.01), c, { p: p, s: i === 0 ? [1, 0.8, 1.3] : [1, 1, 1] });
      if (o.stripe && i % 2) add(g, geo('s', 0.125 - i * 0.01), 0x2a1c08, { p: p, s: [1.02, 0.5, 0.6] });
    });
    if (o.hood) [-1, 1].forEach(function (s) { add(g, geo('s', 0.13), c, { p: [s * 0.1, 0.44, 0.16], s: [1, 1.3, 0.35] }); });
    eyes(g, 0.61, 0.4, 0.065, 0.03, 0xffd23c);
    add(g, geo('b', 0.16, 0.05, 0.03), 0x2a0508, { p: [0, 0.52, 0.45] });
    fangs(g, 0.5, 0.45, 0.05, 0.12);
    add(g, geo('b', 0.015, 0.015, 0.16), 0xd22c2c, { p: [0, 0.5, 0.54], e: 0x701010 });
    if (o.rattle) {
      var tail = pivot(g, 'tail', -0.2, 0.07, -0.6);
      [0, 1, 2].forEach(function (i) { add(tail, geo('k', 0.055 - i * 0.012, 0.1), 0xe7d38a, { p: [0, 0.08 + i * 0.07, -0.02], r: [0, 0, 0] }); });
    }
    g.userData.h = 0.8;
    g.userData.style = 'slither';
    shadow(g, 0.45);
    return g;
  }

  function flyer(c, o) {
    var g = new T.Group(), by = 0.75;
    add(g, geo('s', 0.16), c, { p: [0, by, 0], s: [0.9, 0.9, 1.3] });
    add(g, geo('s', 0.11), o.head || c, { p: [0, by + 0.06, 0.2] });
    eyes(g, by + 0.1, 0.29, 0.05, 0.026, 0xff2a1f);
    if (o.beak) {
      add(g, geo('k', 0.035, 0.13), 0xf2b134, { p: [0, by + 0.04, 0.33], r: [Math.PI / 2, 0, 0] });
      add(g, geo('k', 0.02, 0.06), 0xc98a14, { p: [0, by + 0.01, 0.38], r: [Math.PI, 0, 0] });
    } else {
      [-1, 1].forEach(function (s) { add(g, geo('k', 0.04, 0.16), c, { p: [s * 0.07, by + 0.2, 0.18], r: [0, 0, -s * 0.3] }); }); // ears
      add(g, geo('b', 0.1, 0.04, 0.02), 0x2a0508, { p: [0, by + 0.01, 0.3] });
      fangs(g, by - 0.02, 0.3, 0.03, 0.08);
    }
    [-1, 1].forEach(function (s) { claws(g, s * 0.06, by - 0.17, 0.02, 0.07); }); // talons
    add(g, geo('b', 0.1, 0.02, 0.2), c, { p: [0, by, -0.25] });
    addWings(g, o.wing || c, o.span || 0.55, 0.32, by + 0.04, 0);
    g.userData.h = by + 0.4;
    g.userData.flies = 1;
    g.userData.style = 'fly';
    shadow(g, 0.3);
    return g;
  }

  function dragon(c, o) {
    var g = new T.Group();
    add(g, geo('s', 0.3), c, { p: [0, 0.5, 0], s: [1, 0.85, 1.6] });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      add(g, geo('c', 0.07, 0.09, 0.3), c, { p: [q[0] * 0.2, 0.15, q[1] * 0.28] });
      claws(g, q[0] * 0.2, 0.03, q[1] * 0.28 + 0.12, 0.1);
    });
    add(g, geo('c', 0.09, 0.14, 0.4), c, { p: [0, 0.72, 0.4], r: [0.7, 0, 0] });
    add(g, geo('b', 0.22, 0.14, 0.34), c, { p: [0, 0.98, 0.6] }); // skull and upper jaw
    eyes(g, 1.04, 0.7, 0.085, 0.034, o.eye || 0xffd23c);
    for (var t = 0; t < 4; t++) [-1, 1].forEach(function (s) { add(g, geo('k', 0.018, 0.08), BONE, { p: [s * 0.085, 0.89, 0.5 + t * 0.07], r: [Math.PI, 0, 0] }); });
    var jaw = pivot(g, 'jaw', 0, 0.9, 0.45);
    add(jaw, geo('b', 0.18, 0.05, 0.3), shadeHex(c, 0.75), { p: [0, -0.03, 0.15] });
    for (var u = 0; u < 3; u++) [-1, 1].forEach(function (s) { add(jaw, geo('k', 0.016, 0.07), BONE, { p: [s * 0.07, 0.03, 0.08 + u * 0.08] }); });
    jaw.rotation.x = 0.25;
    [-1, 1].forEach(function (s) { add(g, geo('k', 0.04, 0.32), BONE, { p: [s * 0.09, 1.16, 0.5], r: [-0.7, 0, s * 0.25] }); });
    var tail = pivot(g, 'tail', 0, 0.42, -0.36);
    for (var i = 0; i < 4; i++) add(tail, geo('k', 0.1 - i * 0.02, 0.35), c, { p: [0, -i * 0.04, -0.05 - i * 0.2], r: [-Math.PI / 2, 0, 0] });
    add(tail, geo('k', 0.07, 0.16), o.spike || BONE, { p: [0, -0.1, -0.86], r: [-Math.PI / 2, 0, 0] });
    for (var j = 0; j < 5; j++) add(g, geo('k', 0.045, 0.16), o.spike || BONE, { p: [0, 0.84 - j * 0.035, 0.2 - j * 0.16] });
    if (o.wing) addWings(g, o.wing, 0.95, 0.65, 0.7, 0);
    if (o.fire) add(jaw, geo('k', 0.07, 0.28), 0xff8a2a, { p: [0, 0.05, 0.42], r: [Math.PI / 2, 0, 0], e: 0xff6a00, a: 0.8 });
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
    g.userData.h = 0.85;
    shadow(g, 0.5);
    return g;
  }

  function iceMonster(c) {
    var g = new T.Group();
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
    g.userData.h = 1.3;
    shadow(g, 0.4);
    return g;
  }

  function flytrap(c) {
    var g = new T.Group();
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
    g.userData.h = 1.1;
    g.userData.style = 'plant';
    shadow(g, 0.4);
    return g;
  }

  var MONSTERS = {
    A: [aquator, 0x1f8f88],
    B: [flyer, 0x4a2f6a, { span: 0.65 }],
    C: [quadruped, 0x9a5e28, { torso: true, long: 0.6, mane: 0x2a1a0c, tail: 0x2a1a0c }],
    D: [dragon, 0xc22a1c, { wing: 0x7a140c, fire: true }],
    E: [quadruped, 0x8a744e, { bird: true, long: 0.3, beak: true, sc: 0.95 }],
    F: [flytrap, 0x2f8f3d],
    G: [quadruped, 0xc9922f, { wings: 0xd9c98a, beak: true, head: 0xe6e0d0, long: 0.55, sc: 1.15 }],
    H: [humanoid, 0xa5521e, { w: 1.2, h: 0.9, club: true, hunch: true, horns: true }],
    I: [iceMonster, 0x9fd8ff],
    J: [dragon, 0x6a2f90, { sc: 1.35, spike: 0xd9c3f2, eye: 0xff3030 }],
    K: [flyer, 0x8a5a2a, { head: 0xb99a6a, beak: true, span: 0.5 }],
    L: [humanoid, 0x2a9a3a, { h: 0.65, hat: 0x146a22, bag: true, skin: 0xc99a70, teeth: 5 }],
    M: [humanoid, 0x4f9a4f, { snakes: true, skin: 0x6fbf6f, eye: 0xff2a2a, fang: true }],
    N: [humanoid, 0xd88ab4, { robe: true, hair: 0x4a2a12, skin: 0xd0a480, eye: 0xff5ad0 }],
    O: [humanoid, 0x5c7f3a, { w: 1.15, club: true, fang: true, spikes: true }],
    P: [humanoid, 0xe6f0ff, { ghost: true, glow: 0x304060, eye: 0x7fe8ff }],
    Q: [quadruped, 0x7c6a4c, { stripes: true, long: 0.55 }],
    R: [serpent, 0x8a6b2d, { rattle: true, stripe: true }],
    S: [serpent, 0x3f904f, { hood: true }],
    T: [humanoid, 0x4a6a2a, { w: 1.5, h: 1.25, hunch: true, fang: true, club: true, spikes: true, horns: true, teeth: 5 }],
    U: [quadruped, 0x1c1c28, { horn: 0xffffff, mane: 0x6a6a90, tail: 0x6a6a90, long: 0.5 }],
    V: [humanoid, 0x2a2430, { cape: 0x7a1020, fang: true, eye: 0xff2020, skin: 0xe8e4f0 }],
    W: [humanoid, 0x3a3f55, { ghost: true, glow: 0x101830, hood: 0x14161f, eye: 0xff2a1f }],
    X: [humanoid, 0x7b4cb6, { w: 1.3, h: 1.05, cube: 0xa88ce0, spikes: true }],
    Y: [humanoid, 0xe6ecf5, { w: 1.4, h: 1.15, fur: true, hunch: true, fang: true, teeth: 5 }],
    Z: [humanoid, 0x6e7f5a, { armsFwd: true, hunch: true, eye: 0xff5030, skin: 0x8a9a6a }]
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
      add(g, geo('k', 0.1, 0.22), 0xffe680, { p: [0, 0.55, 0], r: [Math.PI, 0, 0], e: 0x806a20, n: 'arrow' });
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
    var g = humanoid(0x4f7fd1, { w: 1.05, skin: 0xe0b48a, legs: 0x3a3f55, cape: 0xb02a2a, eye: 0x111111, friendly: true });
    add(g, geo('h', 0.17), 0xc9d1de, { p: [0, 0.97, 0.02] });
    add(g, geo('b', 0.04, 0.12, 0.04), 0xc9d1de, { p: [0, 0.95, 0.15] });
    add(g, geo('b', 0.05, 0.5, 0.012), 0xdfe6f0, { p: [0.3, 0.72, 0.18], r: [-0.4, 0, 0], e: 0x30343a });
    add(g, geo('b', 0.14, 0.03, 0.04), 0xc9a45a, { p: [0.3, 0.5, 0.1], r: [-0.4, 0, 0] });
    g.userData.h = 1.3;
    return g;
  }

  return { init: init, hero: hero, setTheme: setTheme, monster: monster, item: item, door: door, stairs: stairs, trap: trap };
})();
