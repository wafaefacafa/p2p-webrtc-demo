# 跨网穿透方案

## 现状：STUN 打洞已覆盖大部分跨网场景

页面已内置 5 个公共 STUN 服务器。只要两端的 NAT 是锥形（Full Cone / Restricted Cone / Port Restricted Cone，家用路由器多数如此），STUN 打洞就能跨网直连——连接类型会显示绿色 `srflx 打洞`。

只有**对称型 NAT（Symmetric NAT）**才打不通，需要 TURN 中继兜底。

## 如何判断是否需要 TURN

打开两个不同网络的页面互联，看左侧"连接类型"：
- `host 直连` — 同局域网
- `srflx 打洞` — 跨网打洞成功，无需 TURN
- 连接失败 / 一直 `连接中` — 大概率是对称型 NAT，需要部署下面的 coturn

## 部署自建 coturn（兜底对称型 NAT）

需要一台有公网 IP 的 Linux 服务器。

```bash
# 1. 把 coturn/ 目录传到服务器
scp -r coturn/ user@your-server:~/

# 2. 改配置里的 external-ip
ssh user@your-server "sed -i 's/YOUR_PUBLIC_IP/你的公网IP/' ~/coturn/turnserver.conf"

# 3. 启动（需先装 Docker）
cd ~/coturn && docker compose up -d

# 4. 放行防火墙
sudo ufw allow 3478/tcp 3478/udp 5349/tcp 50000:60000/udp
```

## 接入 demo

部署完成后，在页面 URL 后加参数即可注入 TURN：

```
http://localhost:8080/?turn=turn:你的公网IP:3478&user=p2p&cred=p2psecret
```

连接成功后"连接类型"会显示橙色 `relay 中继`，表示走了 TURN 兜底。

## 安全建议

- `turnserver.conf` 里的 `user=p2p:p2psecret` 是静态凭证，仅适合测试。
- 生产环境改用 REST API 动态凭证（`use-auth-secret` + `static-auth-secret`），页面端需配合生成时间戳 token。
- 收紧 `allowed-peer-ip` 到已知网段，避免被当开放代理滥用。
