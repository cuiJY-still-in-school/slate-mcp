/**
 * 石板 (Slate) v0.1 — 入口
 *
 * 命令:
 *   slate              Vibecoding 终端（AI 编程 REPL）
 *   slate mcp          启动 MCP Server（供 Claude Code 等 AI 工具接入）
 *   slate login        GitHub 登录
 *   slate logout       退出登录
 *   slate whoami       查看登录状态
 */

import { getToken } from "./auth/index.js";
import { deviceFlowLogin, patLogin, logout, whoami } from "./auth/index.js";

const cmd = process.argv[2];

async function main(): Promise<void> {
  switch (cmd) {
    // ─── 登录 ───────────────────────────────────
    case "login": {
      const tokenArg = process.argv[3];
      if (tokenArg === "--token" || tokenArg === "-t") {
        const token = process.argv[4];
        if (!token) {
          console.log("用法: slate login --token <personal-access-token>");
          console.log("在 https://github.com/settings/tokens/new 创建 token（需要 repo, read:user 权限）");
          process.exit(1);
        }
        await patLogin(token);
      } else {
        try {
          await deviceFlowLogin();
        } catch (e) {
          console.log(`❌ ${e instanceof Error ? e.message : String(e)}`);
          console.log("\n备选方案: slate login --token <personal-access-token>");
          process.exit(1);
        }
      }
      break;
    }

    case "logout":
      logout();
      break;

    case "whoami":
      await whoami();
      break;

    // ─── MCP Server ─────────────────────────────
    case "mcp": {
      const { startMcpServer } = await import("./mcp.js");
      await startMcpServer();
      break;
    }

    // ─── Vibecoding REPL ────────────────────────
    case undefined:
    case "": {
      // 检查 API key
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.log("❌ 未设置 ANTHROPIC_API_KEY 环境变量");
        console.log("   export ANTHROPIC_API_KEY=sk-ant-...");
        console.log("\n或使用 MCP 模式接入 Claude Code:");
        console.log("   claude mcp add slate -- npx @slate-protocol/slate mcp");
        process.exit(1);
      }

      // GitHub token（可选，但 slate 协议功能需要）
      const githubToken = await getToken();
      if (!githubToken) {
        console.log("⚠️ 未登录 GitHub（石板协议功能受限）");
        console.log("   slate login         使用 GitHub OAuth 登录");
        console.log("   slate login --token  使用 Personal Access Token");
        console.log("");
      }

      const { startRepl } = await import("./cli/repl.js");
      const { ToolRegistry } = await import("./agent/loop.js");
      const config = {
        provider: {
          apiKey,
          model: process.env.SLATE_MODEL || "claude-sonnet-4-6",
        },
        tools: [],
        registry: new ToolRegistry(),
      };
      await startRepl(config);
      break;
    }

    // ─── 帮助 ───────────────────────────────────
    case "--help":
    case "-h":
    case "help":
      console.log(`🪨 石板 (Slate) v0.1

用法:
  slate              启动 Vibecoding 终端（AI 编程 REPL）
  slate mcp          启动 MCP Server（供 Claude Code 接入）
  slate login        GitHub 登录（OAuth 设备流）
  slate login -t <token>  使用 Personal Access Token 登录
  slate logout       退出登录
  slate whoami       查看当前登录用户

环境变量:
  ANTHROPIC_API_KEY  Anthropic API key（Vibecoding 模式必需）
  SLATE_MODEL        模型选择（默认: claude-sonnet-4-6）
  SLATE_CLIENT_ID    GitHub OAuth App client_id（可选）

MCP 模式接入 Claude Code:
  claude mcp add slate -- npx @slate-protocol/slate mcp
`);
      break;

    default:
      console.log(`未知命令: ${cmd}`);
      console.log("slate --help 查看帮助");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
