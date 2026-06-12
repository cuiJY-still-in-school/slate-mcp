/**
 * slate_search — 搜索全球意图和地基
 *
 * 核心工具。在所有公开 GitHub 仓库中搜索石板协议文件。
 * 用 GitHub Code Search + Repo Search 双渠道，
 * 按 stars 自然排序返回。
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchGlobal, enrichQuality, type SearchResult } from "../github/index.js";

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return `未找到匹配的结果。
提示：换更通用的关键词试试。GitHub 和 npm 上的每一份代码都是潜在的"地基"。`;
  }

  const lines: string[] = [
    `找到 ${results.length} 个结果：\n`,
  ];

  for (const r of results) {
    const typeIcon = r.type === "intention" ? "💡意图" : "🧱地基";
    const sourceIcon = r.source === "npm" ? "📦npm" : "🐙GitHub";
    const score = r.qualityScore;
    const scoreStr = score ? ` 🏆${score}分` : "";
    const stats = [
      r.stars ? (r.source === "npm" ? `📥${(r.stars / 1000).toFixed(0)}k/月` : `⭐${r.stars}`) : "",
      r.openIssues !== undefined ? `🐛${r.openIssues}个issue` : "",
      r.license ? `📜${r.license}` : "",
    ].filter(Boolean).join(" · ");
    lines.push(`### ${typeIcon} [${r.repo}](${r.url}) ${sourceIcon}${scoreStr}`);
    if (r.description) lines.push(`> ${r.description}`);
    if (stats) lines.push(`${stats}`);
    if (r.updatedAt) lines.push(`更新: ${r.updatedAt.slice(0, 10)}`);
    if (r.suitableFor?.length) lines.push(`✅ 适合: ${r.suitableFor.join(" · ")}`);
    if (r.painPoints?.length) lines.push(`⚠️ 注意: ${r.painPoints.join(" · ")}`);
    lines.push("");
  }

  lines.push("——");
  lines.push("使用 `slate_review <owner/repo>` 深度分析任意仓库的质量。");
  lines.push("使用 `slate_publish` 发布你的代码到全球网络。");

  return lines.join("\n");
}

export function registerSlateSearch(server: McpServer): void {
  server.tool(
    "slate_search",
    `Search GitHub for Slate protocol intentions and foundations across ALL public repositories worldwide.

MUST BE USED when starting a new feature, when the user describes something to build, or before writing new code for a specific functionality. This tool finds existing reusable components (foundations) and open tasks (intentions) from the global Slate network.

The search scans:
1. All GitHub repositories with .slate/ protocol files
2. Repositories tagged with topic:slate-intention or topic:slate-foundation
3. npm registry packages with keywords:slate-foundation or slate-intention
Results from all sources are merged and ranked.

Use PROACTIVELY — search BEFORE coding. Keywords: build, create, add, implement, feature, component, function, page, library, module.`,
    {
      query: z.string().describe("What you're looking for. Describe the functionality in natural language, e.g. 'Stripe payment integration' or 'login form component'"),
      tech_stack: z.string().optional().describe("Relevant tech stack to narrow results, e.g. 'React, TypeScript, Tailwind'"),
      type: z.enum(["intention", "foundation", "both"]).optional().default("both").describe("Filter by Slate protocol type"),
    },
    async ({ query, tech_stack, type }) => {
      const searchQuery = tech_stack ? `${query} ${tech_stack}` : query;
      const results = await searchGlobal(searchQuery, type);
      // 为前5个结果补充质量信号
      const enriched = await Promise.all(
        results.slice(0, 5).map(r => enrichQuality(r).catch(() => r))
      );
      const rest = results.slice(5);
      return {
        content: [{ type: "text", text: formatResults([...enriched, ...rest]) }],
      };
    }
  );
}
