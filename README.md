# P2P 传输 · WebRTC DataChannel

跨局域网 P2P 文件传输最小原型。WebRTC 直连优先，NAT 打洞失败自动回退到服务器中继，不依赖第三方 TURN 服务也能在移动网络下通信。

## 功能

- **即时消息** — 数据通道建立后可双向收发文本
- **文件传输** — 64KB 分片直传，自带进度条与自动下载
- **NAT 穿透** — 多 STUN 服务器打洞，支持 host / srflx 连接
- **中继回退** — 对称型 NAT 打洞失败时自动切换服务器中继（base64 JSON 文本转发）
- **一键部署** — Render Blueprint，push 即部署

## 架构

```
                    ┌──────────────┐
                    │  信令服务器   │  Node.js + ws
                    │  (Render)    │  WebSocket
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │ register   │            │ register
              │ offer/answer           │ offer/answer
              │ ice        │            │ ice
              ▼            │            ▼
         ┌────────┐       │       ┌────────┐
         │ Peer A │◄── WebRTC DC ──►│ Peer B │
         └────────┘  (P2P 直连)    └────────┘
              │                        │
              └─── 打洞失败时 ─────────┘
                    ↓
              ┌──────────────┐
              │  服务器中继   │  relay-data
              │  (base64)    │  JSON 文本
              └──────────────┘
```

### 连接类型

| 类型 | 说明 | 场景 |
|------|------|------|
| `host` | 局域网直连 | 同一 WiFi / 同网段 |
| `srflx` | STUN 打洞 | 跨网锥形 NAT |
| `relay` | 服务器中继 | 对称型 NAT（移动网络） |

## 快速开始

### 本地运行

```bash
npm install
npm start
```

打开两个浏览器标签页访问 `http://localhost:8080`，一个呼叫另一个即可互连。

### Render 部署

1. Fork 本仓库到你的 GitHub
2. 打开 [Render Dashboard](https://dashboard.render.com) → New → Blueprint
3. 选择你的仓库，Render 自动读取 `render.yaml` 完成部署
4. 部署完成后获得公网 URL（如 `https://p2p-signal-xxxx.onrender.com`）

跨设备测试：手机和电脑分别打开该 URL，即可跨网传输。

### 自建 TURN 服务器（可选）

如果服务器中继仍不够用，可部署自建 coturn 获得标准 TURN 中继：

```bash
# 在有公网 IP 的 Linux 服务器上
cd coturn
# 编辑 turnserver.conf，把 external-ip 改成你的服务器公网 IP
docker compose up -d
```

然后在页面 URL 后加参数注入 TURN：

```
https://your-app.onrender.com/?turn=turn:YOUR_IP:3478&user=p2p&cred=p2psecret
```

## 项目结构

```
p2p-demo/
├── server.js              # 信令服务器（HTTP 静态文件 + WebSocket 信令 + 中继转发）
├── public/
│   └── index.html         # Peer 前端页面（WebRTC + 中继逻辑 + UI）
├── coturn/                # 自建 TURN 服务器（可选）
│   ├── docker-compose.yml
│   └── turnserver.conf
├── render.yaml            # Render 一键部署配置
├── package.json
└── README.md
```

## 技术细节

### 信令协议

所有信令通过 WebSocket JSON 文本消息传输：

| 消息类型 | 方向 | 用途 |
|----------|------|------|
| `register` | Peer → Server | 注册上线，获取 peer 列表 |
| `peers` | Server → Peer | 广播在线节点列表 |
| `offer` / `answer` | Peer → Peer | WebRTC SDP 交换 |
| `ice` | Peer → Peer | ICE 候选交换 |
| `relay-prepare` | Peer → Peer | 请求进入中继模式 |
| `relay-ready` | Peer → Peer | 确认中继就绪（双向握手） |
| `relay-data` | Peer → Peer | 中继数据（base64 编码） |

### 中继回退机制

1. ICE 超时 8 秒或状态变为 `failed` / `disconnected` → 触发中继
2. 呼叫方发 `relay-prepare`，被叫方回复 `relay-ready`（3 次重试）
3. 双方确认后进入中继模式，数据经 `relay-data` 以 base64 JSON 文本转发
4. 避免二进制帧在反向代理（如 Render）中被破坏

### DataChannel 协议

消息前缀字节区分类型：

| 前缀 | 类型 | 格式 |
|------|------|------|
| `1` | 文本消息 | `[1][UTF-8 文本]` |
| `2` | 文件元数据 | `[2][JSON: {id,name,size,total}]` |
| `3` | 文件分片 | `[3][4字节序号][数据]` |
| `4` | 文件结束 | `[4][JSON: {id}]` |

### STUN 服务器

内置 5 个公共 STUN 服务器提升打洞成功率：

- Google（3 台）
- Cloudflare
- 小米

## 限制

- 服务器中继走 WebSocket，大文件传输效率低于 P2P 直连
- Render 免费版服务 15 分钟无请求会休眠，首次访问需等待冷启动
- 无持久化存储，peer 列表仅存内存

## License

MIT
