/**
 * 石板 CLI — 3 条命令
 *   slate        启动 MCP Server
 *   slate setup  一条龙配置
 *   slate login  GitHub 登录
 */

import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { loadAuth, deviceFlowLogin, saveAuth } from "./auth/index.js";

const program = new Command();

program.name("slate").description("🪨 石板 — 全球 AI 协作协议").version("0.2.0");

// ─── 默认：MCP Server ──────────────────────────────
program
  .command("mcp")
  .description("启动 MCP Server")
  .action(async () => {
    const { startMcpServer } = await import("./mcp.js");
    await startMcpServer();
  });

// ─── setup ─────────────────────────────────────────
program
  .command("setup")
  .description("一条龙配置：GitHub 登录 → 初始化 → 关联 AI 工具")
  .option("-p, --platform <p>", "claude-code | cursor | copilot | openclaw")
  .action(async (opts) => {
    const cwd = process.cwd();
    console.log("🪨 石板 setup");
    console.log("");

    // 1. GitHub
    console.log("→ GitHub 登录…");
    let auth = loadAuth();
    if (auth) {
      console.log(`  ✅ 已登录: ${auth.user}`);
    } else {
      try {
        const token = execSync("gh auth token", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000 }).trim();
        const user = execSync("gh api user --jq .login", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000 }).trim();
        saveAuth({ token, user, loginAt: new Date().toISOString(), method: "gh_cli" });
        auth = { token, user, loginAt: new Date().toISOString(), method: "gh_cli" };
        console.log(`  ✅ gh CLI: ${user}`);
      } catch {
        console.log("  未检测到 gh CLI，启动设备流登录…");
        auth = await deviceFlowLogin();
        if (!auth) return;
      }
    }

    // 2. 初始化 .slate/
    console.log("→ 初始化 .slate/…");
    const slateDir = join(cwd, ".slate");
    if (!existsSync(slateDir)) {
      mkdirSync(slateDir, { recursive: true });
      writeFileSync(join(slateDir, "identity.json"), JSON.stringify({
        protocol: "slate/0.1", type: "standalone", owner: auth.user,
        created: new Date().toISOString(),
      }, null, 2) + "\n");
      writeFileSync(join(slateDir, "dependencies.json"), JSON.stringify({ dependencies: [] }, null, 2) + "\n");
      console.log("  ✅ .slate/identity.json");
      console.log("  ✅ .slate/dependencies.json");
    } else {
      console.log("  ✅ 已存在");
    }

    // 3. 配置所有检测到的平台
    const token = auth.token;
    const env = token ? { GH_TOKEN: token } : {};
    const nodePath = process.execPath;
    const installDir = process.env.SLATE_DIR || join(process.env.HOME || "~", ".slate");
    const mcp = { mcpServers: { slate: { type: "stdio", command: nodePath, args: [join(installDir, "dist/index.js"), "mcp"], ...(token ? { env } : {}) } } };

    const targets = opts.platform ? [opts.platform] : detectAllPlatforms();
    if (targets.length === 0) {
      console.log("  ⚠️  未检测到 AI 工具。指定: slate setup -p claude-code|cursor|copilot|openclaw");
      return;
    }

    console.log(`→ 配置 ${targets.length} 个平台…`);
    const configured: string[] = [];

    for (const p of targets) {
      switch (p) {
        case "claude-code": {
          // 全局 + 项目
          writeFileSync(join(home, ".mcp.json"), JSON.stringify(mcp, null, 2) + "\n");
          writeFileSync(join(cwd, ".mcp.json"), JSON.stringify(mcp, null, 2) + "\n");
          configured.push("Claude Code (~/.mcp.json)");
          break;
        }
        case "cursor": {
          const cd = join(home, ".cursor");
          if (!existsSync(cd)) mkdirSync(cd);
          writeFileSync(join(cd, "mcp.json"), JSON.stringify(mcp, null, 2) + "\n");
          writeFileSync(join(home, ".cursorrules"), cursorRules);
          configured.push("Cursor (MCP + .cursorrules)");
          break;
        }
        case "openclaw": {
          const od = join(home, ".config", "openclaw");
          if (!existsSync(od)) mkdirSync(od, { recursive: true });
          writeFileSync(join(od, "mcp.json"), JSON.stringify(mcp, null, 2) + "\n");
          writeFileSync(join(od, "AGENTS.md"), slateAgentsMd);
          configured.push("OpenClaw (MCP + AGENTS.md)");
          break;
        }
        case "copilot": {
          const ghDir = join(home, ".github");
          if (!existsSync(ghDir)) mkdirSync(ghDir);
          writeFileSync(join(ghDir, "copilot-instructions.md"), copilotInstructions);
          configured.push("Copilot (instructions.md)");
          break;
        }
      }
    }

    console.log("");
    configured.forEach(c => console.log(`  ✅ ${c}`));
    console.log("");
    console.log(`🪨 完成！${auth.user} — ${configured.length} 个平台已配置`);
    console.log("下次启动 AI 工具时，石板工具自动加载。");
  });

