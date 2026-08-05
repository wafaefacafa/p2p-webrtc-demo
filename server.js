/**
 * 轻量信令服务器
 * 职责：维护在线 peer 目录 + 转发 offer/answer/ice
 * 不传输任何文件数据，文件走 WebRTC DataChannel 直连
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, urlPath);
  // 防止目录穿越
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

/** peerId -> { ws, name } */
const peers = new Map();

wss.on('connection', (ws) => {
  let myId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'register': {
        myId = msg.peerId;
        peers.set(myId, { ws, name: msg.name || myId.slice(0, 6) });
        send(ws, { type: 'registered', peerId: myId });
        broadcastPeerList();
        log(`✓ 注册 ${myId}（${msg.name || ''}）`);
        break;
      }
      case 'offer':
      case 'answer':
      case 'ice': {
        const target = peers.get(msg.target);
        if (target && target.ws.readyState === ws.OPEN) {
          send(target.ws, { ...msg, from: myId });
        } else {
          send(ws, { type: 'error', message: `目标 peer ${msg.target} 不在线` });
        }
        break;
      }
      default:
        send(ws, { type: 'error', message: `未知消息类型: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    if (myId && peers.has(myId)) {
      peers.delete(myId);
      broadcastPeerList();
      log(`✗ 离线 ${myId}`);
    }
  });

  ws.on('error', () => {});
});

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastPeerList() {
  const list = [...peers.entries()].map(([id, p]) => ({ id, name: p.name }));
  const payload = JSON.stringify({ type: 'peers', peers: list });
  peers.forEach((p) => send(p.ws, JSON.parse(payload)));
}

function log(s) {
  console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ${s}`);
}

// Render 要求监听 0.0.0.0（Node 默认即如此，显式声明更稳妥）
server.listen(PORT, '0.0.0.0', () => {
  console.log('────────────────────────────────────────');
  console.log('  P2P 信令服务器已启动');
  console.log(`  本机访问:  http://localhost:${PORT}`);
  console.log(`  局域网访问: http://<本机IP>:${PORT}`);
  console.log('  打开两个标签页/设备即可互连测试');
  console.log('────────────────────────────────────────');
});
