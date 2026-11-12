/* A medieval-fantasy backdrop for the overhead 3D view: a vaulted hall of gothic arches
 * in the distance, a lava abyss far below the dungeon with drifting embers, a slowly
 * turning summoning seal, and rubble chunks floating about, some with torches.
 * Everything is drawn on canvases or built from primitives, so there are no image files.
 * The first-person view hides it all (there the dark fog takes over). */
window.Backdrop3D = (function () {
  'use strict';

  var PAL = {
    modern: {
      sky0: '#06060c', sky1: '#1b1020', glow: '255,140,50', orbs: ['255,170,70', '255,120,40', '255,214,140', '210,90,60'],
      far: 'rgba(40,28,52,0.62)', mid: 'rgba(26,18,38,0.8)', near: 'rgba(12,9,20,0.95)', lit: 'rgba(255,190,90,0.95)',
      ember: [0xffb050, 0xff7a30, 0xffe08a], lava: ['#160a08', '#ff7a1e', '#ffd070'], rock: 0x4b4149, deep: 0x30292f,
      seal: '#ffb347', flame: 0xff9a2e, mist: '200,150,120'
    },
    retro: {
      sky0: '#010301', sky1: '#04160a', glow: '60,255,110', orbs: ['60,255,110', '40,200,90', '170,255,190', '30,150,70'],
      far: 'rgba(8,40,18,0.62)', mid: 'rgba(5,28,12,0.8)', near: 'rgba(2,14,6,0.95)', lit: 'rgba(120,255,150,0.95)',
      ember: [0x4cff6e, 0x2faa4a, 0xb8ffc8], lava: ['#02100a', '#2fe060', '#c8ffd0'], rock: 0x1e3f28, deep: 0x102a18,
      seal: '#4cff6e', flame: 0x4cff6e, mist: '60,200,100'
    }
  };

  var T, scene, group = null, bgTex = null, theme = 'modern', visible = true;
  var lava, lavaTex, lavaLight, embers = [], seal, chunks = [], flames = [];
  var CX = 40, CZ = 12;

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

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function dotTexture() {
    var c = canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  }

  // ------------------------------------------------------------ background
  // A hall of gothic arcades in layers, with torch glow and mist between them.
  function drawBackground(p) {
    var W = 1024, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = rng(7), i;
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, p.sky0); sky.addColorStop(1, p.sky1);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    function blob(x, y, rad, rgb, a) {
      var gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill();
    }
    // a warm glow rising from far below, and drifting torch-light orbs
    blob(W / 2, H * 1.05, W * 0.55, p.glow, 0.5);
    g.globalCompositeOperation = 'lighter';
    for (i = 0; i < 26; i++) blob(r() * W, r() * H * 0.9, 12 + r() * 40, p.orbs[(r() * p.orbs.length) | 0], 0.05 + r() * 0.12);
    g.globalCompositeOperation = 'source-over';

    // a colonnade of pointed arches: the wall is filled, with the arch openings cut out
    function arcade(base, wallH, bays, color, torches) {
      var top = base - wallH, sp = W / bays, cw = sp * 0.16, k;
      g.fillStyle = color;
      g.beginPath();
      g.rect(0, top, W, H - top);
      for (k = 0; k < bays; k++) {
        var x0 = k * sp + cw, x1 = (k + 1) * sp - cw, mid = (x0 + x1) / 2, spring = top + wallH * 0.42;
        g.moveTo(x0, H);
        g.lineTo(x0, spring);
        g.bezierCurveTo(x0, spring - wallH * 0.18, mid - (mid - x0) * 0.35, top + wallH * 0.1, mid, top + wallH * 0.08);
        g.bezierCurveTo(mid + (x1 - mid) * 0.35, top + wallH * 0.1, x1, spring - wallH * 0.18, x1, spring);
        g.lineTo(x1, H);
        g.closePath();
      }
      g.fill('evenodd');
      for (k = 0; k < W; k += 22 + r() * 10) g.fillRect(k, top - 7, 12 + r() * 6, 8); // battlements
      for (k = 0; k < bays && torches; k++) {  // a torch on every other column
        if (k % 2) continue;
        var tx = k * sp + cw / 2, ty = top + wallH * 0.5;
        g.globalCompositeOperation = 'lighter';
        blob(tx, ty, 38, p.glow, 0.5);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = p.lit; g.beginPath(); g.ellipse(tx, ty, 3, 6, 0, 0, 6.3); g.fill();
        g.fillStyle = color;
      }
    }
    function mist(y, a) {
      g.save(); g.translate(0, y); g.scale(3, 0.35);
      for (var m = 0; m < 6; m++) blob((m / 6 + r() * 0.1) * W / 3, 0, 150 + r() * 80, p.mist, a);
      g.restore();
    }
    mist(H * 0.62, 0.08);
    arcade(H * 0.72, 150, 6, p.far, false);
    mist(H * 0.72, 0.12);
    arcade(H * 0.84, 130, 8, p.mid, true);
    mist(H * 0.86, 0.14);
    arcade(H * 1.0, 110, 5, p.near, true);

    var t = new T.CanvasTexture(c);
    return t;
  }

  // ------------------------------------------------------------ lava abyss
  function drawLava(p) {
    var S = 512, c = canvas(S, S), g = c.getContext('2d'), r = rng(11), i, j;
    g.fillStyle = p.lava[0]; g.fillRect(0, 0, S, S);
    for (i = 0; i < 70; i++) { // cooled crust plates
      g.fillStyle = 'rgba(' + (r() < 0.5 ? '40,26,24' : '10,6,6') + ',0.55)';
      g.beginPath(); g.ellipse(r() * S, r() * S, 20 + r() * 50, 12 + r() * 30, r() * 3, 0, 6.3); g.fill();
    }
    g.lineCap = 'round';
    for (i = 0; i < 60; i++) { // glowing cracks, wrapped so it tiles
      var x = r() * S, y = r() * S, pts = [];
      for (j = 0; j < 6; j++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; pts.push([x, y]); }
      [[7, 0.18, p.lava[1]], [3, 0.5, p.lava[1]], [1.2, 0.9, p.lava[2]]].forEach(function (s) {
        g.strokeStyle = p.lava[1]; g.globalAlpha = s[1]; g.lineWidth = s[0]; g.strokeStyle = s[2];
        [-S, 0, S].forEach(function (dx) {
          g.beginPath(); g.moveTo(pts[0][0] + dx, pts[0][1]);
          for (var q = 1; q < pts.length; q++) g.lineTo(pts[q][0] + dx, pts[q][1]);
          g.stroke();
        });
      });
    }
    g.globalAlpha = 1;
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(26, 15);
    return t;
  }

  // ------------------------------------------------------------ seal
  function drawSeal(p) {
    var S = 512, c = canvas(S, S), g = c.getContext('2d'), i;
    g.translate(S / 2, S / 2);
    g.strokeStyle = g.fillStyle = p.seal; g.shadowColor = p.seal; g.shadowBlur = 10;
    [[240, 3], [224, 1.5], [168, 2.5], [120, 1.5]].forEach(function (s) { g.lineWidth = s[1]; g.beginPath(); g.arc(0, 0, s[0], 0, 6.3); g.stroke(); });
    g.lineWidth = 1.6;
    // a dragon's head
    function sword(angle) {
      g.save(); g.rotate(angle);
      g.beginPath();
      g.moveTo(-6, 64); g.lineTo(-6, -138); g.lineTo(0, -166); g.lineTo(6, -138); g.lineTo(6, 64); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(0, -130); g.lineTo(0, 40); g.stroke();                       // the fuller
      g.beginPath(); g.moveTo(-34, 44); g.lineTo(34, 44); g.lineWidth = 5; g.stroke(); g.lineWidth = 1.8; // crossguard
      g.beginPath(); g.moveTo(0, 64); g.lineTo(0, 96); g.stroke();                          // grip
      g.beginPath(); g.arc(0, 104, 9, 0, 6.3); g.stroke();                                  // pommel
      g.restore();
    }
    g.lineWidth = 1.8;
    g.lineWidth = 1.8;
    g.save();                                   // the swords sit behind the shield: clip it out
    g.beginPath(); g.rect(-300, -300, 600, 600);
    g.moveTo(-64, -78); g.lineTo(64, -78); g.lineTo(64, 8); g.quadraticCurveTo(64, 72, 0, 103); g.quadraticCurveTo(-64, 72, -64, 8); g.closePath();
    g.clip('evenodd');
    sword(-0.7); sword(0.7);
    g.restore();
    // a heraldic shield bearing a castle tower
    g.beginPath();
    g.moveTo(-62, -76); g.lineTo(62, -76); g.lineTo(62, 8);
    g.quadraticCurveTo(62, 70, 0, 100); g.quadraticCurveTo(-62, 70, -62, 8); g.closePath();
    g.lineWidth = 3; g.stroke();
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-50, -64); g.lineTo(50, -64); g.lineTo(50, 6); g.quadraticCurveTo(50, 60, 0, 86); g.quadraticCurveTo(-50, 60, -50, 6); g.closePath(); g.stroke();
    g.lineWidth = 2.6; g.lineJoin = 'miter';
    g.beginPath();
    g.moveTo(-18, 44); g.lineTo(-18, -26); g.lineTo(-30, -26); g.lineTo(-30, -44); g.lineTo(-20, -44); g.lineTo(-20, -36); g.lineTo(-8, -36); g.lineTo(-8, -44);
    g.lineTo(8, -44); g.lineTo(8, -36); g.lineTo(20, -36); g.lineTo(20, -44); g.lineTo(30, -44); g.lineTo(30, -26); g.lineTo(18, -26); g.lineTo(18, 44);
    g.stroke();                                                         // the tower and its battlements
    g.beginPath(); g.moveTo(-36, 44); g.lineTo(36, 44); g.stroke();       // the base
    g.beginPath(); g.moveTo(-8, 44); g.lineTo(-8, 22); g.quadraticCurveTo(0, 6, 8, 22); g.lineTo(8, 44); g.stroke(); // the gate
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -20); g.lineTo(0, -4); g.stroke();         // an arrow slit
    g.lineWidth = 1.6;
    var r = rng(3);
    for (i = 0; i < 36; i++) {
      g.save(); g.rotate(i * 6.2832 / 36); g.translate(0, -232);
      g.beginPath();
      var k = (r() * 4) | 0;
      if (k === 0) { g.moveTo(-3, -5); g.lineTo(3, 5); g.moveTo(3, -5); g.lineTo(-3, 5); }
      else if (k === 1) { g.moveTo(0, -6); g.lineTo(0, 6); g.moveTo(-4, -1); g.lineTo(4, -1); }
      else if (k === 2) { g.moveTo(-4, 5); g.lineTo(0, -6); g.lineTo(4, 5); }
      else g.arc(0, 0, 4, 0, 5);
      g.stroke(); g.restore();
    }
    return new T.CanvasTexture(c);
  }

  // ------------------------------------------------------------ chunks of rubble
  function jag(geo, amt, r) {
    var p = geo.attributes.position, seen = {}, i;
    for (i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
      var d = seen[key] || (seen[key] = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
      p.setXYZ(i, x + d[0], y + d[1], z + d[2]);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function build() {
    var p = PAL[theme], r = rng(5), i;
    group = new T.Group();
    embers = []; chunks = []; flames = [];

    bgTex = drawBackground(p);

    // the lava far below
    lavaTex = drawLava(p);
    lava = new T.Mesh(new T.PlaneGeometry(420, 260), new T.MeshBasicMaterial({ map: lavaTex, fog: false }));
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(CX, -22, CZ);
    group.add(lava);
    lavaLight = new T.PointLight(p.ember[0], 0.9, 60, 1.4);
    lavaLight.position.set(CX, -6, CZ);
    group.add(lavaLight);

    // the seal glowing under the dungeon
    seal = new T.Mesh(new T.PlaneGeometry(120, 120), new T.MeshBasicMaterial({ map: drawSeal(p), transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    seal.rotation.x = -Math.PI / 2;
    seal.position.set(CX, -8, CZ);
    group.add(seal);

    // embers rising from the abyss
    var dot = dotTexture();
    p.ember.forEach(function (color, k) {
      var count = [48, 34, 24][k], pos = new Float32Array(count * 3), st = [];
      for (i = 0; i < count; i++) st.push({ x: CX + (r() - 0.5) * 120, y: -14 + r() * 30, z: CZ + (r() - 0.5) * 60, v: 0.5 + r() * 0.9, ph: r() * 6.28 });
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      var pts = new T.Points(geo, new T.PointsMaterial({ size: [7, 6, 8][k], sizeAttenuation: false, map: dot, color: color, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      pts.frustumCulled = false;
      group.add(pts);
      embers.push({ pts: pts, st: st, pos: pos });
    });

    // floating rubble, a few carrying torches
    var rockMat = new T.MeshToonMaterial({ color: p.rock, gradientMap: Models3D.toon({}).gradientMap, fog: false });
    var deepMat = new T.MeshToonMaterial({ color: p.deep, gradientMap: Models3D.toon({}).gradientMap, fog: false });
    var woodMat = new T.MeshToonMaterial({ color: 0x5a3a1c, gradientMap: Models3D.toon({}).gradientMap, fog: false });
    var flameMat = new T.MeshBasicMaterial({ color: p.flame, fog: false });
    for (i = 0; i < 26; i++) {
      var side = r() < 0.5 ? -1 : 1;
      var x = CX + (r() - 0.5) * 110, z = side < 0 ? -6 - r() * 14 : 30 + r() * 14;
      if (r() < 0.25) { x = CX + (r() < 0.5 ? -1 : 1) * (42 + r() * 12); z = CZ + (r() - 0.5) * 36; }
      var sc = 0.5 + r() * 1.6, y = -2.5 - r() * 8;
      var grp = new T.Group();
      var rock = new T.Mesh(jag(new T.IcosahedronGeometry(1, 1), 0.5, r), r() < 0.5 ? rockMat : deepMat);
      rock.scale.set(sc * (0.9 + r() * 0.5), sc * (0.6 + r() * 0.4), sc * (0.9 + r() * 0.5));
      grp.add(rock);
      if (sc > 1.1 && r() < 0.6) { // a torch stuck in the top
        var top = rock.scale.y * 0.8;
        var stick = new T.Mesh(new T.CylinderGeometry(0.05, 0.07, 0.9, 6), woodMat);
        stick.position.y = top + 0.35; grp.add(stick);
        var fl = new T.Mesh(new T.ConeGeometry(0.16, 0.5, 6), flameMat);
        fl.position.y = top + 1.0; grp.add(fl);
        flames.push({ m: fl, ph: r() * 6.28 });
      }
      grp.position.set(x, y, z);
      group.add(grp);
      chunks.push({ g: grp, y: y, ph: r() * 6.28, spin: (r() - 0.5) * 0.25, bob: 0.15 + r() * 0.3 });
    }
    group.visible = visible;
    scene.add(group);
  }

  function dispose() {
    if (!group) return;
    scene.remove(group);
    group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    if (bgTex) bgTex.dispose();
    group = null;
  }

  // ------------------------------------------------------------ API
  function init(THREE, theScene) { T = THREE; scene = theScene; build(); }

  function setTheme(t) {
    if (t === theme && group) return;
    theme = t === 'retro' ? 'retro' : 'modern';
    if (!T) return;
    dispose();
    build();
  }

  function setVisible(v) { visible = v; if (group) group.visible = v; }
  function background() { return bgTex; }

  function update(t, dt) {
    if (!group || !visible) return;
    lavaTex.offset.x = t * 0.004; lavaTex.offset.y = t * 0.0025;
    lavaLight.intensity = 0.85 + Math.sin(t * 2.3) * 0.12 + Math.sin(t * 5.1) * 0.06;
    lava.material.color.setScalar(0.5 + Math.sin(t * 1.1) * 0.1);
    seal.rotation.z = t * 0.05;
    seal.material.opacity = 0.42 + Math.sin(t * 0.8) * 0.1;
    embers.forEach(function (e) {
      var i, s;
      for (i = 0; i < e.st.length; i++) {
        s = e.st[i];
        s.y += s.v * dt;
        if (s.y > 16) { s.y = -14; s.x = CX + (Math.random() - 0.5) * 120; }
        e.pos[i * 3] = s.x + Math.sin(t * 0.6 + s.ph) * 0.9;
        e.pos[i * 3 + 1] = s.y;
        e.pos[i * 3 + 2] = s.z + Math.cos(t * 0.5 + s.ph) * 0.9;
      }
      e.pts.geometry.attributes.position.needsUpdate = true;
    });
    chunks.forEach(function (c) {
      c.g.position.y = c.y + Math.sin(t * 0.5 + c.ph) * c.bob;
      c.g.rotation.y += c.spin * dt;
    });
    flames.forEach(function (f) {
      var k = 1 + Math.sin(t * 9 + f.ph) * 0.18 + Math.sin(t * 15 + f.ph * 2) * 0.1;
      f.m.scale.set(k, 1 + (k - 1) * 2, k);
    });
  }

  return { sealImage: function () { return seal && seal.material.map.image; }, init: init, setTheme: setTheme, setVisible: setVisible, background: background, update: update };
})();