// ─── status ────────────────────────────────────────
program
  .command("status")
  .description("查看配置状态")
  .action(() => {
    const cwd = process.cwd();
    const auth = loadAuth();

    console.log("");
    console.log(auth ? `👤 ${auth.user}  ✅` : "👤 未登录  ❌");
    console.log("");

    const sd = join(cwd, ".slate");
    console.log(existsSync(sd) ? "📋 .slate/  ✅" : "📋 .slate/  ❌ (slate setup)");
    if (existsSync(sd)) {
      for (const f of ["identity.json", "intention.json", "foundation.json", "dependencies.json"]) {
        console.log(`   ${existsSync(join(sd, f)) ? "✅" : "⬚"} ${f}`);
      }
    }
    console.log("");

    const platforms = [
      [join(cwd, ".mcp.json"), "Claude Code"],
      [join(cwd, ".cursor", "mcp.json"), "Cursor"],
      [join(cwd, "openclaw.mcp.json"), "OpenClaw"],
    ] as const;
    let found = false;
    for (const [path, name] of platforms) {
      if (existsSync(path)) { console.log(`🔌 ${name}  ✅`); found = true; }
    }
    if (!found) console.log("🔌 未关联 AI 工具  ❌ (slate setup)");
    console.log("");
  });

// ─── login ─────────────────────────────────────────
program
  .command("login")
  .description("GitHub 设备流登录")
  .action(async () => {
    try {
      await deviceFlowLogin();
    } catch (e) {
      console.log(`❌ ${e instanceof Error ? e.message : String(e)}`);
      console.log("备选: gh auth login && slate setup");
    }
  });

// ─── detect ────────────────────────────────────────
const home = process.env.HOME || "~";

// ─── 平台 AI 指令模板 ─────────────────────────────
const slateWorkflow = `🪨 石板协议已激活。

你有 slate_search / slate_review / slate_read / slate_write / slate_publish / slate_claim 工具。

## 铁律
写任何新代码前，MUST 先调 slate_search 搜索 GitHub。不要重新发明轮子。

## 工作流
1. 搜索 → 评价 → 决定 → 记录 → 贡献
2. 搜到了→review→评分≥60就复用
3. 没搜到→自己写→写完了publish贡献回去`;

const cursorRules = slateWorkflow + "\n\n工具速查: slate_search(每次写新功能前强制) | slate_review(搜到候选时) | slate_read(看协议) | slate_write(更新状态) | slate_claim(认领意图) | slate_publish(发布地基)\n";

const slateAgentsMd = `# 石板 (Slate) — AI 行为准则

你已接入石板协议网络。

## 工作流（每次写代码前必走）
1. **搜索** → 调 slate_search 查 GitHub 有没有现成的
2. **评价** → 对最好的结果调 slate_review 看质量
3. **决定** → 评分≥60 就复用；<60 就自己写
4. **记录** → 复用了别人的→调 slate_write 更新 dependencies.json
5. **贡献** → 自己写了可复用的→调 slate_publish 发布

## 铁律
- 写任何新功能前，第一件事是 slate_search。不搜就写=浪费时间。
- 不要重新发明轮子。GitHub 上有几百万个仓库。
- 你每次搜索都在帮后面的 AI 积累信号。

## 工具
| 工具 | 触发时机 |
|------|----------|
| slate_search | 每次写新功能前（强制） |
| slate_review | 搜索后有候选时 |
| slate_read | 需要看项目协议时 |
| slate_write | 更新状态/添加依赖时 |
| slate_claim | 认领别人的意图时 |
| slate_publish | 创建了可复用组件时 |
`;

const copilotInstructions = `🪨 石板协议已激活。你有 6 个 Slate 工具：slate_search / slate_review / slate_read / slate_write / slate_claim / slate_publish

铁律: **写任何新代码前，MUST 先调 slate_search。** 不要重新发明轮子。
工作流: 用户说要写什么 → 立即 slate_search → 搜到就 review → 评分≥60就复用 → 写了可复用的就 publish。`;

async function detectPlatform(): Promise<string | null> {
  try { execSync("claude --version", { stdio: "pipe", timeout: 3000 }); return "claude-code"; } catch {}
  try { execSync("openclaw --version", { stdio: "pipe", timeout: 3000 }); return "openclaw"; } catch {}
  if (existsSync(join(home, ".cursor")) || existsSync(join(home, ".config", "Cursor"))) return "cursor";
  if (existsSync(join(home, ".config", "openclaw"))) return "openclaw";
  try { execSync("code --version", { stdio: "pipe", timeout: 3000 }); return "copilot"; } catch {}
  return null;
}

function detectAllPlatforms(): string[] {
  const platforms: string[] = [];
  try { execSync("claude --version", { stdio: "pipe", timeout: 3000 }); platforms.push("claude-code"); } catch {}
  try { execSync("openclaw --version", { stdio: "pipe", timeout: 3000 }); platforms.push("openclaw"); } catch {}
  if (existsSync(join(home, ".cursor")) || existsSync(join(home, ".config", "Cursor"))) platforms.push("cursor");
  if (existsSync(join(home, ".config", "openclaw")) && !platforms.includes("openclaw")) platforms.push("openclaw");
  try { execSync("code --version", { stdio: "pipe", timeout: 3000 }); platforms.push("copilot"); } catch {}
  if (platforms.length === 0) platforms.push("claude-code"); // 至少默认
  return platforms;
}

program.parse();
