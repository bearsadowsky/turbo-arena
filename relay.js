// Tiny WebSocket relay for Turbo Arena. The game's host runs the match;
// this server only introduces players to each other and forwards messages.
const crypto = require('crypto');

module.exports = function createRelay() {
  const peers = new Map(); // peer id -> socket
  const conns = new Map(); // connection id -> { a, b } sockets
  let nextCid = 1;

  const send = (ws, o) => {
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) {}
  };
  const other = (c, ws) => (c.a === ws ? c.b : c.b === ws ? c.a : null);

  function dropConn(cid, from) {
    const c = conns.get(cid);
    if (!c) return;
    conns.delete(cid);
    c.a.conns.delete(cid);
    c.b.conns.delete(cid);
    const o = other(c, from);
    if (o) send(o, { t: 'c', cid });
  }

  return function onConnection(ws) {
    ws.id = null;
    ws.conns = new Set();

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;

      if (m.t === 'reg') {
        if (ws.id) return;
        let id = typeof m.id === 'string' ? m.id.slice(0, 64) : '';
        if (id) {
          if (peers.has(id)) return send(ws, { t: 'err', e: 'unavailable-id' });
        } else {
          do { id = crypto.randomBytes(8).toString('hex'); } while (peers.has(id));
        }
        peers.set(id, ws);
        ws.id = id;
        send(ws, { t: 'open', id });
      } else if (m.t === 'conn') {
        const target = peers.get(m.to);
        if (!ws.id || !target || target === ws) {
          return send(ws, { t: 'err', k: m.k, e: 'peer-unavailable' });
        }
        const cid = nextCid++;
        conns.set(cid, { a: ws, b: target });
        ws.conns.add(cid);
        target.conns.add(cid);
        send(target, { t: 'conn', cid, from: ws.id });
        send(ws, { t: 'ok', k: m.k, cid });
      } else if (m.t === 'd') {
        const c = conns.get(m.cid);
        const o = c && other(c, ws);
        if (o) send(o, { t: 'd', cid: m.cid, d: m.d });
      } else if (m.t === 'c') {
        dropConn(m.cid, ws);
      } // 'p' = keep-alive ping, nothing to do
    });

    ws.on('close', () => {
      if (ws.id && peers.get(ws.id) === ws) peers.delete(ws.id);
      [...ws.conns].forEach((cid) => dropConn(cid, ws));
    });
    ws.on('error', () => {});
  };
};
