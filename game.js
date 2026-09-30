const $ = id => document.getElementById(id);
const SKINS = [0xff6a2b, 0x3ec1d3, 0xc6f432, 0xd96cff];
const MAPS = [
  { name: 'Dustyard',   sky: 0xd9b98a, ground: 0x9c7c52, box: 0x6b5035, fog: 95,  seed: 11, cnt: 40, big: 6, tall: 3 },
  { name: 'Neon Docks', sky: 0x1a1030, ground: 0x241a3d, box: 0x3ec1d3, fog: 70,  seed: 29, cnt: 46, big: 5, tall: 4 },
  { name: 'Frostline',  sky: 0xc9dbe8, ground: 0xeef3f7, box: 0x7d95ab, fog: 110, seed: 53, cnt: 34, big: 8, tall: 2.5 },
  { name: 'Overgrown',  sky: 0x8fb58a, ground: 0x3f6b3a, box: 0x5c4a36, fog: 60,  seed: 77, cnt: 52, big: 4, tall: 5 }
];
let ws, myId = 0, skin = 0, scene, cam, ren, solids = [], boxes = [], others = {}, roster = {};
let hp = 100, yaw = 0, pitch = 0, vy = 0, px = 0, py = 1.7, pz = 0, inGame = false, mouseDown = false, lastShot = 0, lastSend = 0;
const keys = {};
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
const joy = { x: 0, y: 0 };

MAPS.forEach((m, i) => $('c-map').add(new Option(m.name, i)));
SKINS.forEach((c, i) => {
  const b = document.createElement('button'); b.style.background = '#' + c.toString(16).padStart(6, '0');
  b.onclick = () => { skin = i; [...$('sw').children].forEach((x, j) => x.classList.toggle('on', j === i)); };
  if (!i) b.classList.add('on'); $('sw').appendChild(b);
});

function show(p) {
  ['main', 'play', 'create', 'join', 'shop'].forEach(n => $('p-' + n).hidden = n !== p);
  $('msg').textContent = '';
  if (p === 'join') ws && ws.readyState === 1 && ws.send(JSON.stringify({ t: 'list' }));
}
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { connect(); show(b.dataset.go); });
const nick = () => $('nick').value.trim() || 'Player' + ((Math.random() * 900 + 100) | 0);

function connect() {
  if (ws && ws.readyState <= 1) return;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onmessage = e => handle(JSON.parse(e.data));
  ws.onclose = () => { if (inGame) location.reload(); };
}
const tx = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

const goFull = () => { if (!IS_TOUCH) return; document.documentElement.requestFullscreen?.().catch(() => {}); screen.orientation?.lock?.('landscape').catch(() => {}); };
$('do-create').onclick = () => { goFull(); tx({ t: 'create', name: $('c-name').value, pass: $('c-pass').value, cap: +$('c-cap').value, map: +$('c-map').value, nick: nick(), skin }); };
$('do-join').onclick = () => { goFull(); tx({ t: 'join', room: $('j-name').value, pass: $('j-pass').value, nick: nick(), skin }); };

function handle(m) {
  if (m.t === 'err') $('msg').textContent = m.msg;
  if (m.t === 'list') {
    $('list').innerHTML = '';
    if (!m.rooms.length) $('list').innerHTML = '<span style="color:var(--mut)">No servers yet. Create one.</span>';
    m.rooms.forEach(r => {
      const b = document.createElement('button');
      b.innerHTML = `<span>${r.lock ? '🔒 ' : ''}${r.name.replace(/</g, '&lt;')}</span><span>${MAPS[r.map].name} · ${r.n}/${r.cap}</span>`;
      b.onclick = () => $('j-name').value = r.name; $('list').appendChild(b);
    });
  }
  if (m.t === 'joined') { myId = m.id; startGame(m.map, m.players); }
  if (m.t === 'in') { roster[m.p.id] = m.p; addOther(m.p); score(); }
  if (m.t === 'out') { if (others[m.id]) scene.remove(others[m.id].g); delete others[m.id]; delete roster[m.id]; score(); }
  if (m.t === 'pos' && others[m.id]) Object.assign(others[m.id], { tx: m.x, ty: m.y, tz: m.z, try: m.ry });
  if (m.t === 'hp' && m.id === myId) { hp = m.hp; $('hpf').style.width = hp + '%'; $('flash').style.opacity = .35; setTimeout(() => $('flash').style.opacity = 0, 120); }
  if (m.t === 'kill') {
    roster[m.by].k = m.k; roster[m.id].d = m.d; score();
    $('feed').textContent = `${roster[m.by].name} eliminated ${roster[m.id].name}`;
    setTimeout(() => $('feed').textContent = '', 3000);
    if (m.id === myId) { hp = 100; $('hpf').style.width = '100%'; spawn(); }
  }
}

