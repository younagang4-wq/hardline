const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const FILES = { '/': 'index.html', '/index.html': 'index.html', '/game.js': 'game.js' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const srv = http.createServer((q, r) => {
  const name = FILES[q.url.split('?')[0]];
  if (!name) { r.writeHead(404); return r.end('Not found'); }
  fs.readFile(path.join(__dirname, name), (e, d) => {
    if (e) { r.writeHead(500); return r.end('Missing file: ' + name); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] }); r.end(d);
  });
});
const wss = new WebSocketServer({ server: srv });
const rooms = new Map();
let nid = 1;
const send = (w, o) => w.readyState === 1 && w.send(JSON.stringify(o));
const bc = (rm, o, ex) => rm.ps.forEach(p => p !== ex && send(p.ws, o));
const info = q => ({ id: q.id, name: q.name, skin: q.skin, k: q.k, d: q.d });

wss.on('connection', ws => {
  const p = { ws, id: nid++, name: 'Player', hp: 100, k: 0, d: 0, skin: 0, room: null };

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'list') {
      return send(ws, { t: 'list', rooms: [...rooms.values()].map(r => ({ name: r.name, map: r.map, n: r.ps.size, cap: r.cap, lock: !!r.pass })) });
    }
    if (m.t === 'create') {
      const name = String(m.name || '').trim().slice(0, 20);
      if (!name || rooms.has(name)) return send(ws, { t: 'err', msg: 'Server name is empty or already taken' });
      rooms.set(name, { name, pass: String(m.pass || ''), cap: Math.min(8, Math.max(2, m.cap | 0)), map: m.map | 0, ps: new Set() });
      m.room = name; m.t = 'join';
    }
    if (m.t === 'join') {
      const r = rooms.get(m.room);
      if (!r) return send(ws, { t: 'err', msg: 'Server not found' });
      if (r.pass !== String(m.pass || '')) return send(ws, { t: 'err', msg: 'Wrong password' });
      if (r.ps.size >= r.cap) return send(ws, { t: 'err', msg: 'Server is full' });
      p.name = String(m.nick || 'Player').slice(0, 16); p.skin = m.skin | 0;
      p.room = r; p.hp = 100; p.k = 0; p.d = 0;
      send(ws, { t: 'joined', id: p.id, map: r.map, players: [...r.ps].map(info) });
      r.ps.add(p);
      bc(r, { t: 'in', p: info(p) }, p);
      return;
    }
    const r = p.room; if (!r) return;
    if (m.t === 'pos') bc(r, { t: 'pos', id: p.id, x: m.x, y: m.y, z: m.z, ry: m.ry }, p);
    if (m.t === 'hit') {
      const v = [...r.ps].find(q => q.id === m.id); if (!v || v === p) return;
      v.hp -= 25;
      bc(r, { t: 'hp', id: v.id, hp: Math.max(v.hp, 0) });
      if (v.hp <= 0) {
        p.k++; v.d++; v.hp = 100;
        bc(r, { t: 'kill', by: p.id, id: v.id, k: p.k, d: v.d });
      }
    }
  });

  ws.on('close', () => {
    const r = p.room; if (!r) return;
    r.ps.delete(p); bc(r, { t: 'out', id: p.id });
    if (!r.ps.size) rooms.delete(r.name);
  });
});

srv.listen(process.env.PORT || 3000, () => console.log('Hardline running on port ' + (process.env.PORT || 3000)));
                              
