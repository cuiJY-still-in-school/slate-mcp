/**
 * slate_claim — 认领意图
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGitHubUsername } from "../github/index.js";
import { execSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function registerSlateClaim(server: McpServer): void {
  server.tool(
    "slate_claim",
    `Claim an open intention from the global Slate network.

WHAT THIS DOES:
1. Reads the intention.json to verify it's "open"
2. Forks the repository to your GitHub account
3. Updates status to "claimed" with your username
4. Creates a Pull Request to the original repo

WHEN TO USE: After slate_search finds an open intention you want to build.

PREREQUISITES: GitHub CLI must be authenticated (gh auth login).`,
    {
      repo: z.string().describe("Repository to claim, e.g. 'owner/repo'. Must have .slate/intention.json with status 'open'."),
    },
    async ({ repo }) => {
      try {
        const username = await getGitHubUsername();
        if (!username) {
          return { content: [{ type: "text", text: "❌ 未登录 GitHub。运行 gh auth login 后重试。" }], isError: true };
        }

        // Verify intention
        const res = await fetch(`https://raw.githubusercontent.com/${repo}/refs/heads/main/.slate/intention.json`);
        if (!res.ok) return { content: [{ type: "text", text: `❌ ${repo} 没有 .slate/intention.json` }], isError: true };
        const data = await res.json() as Record<string, unknown>;
        if (data.status !== "open") return { content: [{ type: "text", text: `❌ 意图状态是 "${data.status}"，只有 open 状态可以认领` }], isError: true };

        // Fork via REST API (兼容旧版 gh CLI)
        const forkResult = execSync(`gh api repos/${repo}/forks -X POST -f default_branch_only=true`, {
          encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000,
        });
        const fork = JSON.parse(forkResult.trim());
        const forkOwner = fork.owner?.login || username;
        const forkRepo = fork.full_name || `${forkOwner}/${repo.split("/")[1]}`;

        // Update + commit
        data.status = "claimed"; data.claimed_by = forkOwner;
        const tmp = join(process.cwd(), ".slate-claim-tmp");
        execSync(`gh repo clone "${forkRepo}" "${tmp}"`, { stdio: ["pipe", "pipe", "pipe"], timeout: 30000 });
        const slateDir = join(tmp, ".slate");
        if (!existsSync(slateDir)) mkdirSync(slateDir, { recursive: true });
        writeFileSync(join(slateDir, "intention.json"), JSON.stringify(data, null, 2) + "\n");
        // 确保 git 身份配置
        const gitEmail = process.env.GIT_AUTHOR_EMAIL || `${forkOwner}@users.noreply.github.com`;
        const gitName = process.env.GIT_AUTHOR_NAME || forkOwner;
        execSync(`cd "${tmp}" && git config user.email "${gitEmail}" && git config user.name "${gitName}" && git add . && git commit -m "slate: claim — ${data.summary}" && git push`, {
          stdio: ["pipe", "pipe", "pipe"], timeout: 30000,
        });

        // PR
        const prUrl = execSync(`cd "${tmp}" && gh pr create --repo "${repo}" --title "slate: claim" --body "🤖 Claimed by @${forkOwner}"`, {
          encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000,
        }).trim();
        try { execSync(`rm -rf "${tmp}"`); } catch {}

        return { content: [{ type: "text", text: [
          `✅ 已认领 ${repo}`,
          `认领人: @${forkOwner}`,
          `Fork: ${forkRepo}`,
          `PR: ${prUrl}`,
          ``,
          `下一步: clone 你的 fork，开始实现。完成后用 slate_write 更新状态为 "completed"。`,
        ].join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `❌ 认领失败: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );
}
