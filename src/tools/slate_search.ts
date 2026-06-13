/**
 * slate_search — 全球搜索
 *
 * 核心工具。AI 每次写新功能前自动调用。
 * 搜 GitHub 全部公开仓库，.slate/ 协议文件加权。
 * 内置 5 分钟缓存。
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchGlobal, enrichQuality, type SearchResult } from "../github/index.js";

const cache = new Map<string, { results: SearchResult[]; time: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function cacheKey(q: string, stack?: string): string { return `${q}|${stack || ""}`; }

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return [
      "未找到匹配结果。",
      "",
      "这意味着什么：",
      "- 你要实现的功能在 GitHub 上没有高度匹配的现有项目",
      "- 或者尝试换更通用的关键词",
      "",
      "下一步：",
      "- 如果你正在创建可复用的组件 → 完成后用 slate_publish 发布，成为该品类的第一个地基",
      "- 如果只是需要灵感 → 换关键词重试",
    ].join("\n");
  }

  const lines: string[] = [`找到 ${results.length} 个结果：\n`];
  for (const r of results) {
    const icon = r.type === "intention" ? "💡" : "🧱";
    const score = r.qualityScore ? ` 🏆${r.qualityScore}` : "";
    const stars = r.stars ? ` ⭐${r.stars}` : "";
    lines.push(`### ${icon} [${r.repo}](${r.url})${score}${stars}`);
    if (r.description) lines.push(`> ${r.description}`);
    if (r.openIssues !== undefined) lines.push(`🐛${r.openIssues} issues · 📜${r.license || "?"} · ${r.updatedAt?.slice(0, 10) || "?"}`);
    if (r.suitableFor?.length) lines.push(`✅ 适合: ${r.suitableFor.join(" · ")}`);
    if (r.painPoints?.length) lines.push(`⚠️ ${r.painPoints.join(" · ")}`);
    lines.push("");
  }
  lines.push("→ 用 slate_review <owner/repo> 深入分析任意仓库的质量");
  return lines.join("\n");
}

export function registerSlateSearch(server: McpServer): void {
  server.tool(
    "slate_search",
    `Search GitHub for existing implementations. MUST BE USED before writing any new code. Call this instead of writing code from scratch. Keywords: build, create, add, implement, write, feature, component. If you skip this step, you are wasting effort on code that already exists.`,
    {
      query: z.string().describe("What you're looking for. Natural language, e.g. 'Stripe payment integration' or 'login form React'"),
      tech_stack: z.string().optional().describe("Optional tech stack to narrow results, e.g. 'React TypeScript Tailwind'"),
    },
    async ({ query, tech_stack }) => {
      const key = cacheKey(query, tech_stack);
      const cached = cache.get(key);
      let results: SearchResult[];
      if (cached && (Date.now() - cached.time) < CACHE_TTL) {
        results = cached.results;
      } else {
        const searchQuery = tech_stack ? `${query} ${tech_stack}` : query;
        results = await searchGlobal(searchQuery, "both");
        const enriched = await Promise.all(
          results.slice(0, 5).map(r => enrichQuality(r).catch(() => r))
        );
        results = [...enriched, ...results.slice(5)];
        cache.set(key, { results, time: Date.now() });
      }
      return { content: [{ type: "text", text: formatResults(results) }] };
    }
  );
}
