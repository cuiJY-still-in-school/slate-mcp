# 🪨 石板 (Slate) v0.2

**开放、零信任、以 Git 为唯一真相源的人-AI 共创协议。**

一个 MCP Server。接入 AI 工具后，自动获得全球搜索、质量评估、复用、发布能力。用户完全无感。

---

## 安装

```bash
git clone https://github.com/cuiJY-still-in-school/slate.git
cd slate
npm install && npm run build
```

## 配置

```bash
node dist/index.js setup              # 自动检测 AI 工具
node dist/index.js setup -p cursor    # 指定平台
```

一条命令：初始化 `.slate/` + 写入 MCP 配置。支持 Claude Code、Cursor、Copilot。

## 启动

```bash
node dist/index.js     # 启动 MCP Server
```

配置完成后，AI 工具自动加载 6 个石板工具。

---

## 工具

| 工具 | 功能 |
|------|------|
| `slate_search` | 全球搜索 GitHub 仓库（`.slate/` 加权） |
| `slate_review` | 质量分析（Issues 评价 + 适用场景） |
| `slate_read` | 读取协议文件 |
| `slate_write` | 写入协议文件 |
| `slate_claim` | 认领意图 |
| `slate_publish` | 发布地基 |

---

## 协议文件

```
.slate/
├── identity.json        # 项目身份
├── intention.json       # 意图（proof_file = 人类凭证）
├── foundation.json      # 地基
└── dependencies.json    # 依赖记录
```

---

## 飞轮

```
你写代码 → AI 自动搜 GitHub → 发现地基 → 复用 → 发布 → 下一个 AI 受益
```

---

[协议规范](spec/protocol-v0.1.md) · [GitHub](https://github.com/cuiJY-still-in-school/slate) · MIT
