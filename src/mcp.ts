/**
 * MCP Server 模式
 *
 * 启动: slate mcp
 * Claude Code 接入: claude mcp add slate -- npx @slate-protocol/slate mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getToken } from "./auth/index.js";
import { registerSlateSearch } from "./tools/slate_search.js";
import { registerSlateRead } from "./tools/slate_read.js";
import { registerSlateWrite } from "./tools/slate_write.js";
import { registerSlateClaim } from "./tools/slate_claim.js";
import { registerSlatePublish } from "./tools/slate_publish.js";
import { registerSlateReview } from "./tools/slate_review.js";

const SERVER_NAME = "slate";
const SERVER_VERSION = "0.2.0";

export async function startMcpServer(): Promise<void> {
  const token = await getToken();
  const authStatus = token ? "✅ GitHub 已认证" : "⚠️ GitHub 未认证（运行 slate login）";

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // 注册所有石板工具
  registerSlateSearch(server);
  registerSlateRead(server);
  registerSlateWrite(server);
  registerSlateClaim(server);
  registerSlatePublish(server);
  registerSlateReview(server);

  // stdio 传输
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`🪨 石板 MCP Server v${SERVER_VERSION} — ${authStatus}`);
}