function score() {
  $('sb').innerHTML = Object.values(roster).sort((a, b) => b.k - a.k).map(p => `${p.name.replace(/</g, '&lt;')} ${p.k} / ${p.d}`).join('<br>');
}
function spawn() {
  const c = [[-38, -38], [38, 38], [-38, 38], [38, -38]][myId % 4];
  px = c[0]; pz = c[1]; py = 1.7; vy = 0; yaw = Math.atan2(px, pz);
}

function makeBot(skinIdx) {
  const g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: SKINS[skinIdx % 4] });
  const body = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.2, .5), mat); body.position.y = .6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(.45, .45, .45), new THREE.MeshLambertMaterial({ color: 0xeeeeee })); head.position.y = 1.45;
  g.add(body, head); return g;
}
function addOther(p) {
  if (p.id === myId || others[p.id]) return;
  const g = makeBot(p.skin); g.userData.pid = p.id; g.children.forEach(c => c.userData.pid = p.id); scene.add(g);
  others[p.id] = { g, tx: 0, ty: 1.7, tz: 0, try: 0 };
  g.position.set(0, -50, 0);
                                             }function startGame(mapIdx, players) {
  const M = MAPS[mapIdx];
  scene = new THREE.Scene(); scene.background = new THREE.Color(M.sky); scene.fog = new THREE.Fog(M.sky, 15, M.fog);
  scene.add(new THREE.HemisphereLight(0xffffff, M.ground, .95));
  const sun = new THREE.DirectionalLight(0xffffff, .7); sun.position.set(30, 50, 20); scene.add(sun);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ color: M.ground }));
  g.rotation.x = -Math.PI / 2; scene.add(g); solids = [g]; boxes = [];
  const bm = new THREE.MeshLambertMaterial({ color: M.box });
  let s = M.seed; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < M.cnt; i++) {
    const w = 2 + r() * M.big, h = 1.6 + r() * M.tall, d = 2 + r() * M.big, x = (r() - .5) * 80, z = (r() - .5) * 80;
    if (Math.hypot(Math.abs(x) - 38, Math.abs(z) - 38) < 7 || Math.hypot(x, z) < 4) continue;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bm); b.position.set(x, h / 2, z);
    scene.add(b); solids.push(b); boxes.push({ x, z, hw: w / 2 + .4, hd: d / 2 + .4, h });
  }
  [[0, -45, 90, 1], [0, 45, 90, 1], [-45, 0, 1, 90], [45, 0, 1, 90]].forEach(([x, z, w, d]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), bm); b.position.set(x, 3, z); scene.add(b); solids.push(b);
  });
  cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, .1, 300);
  ren = new THREE.WebGLRenderer({ antialias: !IS_TOUCH }); ren.setSize(innerWidth, innerHeight); ren.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
  document.body.appendChild(ren.domElement);
  players.forEach(p => { roster[p.id] = p; addOther(p); });
  roster[myId] = { id: myId, name: nick(), k: 0, d: 0 }; score();
  spawn(); inGame = true; $('menu').style.display = 'none'; $('hud').style.display = 'block';
  requestAnimationFrame(loop);
}

