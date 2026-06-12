# 石板协议规范 v0.2

## 概述

石板是一个开放、零信任、以 Git 为唯一真相源的人-AI 共创协议。

**核心洞见**：GitHub 上的每一个仓库都是潜在的"地基"。
石板协议用 `.slate/` 目录提供结构化元数据，让 AI 能更精确地发现、复用和协作。

### 协议层

- **`.slate/` 目录** — 项目根目录下的 JSON 文件，声明式协作语法
- **MCP Server** — 6 个 AI 工具，嵌入 Claude Code / Cursor / Copilot
- **GitHub 即基础设施** — 零服务器、零数据库、零用户注册

---

## 角色

| 角色 | 做什么 | 协议文件 |
|------|--------|----------|
| 🔥 点火者 (Igniter) | 提出创意，提交人类独有的凭证（视频/语音/草图） | `intention.json` |
| 🏗️ 构建者 (Builder) | 用 AI 工具实现意图 | `dependencies.json` |
| 🧱 架构师 (Architect) | 创建可复用技术组件（地基） | `foundation.json` |

---

## `.slate/` 文件格式

### identity.json

```json
{ "protocol": "slate/0.1", "type": "intention | foundation | standalone", "owner": "github-username", "created": "ISO-8601" }
```

### intention.json

```json
{ "igniter": "github-username", "proof_file": "ignition/proof.mp4", "proof_hash": "sha256...", "summary": "一句话描述", "status": "open | claimed | completed", "claimed_by": null, "completion_pr": null }
```

**`proof_file` 是区分人类需求和 AI 垃圾的核心**——视频、语音、手绘草图。AI 无法伪造。

### foundation.json

```json
{ "architect": "github-username", "name": "地基名称", "description": "一句话描述", "version": "0.1.0", "exports": ["导出1"] }
```

### dependencies.json

```json
{ "dependencies": [{ "foundation_repo": "github.com/owner/repo", "architect": "username", "ref": "v1.0.0", "note": "用途" }] }
```

---

## AI 工具

6 个 MCP 工具，嵌入 AI 编程助手：

| 工具 | 功能 | 搜索源 |
|------|------|--------|
| `slate_search` | 全球搜索地基/意图 | GitHub 全库 + `.slate/` 加权 |
| `slate_review` | 深度质量分析 | GitHub Issues + 活跃度 |
| `slate_read` | 读取协议文件 | 本地/远程 `.slate/` |
| `slate_write` | 校验并写入协议文件 | Zod schema 校验 |
| `slate_claim` | 认领意图 | fork → PR |
| `slate_publish` | 发布意图/地基 | 创建 `.slate/` |

### 专有逻辑：质量评分

从 GitHub Issues、stars、commit 活跃度、license 计算综合评分。

| 信号 | 来源 | 含义 |
|------|------|------|
| Stars | GitHub API | 社区认可度 |
| Open/Closed Issues 比 | GitHub Issues | 项目健康度 |
| 最近 push 时间 | GitHub API | 维护活跃度 |
| License | GitHub API | 合规性 |
| Issue 标题内容 | GitHub Issues | 真实使用场景+痛点 |

### 专有逻辑：适合做什么

从 GitHub Topics、Issue 标题、描述文档中提炼：
- ✅ 适合做什么 — 具体使用场景
- ⚠️ 注意事项 — 从 issue 抱怨中提取

---

## 发现机制

两渠道搜索 + 策展注册表：

| 渠道 | 方式 | 覆盖 |
|------|------|------|
| GitHub Repo Search | 匹配 name/description/readme/topics，stars 排序 | 所有公开仓库 |
| GitHub Code Search | 搜索 `.slate/` 文件内容 | 已参与石板协议的项目 |
| 策展注册表 | `registry/` 目录下的手选地基 | 31 个种子地基 |

---

## 飞轮

```
AI 写代码 → 自动搜 GitHub → 发现地基 → 复用
                                    ↓
                           创建了可复用组件
                                    ↓
                           AI 自动发布地基
                                    ↓
        下一个 AI 搜到 → 评分 + 场景匹配 → 复用
```

---

## CLI

```bash
slate mcp      # 启动 MCP Server
slate init     # 初始化 .slate/
slate setup    # 自动配置 AI 工具接入
slate config   # 查看配置
slate login    # GitHub 登录
```

---

## 参与

```bash
gh api repos/{owner}/{repo}/topics -X PUT --input - <<<'{"names":["slate-foundation"]}'
```

---

## 版本

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-06-10 | 协议定义、MCP Server |
| v0.2 | 2026-06-12 | CLI 工具、质量评分、issue 评价、31 个种子地基 |
