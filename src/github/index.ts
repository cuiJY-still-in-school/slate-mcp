/**
 * GitHub API 层
 *
 * 全球石板网络的所有搜索、读取、写入都走这一层。
 * Token 获取委托给 auth 模块（石板登录 > 环境变量 > gh CLI）。
 */

import { execSync } from "node:child_process";
import { getToken } from "../auth/index.js";

// ─── 凭据 ───────────────────────────────────────────

/** 获取 GitHub 认证 token（委托给 auth 模块） */
export async function getGitHubToken(): Promise<string | null> {
  return getToken();
}

/** 获取当前 GitHub 用户名 */
export async function getGitHubUsername(): Promise<string | null> {
  try {
    const apiResult = await githubApi("/user");
    return (apiResult?.login as string) || null;
  } catch {
    try {
      // fallback: gh CLI
      const user = execSync("gh api user --jq .login", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      }).trim();
      return user || null;
    } catch {
      return null;
    }
  }
}

// ─── REST API ───────────────────────────────────────

const GITHUB_API = "https://api.github.com";

/** 调 GitHub REST API（自动带认证） */
async function githubApi(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<Record<string, unknown> | null> {
  const token = await getGitHubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "slate-protocol/0.1",
    ...opts.headers,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const init: RequestInit = { method: opts.method || "GET", headers };
  if (opts.body) {
    init.body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// ─── 搜索 ───────────────────────────────────────────

export interface SearchResult {
  repo: string;       // "owner/name"
  owner: string;
  name: string;
  description: string;
  stars: number;
  type: "intention" | "foundation";
  url: string;
  updatedAt: string;
}

/**
 * 全球搜索石板意图和地基
 *
 * 两大渠道：
 * 1. GitHub Code Search — 搜 .slate/ 文件内容
 * 2. GitHub Repo Search — 搜 topic:slate-intention / topic:slate-foundation
 *
 * 合并、去重、按 stars 排序返回。
 */
export async function searchGlobal(
  query: string,
  type: "intention" | "foundation" | "both" = "both",
  limit = 20
): Promise<SearchResult[]> {
  const results: Map<string, SearchResult> = new Map();

  const addResult = (r: SearchResult) => {
    if (!results.has(r.repo)) {
      results.set(r.repo, r);
    }
  };

  // 渠道1: Code Search — 搜 .slate/ 目录下的文件
  try {
    const types = type === "both"
      ? ["intention", "foundation"]
      : [type];
    for (const t of types) {
      const q = `path:.slate/${t}.json ${query}`;
      const data = await githubApi(
        `/search/code?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 10)}`
      );
      const items = (data?.items as Array<Record<string, unknown>>) || [];
      for (const item of items) {
        const repo = item.repository as Record<string, unknown> | undefined;
        if (!repo) continue;
        addResult({
          repo: repo.full_name as string,
          owner: (repo.owner as Record<string, string>)?.login || "",
          name: repo.name as string,
          description: (repo.description as string) || "",
          stars: (repo.stargazers_count as number) || 0,
          type: t as "intention" | "foundation",
          url: repo.html_url as string,
          updatedAt: repo.updated_at as string,
        });
      }
    }
  } catch (e) {
    console.error("Code search failed:", e);
  }

  // 渠道2: Repo Search — 搜 topic 标签
  try {
    const topics =
      type === "intention" ? "topic:slate-intention" :
      type === "foundation" ? "topic:slate-foundation" :
      "topic:slate-intention topic:slate-foundation";
    const q = `${topics} ${query}`;
    const data = await githubApi(
      `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=${Math.min(limit, 10)}`
    );
    const items = (data?.items as Array<Record<string, unknown>>) || [];
    for (const item of items) {
      // 自动归类：先检查 topic
      const itemTopics = (item.topics as string[]) || [];
      const itemType: "intention" | "foundation" =
        itemTopics.includes("slate-foundation") ? "foundation" : "intention";
      addResult({
        repo: item.full_name as string,
        owner: (item.owner as Record<string, string>)?.login || "",
        name: item.name as string,
        description: (item.description as string) || "",
        stars: (item.stargazers_count as number) || 0,
        type: itemType,
        url: item.html_url as string,
        updatedAt: item.updated_at as string,
      });
    }
  } catch (e) {
    console.error("Repo search failed:", e);
  }

  // 排序：按 stars 降序
  return [...results.values()].sort((a, b) => b.stars - a.stars).slice(0, limit);
}

// ─── 文件读取 ───────────────────────────────────────

/**
 * 从仓库读取 .slate/ 下的协议文件内容
 * 使用 GitHub Contents API，返回原始 JSON 文本
 */
export async function readProtocolFile(
  repo: string,
  file: "identity" | "intention" | "foundation" | "dependencies"
): Promise<string | null> {
  try {
    // 优先用 raw 路径（免 base64 解码）
    const rawUrl = `https://raw.githubusercontent.com/${repo}/refs/heads/main/.slate/${file}.json`;
    const res = await fetch(rawUrl, { headers: { "User-Agent": "slate-protocol/0.1" } });
    if (res.ok) {
      return await res.text();
    }
    // fallback: 试 master 分支
    const masterUrl = `https://raw.githubusercontent.com/${repo}/refs/heads/master/.slate/${file}.json`;
    const res2 = await fetch(masterUrl, { headers: { "User-Agent": "slate-protocol/0.1" } });
    if (res2.ok) {
      return await res2.text();
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Fork ──────────────────────────────────────────

/** Fork 一个仓库到当前用户 */
export async function forkRepo(repo: string): Promise<{ cloneUrl: string; owner: string } | null> {
  try {
    const result = execSync(
      `gh repo fork "${repo}" --clone=false --fork-name "${repo.split('/')[1]}" --json url,owner`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000 }
    );
    const parsed = JSON.parse(result.trim());
    return {
      cloneUrl: parsed.url || parsed.clone_url || `https://github.com/${parsed.owner?.login}/${repo.split("/")[1]}`,
      owner: parsed.owner?.login || "",
    };
  } catch (e) {
    console.error("Fork failed:", e);
    return null;
  }
}

// ─── 导出 ───────────────────────────────────────────

export { githubApi };
