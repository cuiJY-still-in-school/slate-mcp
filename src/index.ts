/**
 * 石板 (Slate) v0.1 — MCP Server
 *
 * 用法:
 *   npx @slate-protocol/slate-mcp mcp    MCP Server 模式（Claude Code 接入）
 *   slate login                           GitHub 登录
 *   slate whoami                          查看登录状态
 *
 * Claude Code 接入:
 *   claude mcp add slate -- npx @slate-protocol/slate-mcp mcp
 */

import { getToken } from "./auth/index.js";
import { deviceFlowLogin, patLogin, logout, whoami } from "./auth/index.js";

const cmd = process.argv[2];

async function main(): Promise<void> {
  switch (cmd) {
    case "login": {
      const tokenArg = process.argv[3];
      if (tokenArg === "--token" || tokenArg === "-t") {
        const token = process.argv[4];
        if (!token) {
          console.log("用法: slate login --token <personal-access-token>");
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

    case "mcp":
    case undefined:
    case "": {
      const { startMcpServer } = await import("./mcp.js");
      await startMcpServer();
      break;
    }

    case "--help":
    case "-h":
    case "help":
      console.log(`🪨 石板 (Slate) MCP v0.1

用法:
  slate mcp          启动 MCP Server（供 Claude Code 接入）
  slate login        GitHub 登录（OAuth 设备流）
  slate login -t <token>  使用 Personal Access Token 登录
  slate logout       退出登录
  slate whoami       查看当前登录用户

Claude Code 接入:
  claude mcp add slate -- npx @slate-protocol/slate-mcp mcp

项目级接入 (.mcp.json):
  { "mcpServers": { "slate": { "type": "stdio", "command": "npx", "args": ["@slate-protocol/slate-mcp", "mcp"] } } }
`);
      break;

    default:
      console.log(`未知命令: ${cmd}\nslate --help 查看帮助`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
