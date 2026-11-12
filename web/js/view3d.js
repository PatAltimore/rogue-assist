/* 3D view of the explored level (three.js). View-only: it never talks to the
 * game; app.js hands it the remembered map and the creatures each turn. */
window.View3D = (function () {
  'use strict';

  var COLS = 80, ROWS = 24;
  var MAX_CELLS = COLS * ROWS;
  var STEP = Math.PI / 4; // the walk view turns in 45 degree steps

  var PALETTES = {
    modern: {
      bg: 0x0b0c10, wall: 0x7a8296, wallTop: 0x9aa3b8, floor: 0x2f3547, pass: 0x6a604f, door: 0xd79b4a,
      stairs: 0xffd166, gold: 0xf4d03f, potion: 0x4fd1c5, scroll: 0xf1ead2, food: 0xa6e36e, weapon: 0xc9d1de,
      armor: 0x7f9cc4, magic: 0xb690ff, trap: 0xff6b4a, mon: 0xff5d5d, hero: 0xffffff, frontier: 0xe3aa4c
    },
    retro: {
      bg: 0x020502, wall: 0x2faa4a, wallTop: 0x4cff6e, floor: 0x0b2a12, pass: 0x17602a, door: 0x4cff6e,
      stairs: 0xb6ffc4, gold: 0x4cff6e, potion: 0x4cff6e, scroll: 0x4cff6e, food: 0x4cff6e, weapon: 0x4cff6e,
      armor: 0x4cff6e, magic: 0x4cff6e, trap: 0xb6ffc4, mon: 0xb6ffc4, hero: 0xffffff, frontier: 0xb6ffc4
    }
  };

  var state = {
    ok: false, visible: false, theme: 'modern', reduceMotion: false,
    yaw: 0, pitch: 0.95, dist: 13, level: -1, hero: { x: 0, y: 0 }, heroShown: null,
    dirty: true, last: 0,
    view: 'orbit', walk: { yaw: 0, target: 0 }, heroFace: 0
  };
  var T, renderer, scene, camera, stage, canvas;
  var walls, floors, passes, rocks, ceiling, dynamic, hero, heroLight, fog, ambient, sun;
  var cellWall = [], cellFloor = [], cellPass = [], tapHandler = null;
  var geo = {}, mats = {}, labelCache = {}, anim = [];
  var frontierMeshes = [];

  function hash(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  function init(container) {
    stage = container;
    T = window.THREE;
    state.reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!T) return fail('The 3D library could not be loaded, so the 3D view is unavailable.');
    try {
      renderer = new T.WebGLRenderer({ antialias: true });
    } catch (e) {
      return fail('This browser cannot show WebGL, so the 3D view is unavailable.');
    }
    canvas = renderer.domElement;
    canvas.setAttribute('aria-label', '3D view of the explored level');
    stage.insertBefore(canvas, stage.firstChild);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(45, 1, 0.1, 200);
    ambient = new T.AmbientLight(0xffffff, 0.6);
    sun = new T.DirectionalLight(0xffffff, 0.65);
    sun.position.set(-4, 10, 6);
    heroLight = new T.PointLight(0xffd9a0, 1.1, 14, 1.6);
    scene.add(ambient, sun, heroLight);

    Models3D.init(T);
    buildShared();
    applyTheme();
    bindControls();

    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);
    resize();
    state.ok = true;
    requestAnimationFrame(loop);
    return true;
  }

  function fail(text) {
    var msg = document.getElementById('view3dMsg');
    if (msg) { msg.textContent = text; msg.hidden = false; }
    state.ok = false;
    return false;
  }

  function buildShared() {
    geo.box = new T.BoxGeometry(1, 1, 1);
    mats.wall = new T.MeshLambertMaterial({ color: 0xffffff });
    mats.floor = new T.MeshLambertMaterial({ color: 0xffffff });
    mats.pass = new T.MeshLambertMaterial({ color: 0xffffff });
    mats.wall.map = Models3D.texture('stone');
    mats.floor.map = Models3D.texture('flag');
    mats.pass.map = Models3D.texture('dirt');
    walls = new T.InstancedMesh(geo.box, mats.wall, MAX_CELLS);
    floors = new T.InstancedMesh(geo.box, mats.floor, MAX_CELLS);
    passes = new T.InstancedMesh(geo.box, mats.pass, MAX_CELLS);
    [walls, floors, passes].forEach(function (m) {
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.frustumCulled = false;
      // Create the colour buffer now: three.js compiles the shader on the first
      // render and would ignore a buffer added later.
      m.setColorAt(0, new T.Color(0xffffff));
      scene.add(m);
    });
    // Walk view only: rock walls along corridors, and a ceiling.
    rocks = new T.InstancedMesh(geo.box, new T.MeshLambertMaterial({ color: 0xffffff, map: Models3D.texture('stone') }), 4 * MAX_CELLS);
    rocks.instanceMatrix.setUsage(T.DynamicDrawUsage);
    rocks.frustumCulled = false;
    rocks.setColorAt(0, new T.Color(0xffffff));
    rocks.visible = false;
    rocks.count = 0;
    scene.add(rocks);
    ceiling = new T.Mesh(new T.PlaneGeometry(COLS + 4, ROWS + 4), new T.MeshBasicMaterial({ color: 0x101218, map: Models3D.texture('ceil', COLS + 4, ROWS + 4) }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(COLS / 2, 1.32, ROWS / 2);
    ceiling.visible = false;
    scene.add(ceiling);
    dynamic = new T.Group();
    scene.add(dynamic);

    hero = new T.Group();
    var ring = new T.Mesh(new T.RingGeometry(0.42, 0.55, 28), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    hero.add(ring);
    hero.userData = { ring: ring, model: null };
    scene.add(hero);
  }

  function pal() { return PALETTES[state.theme] || PALETTES.modern; }

  function applyTheme() {
    if (!scene) return;
    var p = pal();
    scene.background = new T.Color(p.bg);
    scene.fog = new T.Fog(p.bg, 16, 46);
    ceiling.material.color.set(shade(p.wall, 0.22));
    Models3D.setTheme(state.theme);
    if (hero.userData.model) hero.remove(hero.userData.model);
    hero.userData.model = Models3D.hero();
    hero.add(hero.userData.model);
    hero.userData.ring.material.color.set(p.frontier);
    applyView();
    state.dirty = true;
  }

  // Orbit: the overhead camera. Walk: first person at eye height.
  function applyView() {
    if (!scene) return;
    var walk = state.view === 'walk';
    hero.visible = !walk;
    ceiling.visible = walk;
    rocks.visible = walk;
    camera.fov = walk ? 75 : 45;
    camera.near = walk ? 0.05 : 0.1;
    camera.updateProjectionMatrix();
    scene.fog.near = walk ? 1.5 : 16;
    scene.fog.far = walk ? 8.5 : 46;
    heroLight.intensity = walk ? 1.4 : 1.1;
    ambient.intensity = walk ? 0.45 : 0.6;
    sun.intensity = walk ? 0.3 : 0.65;
    heroLight.distance = walk ? 12 : 14;
    state.dirty = true;
  }

  // ------------------------------------------------------------- scene

  var tmpM = {};

  function place(mesh, i, x, y, z, sx, sy, sz, color) {
    if (!tmpM.m) { tmpM.m = new T.Matrix4(); tmpM.c = new T.Color(); tmpM.q = new T.Quaternion(); tmpM.p = new T.Vector3(); tmpM.s = new T.Vector3(); }
    tmpM.p.set(x, y, z);
    tmpM.s.set(sx, sy, sz);
    tmpM.m.compose(tmpM.p, tmpM.q, tmpM.s);
    mesh.setMatrixAt(i, tmpM.m);
    tmpM.c.set(color);
    mesh.setColorAt(i, tmpM.c);
  }

  function shade(color, k) {
    var c = new T.Color(color);
    c.multiplyScalar(k);
    return c.getHex();
  }

  function label(ch, color) {
    var key = ch + color;
    if (labelCache[key]) return labelCache[key];
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    g.font = 'bold 48px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(ch, 32, 34);
    g.fillStyle = '#' + new T.Color(color).getHexString();
    g.fillText(ch, 32, 34);
    var tex = new T.CanvasTexture(c);
    labelCache[key] = tex;
    return tex;
  }

  function clearDynamic() {
    while (dynamic.children.length) {
      var o = dynamic.children.pop();
      if (o.material && o.userData.own) o.material.dispose();
    }
    anim.length = 0;
    frontierMeshes.length = 0;
  }

  function mesh(g, color, opts) {
    opts = opts || {};
    var m = new T.Mesh(g, new T.MeshLambertMaterial({ color: color, emissive: opts.emissive || 0x000000 }));
    m.userData.own = true;
    return m;
  }

  function addAt(obj, x, y, z, bob) {
    obj.position.set(x, y, z);
    obj.userData.cell = { x: x, y: z }; // lets a tap find what was touched
    dynamic.add(obj);
    if (bob) anim.push({ obj: obj, base: y, phase: hash(x, z) * 6.28, spin: bob === 2 });
    return obj;
  }

  function addMonster(letter, x, y, p, dim, hero) {
    var g = Models3D.monster(letter);
    var h = (g.userData && g.userData.h) || 1.2;
    var sprite = new T.Sprite(new T.SpriteMaterial({ map: label(letter, p.mon), transparent: true, depthTest: state.view === 'walk', opacity: dim ? 0.8 : 1 }));
    var ls = state.view === 'walk' ? 0.4 : 0.8; // smaller up close in first person
    sprite.scale.set(ls, ls, 1);
    sprite.position.y = h + (state.view === 'walk' ? 0.12 : 0.2);
    g.add(sprite);
    g.position.set(x, 0, y);
    g.userData.cell = { x: x, y: y };
    // Face the hero.
    if (hero) g.rotation.y = Math.atan2(hero.x - x, hero.y - y);
    dynamic.add(g);
    var rig = g.getObjectByName('rig') || g;
    var part = function (n) { var o = g.getObjectByName(n); return o ? { o: o, rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z } : null; };
    anim.push({
      monster: true, rig: rig, style: (g.userData && g.userData.style) || 'fighter', phase: hash(x, y) * 6.28,
      armL: part('armL'), armR: part('armR'), jaw: part('jaw'), tail: part('tail'),
      wings: [g.getObjectByName('wingL'), g.getObjectByName('wingR')]
    });
  }

  // Moving parts of scenery: the arrow over the stairs bounces and spins, trap spikes stab.
  function animateProp(obj, x, y) {
    var arrow = obj.getObjectByName('arrow'), spikes = obj.getObjectByName('spikes');
    if (arrow) anim.push({ obj: arrow, base: arrow.position.y, phase: hash(x, y) * 6.28, spin: true, hop: 0.12 });
    if (spikes) anim.push({ spikes: spikes, phase: hash(x, y) * 6.28 });
  }

  // The fighting stance: a springy bounce with squash and stretch, a forward lean,
  // weight shifting from side to side, arms pumping, jaws snapping and tails lashing.
  function animateMonster(a, t) {
    var r = a.rig, th = t * 5.2 + a.phase, slow = th * 0.5;
    var up = Math.abs(Math.sin(th)), s = Math.sin(th), sw = Math.sin(slow);
    if (a.style === 'fly') {
      r.position.y = Math.sin(t * 3 + a.phase) * 0.1;
      r.position.z = sw * 0.1;
      r.rotation.x = 0.25 + s * 0.08;
      r.rotation.z = sw * 0.12;
    } else if (a.style === 'slither') {
      r.rotation.y = sw * 0.35;
      r.position.z = Math.max(0, Math.sin(slow * 1.5)) * 0.12; // little strikes
      r.rotation.x = Math.max(0, Math.sin(slow * 1.5)) * 0.18;
      r.scale.y = 1 + s * 0.04;
    } else if (a.style === 'float') {
      r.position.y = 0.08 + Math.sin(t * 2 + a.phase) * 0.08;
      r.position.z = Math.max(0, sw) * 0.14; // lunges
      r.rotation.x = 0.15 + Math.max(0, sw) * 0.15;
      r.rotation.z = Math.sin(t * 1.3 + a.phase) * 0.08;
    } else if (a.style === 'plant') {
      r.rotation.z = sw * 0.14;
      r.rotation.x = 0.1 + s * 0.08;
      r.scale.y = 1 + s * 0.04;
    } else {
      r.position.y = up * 0.08;
      r.scale.y = 1 + (up - 0.5) * 0.09;
      r.scale.x = r.scale.z = 1 - (up - 0.5) * 0.045;
      r.rotation.x = 0.13 + s * 0.04;
      r.position.x = sw * 0.05;
      r.position.z = Math.sin(slow + 1) * 0.05;
      r.rotation.z = sw * 0.045;
      r.rotation.y = sw * 0.14;
    }
    if (a.armL) a.armL.o.rotation.x = a.armL.rx + s * 0.28;
    if (a.armR) a.armR.o.rotation.x = a.armR.rx - s * 0.28;
    if (a.jaw) a.jaw.o.rotation.x = a.jaw.rx + (a.style === 'plant' ? -1 : 1) * Math.pow(Math.max(0, Math.sin(slow * 1.7)), 3) * 0.5;
    if (a.tail) a.tail.o.rotation.y = a.tail.ry + Math.sin(th * 0.8) * 0.4;
    if (a.wings[0]) {
      var flap = Math.sin(t * (a.style === 'fly' ? 13 : 4) + a.phase) * (a.style === 'fly' ? 0.75 : 0.3);
      a.wings[0].rotation.z = -flap; a.wings[1].rotation.z = flap;
    }
  }

  // data: { grid[y][x] -> char code (0 = unexplored), hero:{x,y}, level, monsters:[{ch,x,y}], stairs:{x,y}|null }
  function update(data) {
    if (!state.ok || !state.visible) return;
    var p = pal();
    var nW = 0, nF = 0, nP = 0, nR = 0;
    var walk = state.view === 'walk';
    cellWall.length = cellFloor.length = cellPass.length = 0;
    clearDynamic();

    for (var y = 1; y < ROWS - 1; y++) {
      for (var x = 0; x < COLS; x++) {
        var code = data.grid[y][x];
        if (!code) continue;
        var ch = String.fromCharCode(code);
        var v = 0.86 + 0.28 * hash(x, y);
        if (ch === '|' || ch === '-') {
          cellWall[nW] = y * 100 + x;
          place(walls, nW++, x, 0.65, y, 1, 1.3, 1, shade(p.wall, 0.9 + 0.2 * hash(x, y)));
          continue;
        }
        var isCorr = ch === '#' || (data.corr && data.corr[y * 100 + x]);
        if (isCorr) {
          cellPass[nP] = y * 100 + x;
          place(passes, nP++, x, -0.04, y, 0.94, 0.1, 0.94, shade(p.pass, v));
          if (walk) {
            // Corridors have no walls in the map data, so build them along every open side.
            // The one exception is the tip of an unexplored corridor: its far end stays open
            // so it fades into darkness instead of looking walled off.
            var known = function (yy, xx) { var cc = yy >= 1 && yy <= ROWS - 2 && xx >= 0 && xx < COLS ? data.grid[yy][xx] : 0; return cc && cc !== 124 && cc !== 45; };
            var links = 0;
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { if (known(y + d[1], x + d[0])) links++; });
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
              var ny = y + d[1], nx = x + d[0];
              if (ny < 1 || ny > ROWS - 2 || nx < 0 || nx >= COLS || data.grid[ny][nx]) return;
              if (links === 1 && known(y - d[1], x - d[0])) return;
              place(rocks, nR++, x + d[0] * 0.5, 0.65, y + d[1] * 0.5, d[0] ? 0.14 : 1.14, 1.3, d[1] ? 0.14 : 1.14, shade(p.wall, 0.6 + 0.2 * hash(x + nR, y)));
            });
          }
          if (ch !== '#' && ch !== '@' && !(ch >= 'A' && ch <= 'Z')) {
            var it2 = Models3D.item(ch, hash(x + 7, y + 3));
            if (it2) { it2.scale.set(1.4, 1.4, 1.4); addAt(it2, x, 0.1, y, 2); }
          }
          continue;
        }
        cellFloor[nF] = y * 100 + x;
        place(floors, nF++, x, -0.05, y, 0.98, 0.1, 0.98, shade(p.floor, v));
        if (ch === '+') {
          var left = String.fromCharCode(data.grid[y][x - 1] || 0), right = String.fromCharCode(data.grid[y][x + 1] || 0);
          addAt(Models3D.door(left === '-' || right === '-' || left === '+' || right === '+'), x, 0, y, 0);
          var open = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(function (d) {
            var ny = y + d[0], nx = x + d[1];
            return ny > 0 && ny < ROWS - 1 && nx >= 0 && nx < COLS && !data.grid[ny][nx];
          });
          if (open) {
            var mk = mesh(new T.RingGeometry(0.55, 0.75, 24), p.frontier, { emissive: p.frontier });
            mk.rotation.x = -Math.PI / 2;
            mk.material.side = T.DoubleSide;
            addAt(mk, x, 0.05, y, 0);
            frontierMeshes.push(mk);
          }
        } else if (ch === '%') {
          animateProp(addAt(Models3D.stairs(), x, 0, y, 0), x, y);
        } else if (ch === '^') {
          animateProp(addAt(Models3D.trap(), x, 0, y, 0), x, y);
        } else {
          var it = Models3D.item(ch, hash(x + 7, y + 3));
          if (it) { it.scale.set(1.4, 1.4, 1.4); addAt(it, x, 0.1, y, 2); }
        }
      }
    }
    if (data.stairs && !data.grid[data.stairs.y][data.stairs.x] ) {
      animateProp(addAt(Models3D.stairs(), data.stairs.x, 0, data.stairs.y, 0), data.stairs.x, data.stairs.y);
      var beam = mesh(new T.CylinderGeometry(0.12, 0.12, 6, 8), p.stairs, { emissive: p.stairs });
      beam.material.transparent = true;
      beam.material.opacity = 0.35;
      addAt(beam, data.stairs.x, 3, data.stairs.y, 0);
    }
    data.monsters.forEach(function (m) { addMonster(m.ch, m.x, m.y, p, m.radar, data.hero); });

    rocks.count = nR;
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    [[walls, nW], [floors, nF], [passes, nP]].forEach(function (pair) {
      pair[0].count = pair[1];
      pair[0].instanceMatrix.needsUpdate = true;
      if (pair[0].instanceColor) pair[0].instanceColor.needsUpdate = true;
    });

    if (data.level !== state.level) {
      state.level = data.level;
      state.heroShown = null;
    }
    // The avatar turns to face the way it last moved.
    var mx = data.hero.x - state.hero.x, my = data.hero.y - state.hero.y;
    if ((mx || my) && Math.abs(mx) <= 1 && Math.abs(my) <= 1) state.heroFace = Math.atan2(mx, my);
    state.hero = data.hero;
    state.dirty = true;
  }

  // ------------------------------------------------------------ camera

  var tgt = { x: 0, z: 0 };

  function applyCamera(dt) {
    if (!state.heroShown) {
      state.heroShown = { x: state.hero.x, y: state.hero.y };
      tgt.x = state.hero.x; tgt.z = state.hero.y;
    }
    var k = state.reduceMotion ? 1 : Math.min(1, dt * 12);
    state.heroShown.x += (state.hero.x - state.heroShown.x) * k;
    state.heroShown.y += (state.hero.y - state.heroShown.y) * k;
    var moving = Math.abs(state.hero.x - state.heroShown.x) + Math.abs(state.hero.y - state.heroShown.y) > 0.002;
    hero.position.set(state.heroShown.x, 0, state.heroShown.y);
    var turnBy = wrap(state.heroFace - hero.rotation.y);
    hero.rotation.y += state.reduceMotion ? turnBy : turnBy * Math.min(1, dt * 12);
    if (Math.abs(turnBy) > 0.01) moving = true;
    heroLight.position.set(state.heroShown.x, 1.8, state.heroShown.y);
    if (state.view === 'walk') {
      var w = state.walk, wk = state.reduceMotion ? 1 : Math.min(1, dt * 10);
      var diff = wrap(w.target - w.yaw);
      w.yaw += diff * wk;
      if (Math.abs(diff) < 0.002) w.yaw = w.target;
      camera.position.set(state.heroShown.x, 0.82, state.heroShown.y);
      camera.lookAt(state.heroShown.x + Math.sin(w.yaw), 0.8, state.heroShown.y - Math.cos(w.yaw));
      return moving || Math.abs(diff) > 0.002;
    }
    var ck = state.reduceMotion ? 1 : Math.min(1, dt * 6);
    tgt.x += (state.heroShown.x - tgt.x) * ck;
    tgt.z += (state.heroShown.y - tgt.z) * ck;
    var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    camera.position.set(tgt.x + state.dist * cp * Math.sin(state.yaw), state.dist * sp, tgt.z + state.dist * cp * Math.cos(state.yaw));
    camera.lookAt(tgt.x, 0.3, tgt.z);
    return moving || Math.abs(state.heroShown.x - tgt.x) + Math.abs(state.heroShown.y - tgt.z) > 0.002;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!state.visible || document.hidden) { state.last = now; return; }
    var dt = Math.min(0.1, (now - (state.last || now)) / 1000);
    if (now - state.last < 30) return; // about 30 frames a second is plenty and saves battery
    state.last = now;
    var moving = applyCamera(dt);
    var t = now / 1000;
    if (!state.reduceMotion) {
      for (var i = 0; i < anim.length; i++) {
        var a = anim[i];
        if (a.monster) animateMonster(a, t);
        else if (a.spikes) a.spikes.position.y = -0.2 + Math.pow(Math.max(0, Math.sin(t * 2.2 + a.phase)), 0.5) * 0.22;
        else {
          // Items hop and spin so they catch the eye.
          a.obj.position.y = a.base + Math.abs(Math.sin(t * 2.6 + a.phase)) * (a.hop || 0.16);
          if (a.spin) a.obj.rotation.y = t * 1.8 + a.phase;
        }
      }
      var pulse = 1 + Math.sin(t * 4) * 0.12;
      for (var j = 0; j < frontierMeshes.length; j++) frontierMeshes[j].scale.set(pulse, pulse, pulse);
      hero.userData.ring.scale.set(pulse, pulse, pulse);
      renderer.render(scene, camera);
    } else if (state.dirty || moving) {
      renderer.render(scene, camera);
    }
    state.dirty = false;
  }

  function resize() {
    if (!renderer || !stage) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    state.dirty = true;
  }

  // ---------------------------------------------------------- controls

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function wrap(a) { return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }
  // Facing: 0 = north (up the map), counting clockwise in 45 degree steps (2 = east).
  function getFacing() { return (((Math.round(state.walk.target / STEP)) % 8) + 8) % 8; }
  function setFacing(f) {
    state.walk.target = state.walk.yaw + wrap(f * STEP - state.walk.yaw);
    state.dirty = true;
  }
  function turn(steps) {
    state.walk.target = Math.round(state.walk.target / STEP) * STEP + steps * STEP;
    state.dirty = true;
  }
  function snapWalk() { state.walk.target = Math.round(state.walk.yaw / STEP) * STEP; state.dirty = true; }

  var ray, ndc;
  // Finds the map square under a screen point, or null (a wall, or nothing).
  function pick(cx, cy) {
    if (!T) return null;
    ray = ray || new T.Raycaster();
    ndc = ndc || new T.Vector2();
    var r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var best = null, bd = Infinity, i, o, hits = ray.intersectObjects(dynamic.children, true);
    for (i = 0; i < hits.length && !best; i++) {
      for (o = hits[i].object; o && !best; o = o.parent) {
        if (o.userData && o.userData.cell) { best = o.userData.cell; bd = hits[i].distance; }
      }
    }
    var sh = ray.intersectObjects([walls, floors, passes], false)[0];
    if (sh && sh.distance < bd) {
      if (sh.object === walls) return null;
      var code = (sh.object === floors ? cellFloor : cellPass)[sh.instanceId];
      best = code === undefined ? null : { x: code % 100, y: Math.floor(code / 100) };
    }
    return best;
  }
  function rotate(d) { state.yaw += d; state.dirty = true; }
  function tilt(d) { state.pitch = clamp(state.pitch + d, 0.25, 1.5); state.dirty = true; }
  function zoom(f) { state.dist = clamp(state.dist * f, 4, 34); state.dirty = true; }
  function reset() { state.yaw = 0; state.pitch = 0.95; state.dist = 13; state.dirty = true; }

  function bindControls() {
    var pointers = {}, lastPinch = 0, down = null;

    canvas.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      down = Object.keys(pointers).length === 1 ? { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 } : null;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      var ids = Object.keys(pointers);
      if (down) down.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      if (state.view === 'walk') {
        // Look around freely; the view snaps to a 45 degree facing on release.
        if (ids.length === 1) {
          state.walk.yaw -= (e.clientX - p.x) * 0.006;
          state.walk.target = state.walk.yaw;
          state.dirty = true;
        }
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        return;
      }
      if (ids.length === 2) {
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinch) zoom(lastPinch / d);
        lastPinch = d;
        return;
      }
      rotate(-(e.clientX - p.x) * 0.008);
      if (e.pointerType !== 'touch') tilt((e.clientY - p.y) * 0.006);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    });
    function end(e) { delete pointers[e.pointerId]; lastPinch = 0; }
    canvas.addEventListener('pointerup', function (e) {
      var wasTap = down && down.moved < 10 && Date.now() - down.t < 500 && Object.keys(pointers).length === 1;
      end(e);
      if (state.view === 'walk') {
        snapWalk();
        if (wasTap && tapHandler) {
          var c = pick(e.clientX, e.clientY);
          if (c) tapHandler(c);
        }
      }
      down = null;
    });
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
  }

  function command(name) {
    if (state.view === 'walk') {
      if (name === 'rotl') turn(-1);
      else if (name === 'rotr') turn(1);
      return;
    }
    if (name === 'rotl') rotate(Math.PI / 4);
    else if (name === 'rotr') rotate(-Math.PI / 4);
    else if (name === 'tiltup') tilt(-0.15);
    else if (name === 'tiltdown') tilt(0.15);
    else if (name === 'zoomin') zoom(1 / 1.2);
    else if (name === 'zoomout') zoom(1.2);
    else if (name === 'reset') reset();
  }

  return {
    init: init,
    update: update,
    command: command,
    isOk: function () { return state.ok; },
    setVisible: function (v) { state.visible = !!v; state.dirty = true; if (v) resize(); },
    setTheme: function (t) { state.theme = t === 'retro' ? 'retro' : 'modern'; applyTheme(); },
    setMotion: function (on) { state.reduceMotion = !on; state.dirty = true; },
    setView: function (v) { state.view = v === 'walk' ? 'walk' : 'orbit'; applyView(); },
    getFacing: getFacing,
    setFacing: setFacing,
    turn: turn,
    onTap: function (fn) { tapHandler = fn; }
  };
})();
