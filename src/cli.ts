/**
 * 石板 CLI
 *   slate        启动 MCP Server
 *   slate setup  配置 + GitHub 登录 + 关联 AI 工具
 *   slate login  单独 GitHub 登录
 */

import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { loadAuth, deviceFlowLogin } from "./auth/index.js";

const program = new Command();

program
  .name("slate")
  .description("🪨 石板 — 全球 AI 协作协议")
  .version("0.2.0");

// ─── 默认：MCP Server ──────────────────────────────
program
  .command("mcp", { isDefault: true })
  .description("启动 MCP Server")
  .action(async () => {
    const { startMcpServer } = await import("./mcp.js");
    await startMcpServer();
  });

// ─── setup：GitHub登录 + 配置 + 关联AI工具 ──────────
program
  .command("setup")
  .description("GitHub 登录 + 初始化石板 + 关联 AI 工具")
  .option("-p, --platform <p>", "claude-code | cursor | copilot")
  .action(async (opts) => {
    const cwd = process.cwd();

    // 1. GitHub 登录 — gh CLI 优先，否则设备流
    let auth = loadAuth();
    if (!auth) {
      try {
        const token = execSync("gh auth token", { encoding: "utf-8", stdio: ["pipe","pipe","pipe"], timeout: 5000 }).trim();
        if (token) {
          // 存下来供 MCP 工具使用
          const { saveAuth } = await import("./auth/index.js");
          const user = execSync("gh api user --jq .login", { encoding: "utf-8", stdio: ["pipe","pipe","pipe"], timeout: 5000 }).trim();
          saveAuth({ token, user, loginAt: new Date().toISOString(), method: "gh_cli" });
          auth = { token, user, loginAt: new Date().toISOString(), method: "gh_cli" };
        }
      } catch {
        console.log("🔐 需要 GitHub 登录");
        auth = await deviceFlowLogin();
      }
    }
    if (!auth) return;
    console.log(`👤 GitHub: ${auth.user}`);

    const user = auth.user;
    const slateDir = join(cwd, ".slate");
    if (!existsSync(slateDir)) {
      mkdirSync(slateDir, { recursive: true });
      writeFileSync(join(slateDir, "identity.json"), JSON.stringify({
        protocol: "slate/0.1", type: "standalone", owner: user,
        created: new Date().toISOString(),
      }, null, 2) + "\n");
      writeFileSync(join(slateDir, "dependencies.json"), JSON.stringify({ dependencies: [] }, null, 2) + "\n");
    }

    // 2. 选平台
    const platform = opts.platform || (await detectPlatform());
    if (!platform) {
      console.log("未检测到 AI 工具。指定: slate setup -p claude-code|cursor|copilot");
      return;
    }

    // 3. 写入 MCP 配置
    switch (platform) {
      case "claude-code": {
        const mcp = { mcpServers: { slate: { type: "stdio", command: "node", args: [join(cwd, "dist/index.js"), "mcp"] } } };
        writeFileSync(join(cwd, ".mcp.json"), JSON.stringify(mcp, null, 2) + "\n");
        console.log("✅ .mcp.json — Claude Code");
        break;
      }
      case "cursor": {
        const cursorDir = join(cwd, ".cursor");
        if (!existsSync(cursorDir)) mkdirSync(cursorDir);
        const mcp = { mcpServers: { slate: { type: "stdio", command: "node", args: [join(cwd, "dist/index.js"), "mcp"] } } };
        writeFileSync(join(cursorDir, "mcp.json"), JSON.stringify(mcp, null, 2) + "\n");
        console.log("✅ .cursor/mcp.json — Cursor");
        break;
      }
      case "copilot": {
        console.log("复制以下到 .vscode/settings.json:");
        console.log(JSON.stringify({ "github.copilot.mcp.servers": { slate: { command: "node", args: [join(cwd, "dist/index.js"), "mcp"] } } }, null, 2));
        break;
      }
    }

    console.log(`🪨 石板已配置 (owner: ${user}, platform: ${platform})`);
  });

// ─── login：单独登录 ──────────────────────────────
program
  .command("login")
  .description("GitHub 设备流登录")
  .action(async () => {
    try { await deviceFlowLogin(); } catch (e) {
      console.log(`❌ ${e instanceof Error ? e.message : String(e)}`);
      console.log("备选: gh auth login && slate setup");
    }
  });

async function detectPlatform(): Promise<string | null> {
  try { execSync("claude --version", { stdio: "pipe", timeout: 3000 }); return "claude-code"; } catch {}
  const home = process.env.HOME || "~";
  if (existsSync(join(home, ".cursor")) || existsSync(join(home, ".config", "Cursor"))) return "cursor";
  try { execSync("code --version", { stdio: "pipe", timeout: 3000 }); return "copilot"; } catch {}
  return null;
}

program.parse();