const hits = (x, z) => boxes.some(b => Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd && py - 1.7 < b.h);
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + joy.y, sd = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + joy.x;
  const sp = (keys.ShiftLeft ? 10 : 6) * dt, len = Math.max(1, Math.hypot(f, sd));
  const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * sd) / len * sp, dz = (-Math.cos(yaw) * f - Math.sin(yaw) * sd) / len * sp;
  const nx = Math.max(-43, Math.min(43, px + dx)), nz = Math.max(-43, Math.min(43, pz + dz));
  if (!hits(nx, pz)) px = nx; if (!hits(px, nz)) pz = nz;
  vy -= 24 * dt; py += vy * dt; if (py <= 1.7) { py = 1.7; vy = 0; if (keys.Space) vy = 8; }
  cam.position.set(px, py, pz); cam.rotation.set(pitch, yaw, 0, 'YXZ');
  if (mouseDown && (document.pointerLockElement || IS_TOUCH)) shoot(now);
  if (now - lastSend > 50) { lastSend = now; tx({ t: 'pos', x: px, y: py, z: pz, ry: yaw }); }
  for (const o of Object.values(others)) {
    o.g.position.x += (o.tx - o.g.position.x) * .3; o.g.position.z += (o.tz - o.g.position.z) * .3;
    o.g.position.y = o.ty - 1.7 + (o.ty > 50 ? 0 : 0); o.g.rotation.y = o.try;
  }
  ren.render(scene, cam); requestAnimationFrame(loop);
}

const ray = new THREE.Raycaster();
function shoot(now) {
  if (now - lastShot < 160) return; lastShot = now; pitch = Math.min(1.5, pitch + .012);
  ray.setFromCamera({ x: 0, y: 0 }, cam);
  const targets = solids.concat(Object.values(others).map(o => o.g));
  const h = ray.intersectObjects(targets, true)[0];
  if (h) { let o = h.object; while (o && o.userData.pid === undefined) o = o.parent; if (o) tx({ t: 'hit', id: o.userData.pid }); }
}

// ---- touch controls ----
const J = $('joy'); let joyId = null, lookId = null, lx = 0, ly = 0;
function moveJoy(e) {
  const r = J.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  joy.x = x; joy.y = -y; $('knob').style.transform = `translate(${x * 45}px,${y * 45}px)`;
}
J.addEventListener('pointerdown', e => { joyId = e.pointerId; J.setPointerCapture(e.pointerId); moveJoy(e); });
J.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = e => { if (e.pointerId !== joyId) return; joyId = null; joy.x = joy.y = 0; $('knob').style.transform = ''; };
J.addEventListener('pointerup', endJoy); J.addEventListener('pointercancel', endJoy);
const hold = (id, on, off) => { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); on(); });
  ['pointerup', 'pointercancel'].forEach(t => el.addEventListener(t, off)); };
hold('fire', () => mouseDown = true, () => mouseDown = false);
hold('jump', () => keys.Space = true, () => keys.Space = false);
addEventListener('pointerdown', e => { if (IS_TOUCH && inGame && e.target === ren.domElement && lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; } });
addEventListener('pointermove', e => {
  if (e.pointerId !== lookId) return;
  yaw -= (e.clientX - lx) * .005; pitch = Math.max(-1.4, Math.min(1.5, pitch - (e.clientY - ly) * .005)); lx = e.clientX; ly = e.clientY;
});
['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { if (e.pointerId === lookId) lookId = null; }));
addEventListener('contextmenu', e => e.preventDefault());

addEventListener('keydown', e => { keys[e.code] = true; });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', () => { if (!inGame || IS_TOUCH) return; if (!document.pointerLockElement) ren.domElement.requestPointerLock(); else mouseDown = true; });
addEventListener('mouseup', () => mouseDown = false);
addEventListener('mousemove', e => {
  if (!document.pointerLockElement) return;
  yaw -= e.movementX * .0022; pitch = Math.max(-1.4, Math.min(1.5, pitch - e.movementY * .0022));
});
document.addEventListener('pointerlockchange', () => $('hint').style.display = document.pointerLockElement ? 'none' : 'block');
addEventListener('resize', () => { if (!ren) return; ren.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
