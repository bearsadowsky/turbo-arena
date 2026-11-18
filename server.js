const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const createRelay = require('./relay');

const PORT = process.env.PORT || 3000;
const GAME = [path.join(__dirname, 'index.html'), path.join(__dirname, 'public', 'index.html')].find((p) => fs.existsSync(p)) || path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200); return res.end('ok'); }
  if (url === '/' || url === '/index.html') {
    return fs.readFile(GAME, (err, data) => {
      if (err) { res.writeHead(500); return res.end('Game file missing'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
wss.on('connection', createRelay());

// Keep idle connections alive through Render's proxy and clean up dead ones.
setInterval(() => wss.clients.forEach((ws) => { try { ws.ping(); } catch (e) {} }), 30000);

server.listen(PORT, () => console.log('Turbo Arena listening on ' + PORT));
