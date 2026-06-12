# 🪨 石板 (Slate) — MCP 工具包

**开放、零信任、以 Git 为唯一真相源的人-AI 共创协议。**

一个 MCP Server，5 个工具。接入 Claude Code 后，AI 自动拥有协议感知能力——全球搜索、复用、发布，用户完全无感。

---

## 安装

```bash
# 接入 Claude Code（一行命令）
claude mcp add slate -- npx @slate-protocol/slate mcp

# 或项目级（提交 .mcp.json，团队成员自动获得）
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "slate": {
      "type": "stdio",
      "command": "npx",
      "args": ["@slate-protocol/slate", "mcp"]
    }
  }
}
EOF
```

安装后照常用 Claude Code。AI 会在合适的时机自动调用石板工具。

---

## 工具

| 工具 | 功能 | 触发时机 |
|------|------|----------|
| `slate_search` | 全球搜索意图/地基（GitHub 即索引） | 每次写新功能前 AI 自动调用 |
| `slate_read` | 读取 `.slate/` 协议文件 | 需要了解项目上下文时 |
| `slate_write` | 校验并写入协议文件 | 更新状态/添加依赖 |
| `slate_claim` | 认领意图（fork + 更新状态 + PR） | 发现想构建的意图 |
| `slate_publish` | 发布意图/地基 | 创建了可复用组件 |

---

## 协议文件

每个参与石板协议的项目，根目录下放置 `.slate/`：

```
.slate/
├── identity.json        # 项目身份
├── intention.json       # 意图声明（点火者）
├── foundation.json      # 地基声明（架构师）
└── dependencies.json    # 依赖记录（构建者）
```

详见 [协议规范](spec/protocol-v0.1.md)。

---

## 飞轮

```
你用 Claude Code 写代码 → AI 自动调 slate_search 找地基 → 发现、复用、贡献
                                                          ↓
下一个开发者 → AI 搜到你的地基 → 全球协作自动发生
```

**GitHub 就是基础设施。** 零服务器、零数据库、零用户注册。

---

## 参与

- 创建 `.slate/` 文件，打上 `slate-intention` 或 `slate-foundation` topic
- 你的项目就能被全球 AI 通过 `slate_search` 发现

---

[MIT](LICENSE) · 石板协议 v0.1
