/**
 * slate_review — 深度分析仓库/包的质量
 *
 * 读 GitHub Issues（人类写的评论）、commit 活跃度、npm 下载量、
 * README、代码注释——把程序员的所有非正式文本都作为评价信号。
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRepoActivity, enrichQuality, analyzeSuitability, type SearchResult } from "../github/index.js";

function formatReview(result: SearchResult, activity: Awaited<ReturnType<typeof getRepoActivity>>): string {
  const name = result.repo;
  const source = result.source === "npm" ? "📦npm" : "🐙GitHub";

  const lines = [
    `# 📋 质量评估: ${name}`,
    ``,
    `**来源**: ${source}`,
    `**描述**: ${result.description || "无"}`,
    `**评分**: ${"⭐".repeat(Math.round((result.qualityScore || 50) / 20))} (${result.qualityScore || "?"}/100)`,
    ``,
  ];

  if (result.license) lines.push(`**许可证**: ${result.license}`);
  if (result.lastCommitAt) lines.push(`**最近推送**: ${result.lastCommitAt}`);
  if (result.npmDownloads) lines.push(`**月下载量**: ${result.npmDownloads.toLocaleString()}`);

  if (activity) {
    lines.push("");
    lines.push("## 社区活跃度");
    lines.push(`- Open Issues: ${activity.openIssues}`);
    lines.push(`- 已关闭 Issues: ${activity.closedIssues}`);
    lines.push(`- 开放 PRs: ${activity.openPRs}`);
    const healthEmoji = activity.healthLabel === "healthy" ? "🟢" :
      activity.healthLabel === "moderate" ? "🟡" : activity.healthLabel === "neglected" ? "🔴" : "⚪";
    lines.push(`- 健康度: ${healthEmoji} ${activity.healthLabel}`);

    if (activity.recentIssueTitles.length > 0) {
      lines.push("");
      lines.push("## 最近 Issues（程序员写的真实评价）");
      for (const title of activity.recentIssueTitles) {
        lines.push(`- "${title}"`);
      }
      lines.push("");
      lines.push("> Issues 是最真实的代码评价——每个 issue 都是程序员在生产环境中遇到的问题。");
    }
  }

  // 适合做什么
  if (result.suitableFor?.length) {
    lines.push("");
    lines.push("## ✅ 适合做什么");
    for (const s of result.suitableFor) lines.push(`- ${s}`);
  }
  if (result.painPoints?.length) {
    lines.push("");
    lines.push("## ⚠️ 注意事项");
    for (const p of result.painPoints) lines.push(`- ${p}`);
  }

  // 综合建议
  lines.push("");
  lines.push("## 建议");
  const score = result.qualityScore || 50;
  if (score >= 80) {
    lines.push("✅ **推荐使用** — 高质量，活跃维护，社区健康。");
  } else if (score >= 50) {
    lines.push("⚠️ **可以使用但注意** — 质量中等，检查最近的 issues 是否有阻塞性问题。");
  } else if (score >= 30) {
    lines.push("🔴 **谨慎使用** — 项目不太活跃或 issue 堆积较多。");
  } else {
    lines.push("❌ **不建议使用** — 质量信号弱。考虑寻找替代方案。");
  }

  return lines.join("\n");
}

export function registerSlateReview(server: McpServer): void {
  server.tool(
    "slate_review",
    `Deep quality assessment of a GitHub repository or npm package.

Analyzes: GitHub Issues (real programmer feedback), commit activity,
open/closed issue ratio, PR health, npm download counts, license,
and overall project health.

Issue titles and comments are treated as the most authentic form of code review —
they represent real problems encountered by real developers in production.

Use this tool AFTER slate_search to evaluate whether a foundation is
high-quality enough to depend on.`,
    {
      repo: z.string().describe("Repository 'owner/name' or npm package name to review"),
      source: z.enum(["github", "npm"]).optional().default("github").describe("Source type"),
    },
    async ({ repo, source }) => {
      try {
        // Build a minimal search result for enrichment
        const result: SearchResult = {
          repo: source === "npm" ? `npm:${repo}` : repo,
          owner: repo.split("/")[0],
          name: repo.split("/")[1] || repo,
          description: "",
          stars: 0,
          type: "foundation",
          source,
          url: source === "npm"
            ? `https://www.npmjs.com/package/${repo}`
            : `https://github.com/${repo}`,
          updatedAt: "",
        };

        // Enrich with quality signals + suitability analysis
        const enriched = await enrichQuality(result);
        await analyzeSuitability(enriched);

        // Get issue activity
        const activity = source === "github"
          ? await getRepoActivity(repo)
          : null;

        return {
          content: [{ type: "text", text: formatReview(enriched, activity) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `❌ 分析失败: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    }
  );
}
