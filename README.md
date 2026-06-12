# 🪨 石板 (Slate) v0.2

**开放、零信任、以 Git 为唯一真相源的人-AI 共创协议。**

一个 MCP Server，6 个 AI 工具。接入 Claude Code / Cursor / Copilot / OpenClaw 后，AI 自动拥有全球搜索、质量评估、复用、发布能力。

---

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/cuiJY-still-in-school/slate/main/install.sh | bash
```

依赖：`git`、`node >= 20`、`npm`。

## 配置

```bash
slate setup                # 自动检测 AI 工具
slate setup -p openclaw    # 指定平台
```

一条命令：自动登录 GitHub → 初始化 `.slate/` → 写入 MCP 配置。

## 命令

```bash
slate          # 启动 MCP Server
slate setup    # 一条龙配置
slate login    # GitHub 登录
```

---

## 工具

AI 接入后自动加载 6 个工具：

| 工具 | 功能 |
|------|------|
| `slate_search` | 全球搜索 GitHub 仓库 |
| `slate_review` | 质量分析（Issues + 适用场景） |
| `slate_read` | 读取 `.slate/` 协议文件 |
| `slate_write` | 写入协议文件 |
| `slate_claim` | 认领意图（fork + PR） |
| `slate_publish` | 发布意图/地基 |

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

[协议规范](spec/protocol-v0.1.md) · [GitHub](https://github.com/cuiJY-still-in-school/slate) · MIT
