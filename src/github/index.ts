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
  repo: string;       // "owner/name" or npm package name
  owner: string;
  name: string;
  description: string;
  stars: number;      // GitHub stars or npm weekly downloads/100
  type: "intention" | "foundation";
  source: "github" | "npm";
  url: string;
  updatedAt: string;
}

/**
 * 全球搜索——不限于石板协议，搜 GitHub + npm 的全部公开资源。
 *
 * 三大渠道：
 * 1. GitHub Repo Search — 匹配 name/description/readme/topics，按 stars 排序
 * 2. GitHub Code Search — 搜 .slate/ 协议文件，精确匹配（加权）
 * 3. npm Registry — 搜索 npm 包（description/keywords）
 *
 * 每个 GitHub 仓库和 npm 包本身就是"地基"——AI 自己会判断是否可复用。
 * .slate/ 协议文件是锦上添花的结构化元数据。
 */
export async function searchGlobal(
  query: string,
  _type: "intention" | "foundation" | "both" = "both",
  limit = 20
): Promise<SearchResult[]> {
  const results: Map<string, SearchResult> = new Map();

  const addResult = (r: SearchResult) => {
    if (!results.has(r.repo)) results.set(r.repo, r);
  };

  // 渠道1: GitHub Repo Search（主渠道——搜所有仓库，不设协议门槛）
  try {
    const data = await githubApi(
      `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=${Math.min(limit, 10)}`
    );
    const items = (data?.items as Array<Record<string, unknown>>) || [];
    for (const item of items) {
      const itemTopics = (item.topics as string[]) || [];
      const hasSlate = itemTopics.some((t: string) => t.startsWith("slate-"));
      addResult({
        repo: item.full_name as string,
        owner: (item.owner as Record<string, string>)?.login || "",
        name: item.name as string,
        description: (item.description as string) || "",
        stars: (item.stargazers_count as number) || 0,
        source: "github",
        type: hasSlate ? (itemTopics.includes("slate-foundation") ? "foundation" : "intention") : "foundation",
        url: item.html_url as string,
        updatedAt: item.updated_at as string,
      });
    }
  } catch (e) { /* GitHub search 失败不影响其他渠道 */ }

  // 渠道2: GitHub Code Search — .slate/ 协议文件（加权补充）
  try {
    const q = `path:.slate/ ${query}`;
    const data = await githubApi(
      `/search/code?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 5)}`
    );
    const items = (data?.items as Array<Record<string, unknown>>) || [];
    for (const item of items) {
      const repo = item.repository as Record<string, unknown> | undefined;
      if (!repo) continue;
      const fileName = (item.name as string) || "";
      addResult({
        repo: repo.full_name as string,
        owner: (repo.owner as Record<string, string>)?.login || "",
        name: repo.name as string,
        description: (repo.description as string) || "",
        stars: ((repo.stargazers_count as number) || 0) + 1000, // 协议文件加权
        source: "github",
        type: fileName.includes("intention") ? "intention" : "foundation",
        url: repo.html_url as string,
        updatedAt: repo.updated_at as string,
      });
    }
  } catch (e) { /* code search 失败不影响 */ }

  // 渠道3: npm Registry（搜所有包，不限 slate keywords）
  try {
    const npmUrl = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`;
    const res = await fetch(npmUrl, { headers: { "User-Agent": "slate-protocol/0.1" } });
    if (res.ok) {
      const data = await res.json() as {
        objects?: Array<{
          package: { name: string; description?: string; version: string; date: string; links: { npm: string } };
          score: { final: number };
        }>;
      };
      for (const obj of data.objects || []) {
        const pkg = obj.package;
        const owner = pkg.name.startsWith("@") ? pkg.name.split("/")[0].slice(1) : "npm";
        addResult({
          repo: `npm:${pkg.name}`,
          owner,
          name: pkg.name,
          description: pkg.description || "",
          stars: Math.round(obj.score.final * 1000),
          type: "foundation",
          source: "npm",
          url: pkg.links.npm,
          updatedAt: pkg.date,
        });
      }
    }
  } catch (e) { /* npm 搜索失败不影响 */ }

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
