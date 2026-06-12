# 🪨 石板 (Slate) v0.2

**开放、零信任、以 Git 为唯一真相源的人-AI 共创协议。**

一个 MCP Server，6 个 AI 工具。接入 Claude Code / Cursor / Copilot 后，AI 自动获得协议感知——全球搜索、质量评估、复用、发布。用户完全无感。

---

## 安装

### 从源码

```bash
git clone https://github.com/cuiJY-still-in-school/slate.git ~/.slate
cd ~/.slate
npm install && npm run build
echo 'export PATH="$HOME/.slate:$PATH"' >> ~/.zshrc
```

### 接入 AI 工具

```bash
slate setup                    # 自动检测平台并配置
slate setup --platform cursor  # 指定平台
```

或手动：

```bash
# Claude Code
claude mcp add slate -- node ~/.slate/dist/index.js mcp

# Cursor — 复制 → .cursor/mcp.json
# Copilot — 写入 .vscode/settings.json
```

---

## 工具

| 工具 | 功能 | 搜索源 |
|------|------|--------|
| `slate_search` | 全球搜索 | GitHub 全库 + `.slate/` 加权 |
| `slate_review` | 质量分析 | Issues 作为评价 + 适合做什么 |
| `slate_read` | 读取协议 | 本地/远程 `.slate/` 文件 |
| `slate_write` | 写入协议 | Zod schema 校验 |
| `slate_claim` | 认领意图 | fork → 更新状态 → PR |
| `slate_publish` | 发布 | 创建 `.slate/` + topic |

### 专有逻辑

- 🏆 **质量评分**：stars + issue健康度 + 活跃度 + license
- ✅ **适合做什么**：从 topics、issues、README 中提炼真实使用场景
- ⚠️ **注意事项**：从 issue 标题中提取已知坑

---

## CLI

```bash
slate              # 启动 MCP Server
slate init         # 初始化 .slate/
slate setup        # 自动配置 AI 工具接入
slate config       # 查看配置状态
slate login        # GitHub 登录
slate whoami       # 查看用户
slate --help       # 帮助
```

---

## 飞轮

```
你写代码 → AI 自动搜 GitHub → 发现地基 → 复用
                                      ↓
                             创建了可复用组件
                                      ↓
                             AI 自动发布地基
                                      ↓
          下一个 AI 搜到 → 评分匹配 → 复用 → 信号回流
```

**GitHub 即基础设施。** 零服务器、零数据库、零用户注册。

---

## 协议文件

```
.slate/
├── identity.json        # 项目身份
├── intention.json       # 意图（proof_file = 人类凭证）
├── foundation.json      # 地基（exports + keywords）
└── dependencies.json    # 依赖记录
```

详见 [协议规范 v0.2](spec/protocol-v0.1.md)。

---

## 参与

```bash
gh api repos/{owner}/{repo}/topics -X PUT --input - <<<'{"names":["slate-foundation"]}'
```

打上 topic，全球 AI 的 `slate_search` 就能发现你的项目。

---

[GitHub](https://github.com/cuiJY-still-in-school/slate) · [协议规范](spec/protocol-v0.1.md) · MIT
